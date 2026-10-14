"""
Description sanitizer for Pappu Assistant v2.
Data sanity check on description field after planning.
Drops the description if it equals or contains the full input sentence,
or contains amount digits plus a currency or spend verb pattern copied from the input.
"""

import re
from typing import Optional, Union
from decimal import Decimal

from app.assistant.schemas import Plan


CURRENCY_RE = re.compile(r"(₹|rs\.?|inr|rupees?|bucks|roopa)", re.IGNORECASE)

SPEND_VERB_RE = re.compile(
    r"\b(spent|spend|spending|paid|pay|paying|sent|send|giving|gives|gave|koduthu|thannu|vaangi|medichu|chlavazhichu)\b",
    re.IGNORECASE,
)

GENERIC_VERBS = {"spent", "spend", "paid", "pay", "expense", "added", "sent"}

DIGITS_RE = re.compile(r"\d+")


def sanitize_description(
    description: Optional[str],
    input_text: str,
    amount: Optional[Union[float, int, Decimal, str]] = None,
) -> Optional[str]:
    """
    Data sanity check on description field.
    Returns None if description:
    1. Equals or contains the full input sentence.
    2. Contains amount digits plus currency or spend verb pattern copied from the input.
    3. Is solely a generic spend verb.
    Otherwise returns the cleaned description string.
    """
    if not description or not str(description).strip():
        return None

    desc_raw = str(description).strip()
    desc_clean = re.sub(r"\s+", " ", desc_raw.lower())
    input_clean = re.sub(r"\s+", " ", input_text.strip().lower())

    # 1. Equals or contains full input sentence
    if desc_clean == input_clean or input_clean in desc_clean:
        return None

    # Compare with punctuation removed
    desc_no_punct = re.sub(r"[^\w\s]", "", desc_clean).strip()
    input_no_punct = re.sub(r"[^\w\s]", "", input_clean).strip()
    if desc_no_punct == input_no_punct or input_no_punct in desc_no_punct:
        return None

    # Check for solely generic spend verbs
    if desc_clean in GENERIC_VERBS or desc_no_punct in GENERIC_VERBS:
        return None

    # 2. Contains amount digits plus currency or spend verb pattern
    has_digits = bool(DIGITS_RE.search(desc_raw))
    has_currency = bool(CURRENCY_RE.search(desc_raw))
    has_spend_verb = bool(SPEND_VERB_RE.search(desc_raw))

    amt_digits = None
    if amount is not None:
        try:
            amt_digits = str(int(float(amount)))
        except (ValueError, TypeError):
            pass

    has_target_amt = bool(amt_digits and amt_digits in desc_raw)

    if (has_digits or has_target_amt) and (has_currency or has_spend_verb):
        return None

    if has_spend_verb and has_currency:
        return None

    return desc_raw


def sanitize_plan(plan: Plan, input_text: str) -> Plan:
    """
    Sanitizes descriptions across all actions in a planned Plan.
    """
    for action in plan.actions:
        if action.op == "add":
            amt = getattr(action, "amount", None)
            if hasattr(action, "description"):
                action.description = sanitize_description(action.description, input_text, amt)
        elif action.op == "edit":
            if hasattr(action, "patch") and action.patch:
                amt = action.patch.get("amount")
                if "description" in action.patch:
                    action.patch["description"] = sanitize_description(
                        action.patch["description"], input_text, amt
                    )
    return plan
