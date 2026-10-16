"""
Deterministic Response Composer for Pappu Assistant v2.

Generates user-facing reply_text and spoken_text from execution results,
pending items, and plans. Never calls an LLM.

Supports English (en), Malayalam (ml), and code-mixed Manglish (mixed).
Formats numbers in Indian currency format without trailing .00 on whole amounts.
Enforces Rule 9: Zero em dashes or hyphens used as punctuation.
"""

from decimal import Decimal
from datetime import datetime, date
from typing import List, Dict, Any, Optional, Union, Tuple, Literal
from app.assistant.schemas import Plan, Action, PendingSummary


def format_inr(amount: Union[float, int, Decimal, None]) -> str:
    """
    Formats a number into Indian currency format:
    e.g. 250 -> '₹250'
    2000 -> '₹2,000'
    150000 -> '₹1,50,000'
    Whole numbers omit .00.
    """
    if amount is None:
        return "₹0"

    val = round(float(amount), 2)
    is_whole = val.is_integer()
    if is_whole:
        s = str(int(val))
    else:
        s = f"{val:.2f}"

    parts = s.split(".")
    integer_part = parts[0]

    # Handle negative numbers
    is_negative = integer_part.startswith("-")
    if is_negative:
        integer_part = integer_part[1:]

    if len(integer_part) > 3:
        last_three = integer_part[-3:]
        remaining = integer_part[:-3]
        groups = []
        while len(remaining) > 2:
            groups.insert(0, remaining[-2:])
            remaining = remaining[:-2]
        if remaining:
            groups.insert(0, remaining)
        formatted_int = ",".join(groups) + "," + last_three
    else:
        formatted_int = integer_part

    prefix = "-₹" if is_negative else "₹"
    if is_whole:
        return f"{prefix}{formatted_int}"
    return f"{prefix}{formatted_int}.{parts[1]}"


def format_date_short(d_val: Union[str, date, datetime, None]) -> str:
    """
    Formats a date to a clean human string like '13 Oct' or '14 Oct 2026'.
    """
    if not d_val:
        return ""
    if isinstance(d_val, (date, datetime)):
        dt = d_val
    else:
        try:
            dt = date.fromisoformat(str(d_val).split("T")[0])
        except Exception:
            return str(d_val)

    # e.g. 13 Oct
    return f"{dt.day} {dt.strftime('%b')}"


def format_range_from_dates(
    d_from: Union[str, date, datetime, None],
    d_to: Union[str, date, datetime, None],
) -> str:
    """
    Formats a date range into a clean human string without hyphens as punctuation (Rule 9).
    Examples:
    - Same date: ' on 14 Oct'
    - Same month: ' from 5 to 11 Oct'
    - Different month: ' from 25 Sep to 5 Oct'
    - Lower bound only: ' since 5 Oct'
    - Upper bound only: ' until 11 Oct'
    """
    if not d_from and not d_to:
        return ""

    def _parse(val):
        if not val:
            return None
        if isinstance(val, (date, datetime)):
            return val.date() if isinstance(val, datetime) else val
        try:
            return date.fromisoformat(str(val).split("T")[0].strip())
        except Exception:
            return None

    dt_from = _parse(d_from)
    dt_to = _parse(d_to)

    if dt_from and dt_to:
        if dt_from == dt_to:
            return f" on {dt_from.day} {dt_from.strftime('%b')}"
        if dt_from.year == dt_to.year and dt_from.month == dt_to.month:
            return f" from {dt_from.day} to {dt_to.day} {dt_from.strftime('%b')}"
        return f" from {dt_from.day} {dt_from.strftime('%b')} to {dt_to.day} {dt_to.strftime('%b')}"
    elif dt_from:
        return f" since {dt_from.day} {dt_from.strftime('%b')}"
    elif dt_to:
        return f" until {dt_to.day} {dt_to.strftime('%b')}"
    return ""


def _compose_single_add(res: Dict[str, Any], lang: str) -> str:
    data = res.get("data") or {}
    kind = data.get("kind") or data.get("type") or "expense"
    amt = format_inr(data.get("amount", 0))
    cat = data.get("category_name") or data.get("category") or "expense"
    contact = data.get("contact_name") or data.get("contact")

    if contact or kind == "person" or cat == "People":
        person_flow = data.get("person_flow")
        direction = data.get("direction")
        is_received = direction == "received" or data.get("type") == "income"

        if person_flow == "repayment":
            if lang == "ml":
                return f"{contact} നിങ്ങൾക്ക് {amt} നൽകി എന്ന് രേഖപ്പെടുത്തി."
            elif lang == "mixed":
                return f"{contact} {amt} thannu എന്ന് രേഖപ്പെടുത്തി."
            return f"{contact} paid you {amt}."
        elif person_flow == "i_owe" or is_received:
            if lang == "ml":
                return f"{contact}ന് നൽകാനുള്ള {amt} ചേർത്തു."
            elif lang == "mixed":
                return f"{contact} nu kodukkaamulla {amt} add ചെയ്തു."
            return f"Noted: you owe {contact} {amt}."
        elif person_flow == "they_owe":
            if lang == "ml":
                return f"{contact} നൽകാനുള്ള {amt} ചേർത്തു."
            elif lang == "mixed":
                return f"{contact} tharaanulla {amt} add ചെയ്തു."
            return f"Noted: {contact} owes you {amt}."
        else:
            if lang == "ml":
                return f"{contact}ന് {amt} നൽകി എന്ന് രേഖപ്പെടുത്തി."
            elif lang == "mixed":
                return f"{amt} {contact} ന് sent ചെയ്തു."
            return f"{amt} sent to {contact}."

    elif kind == "income" or data.get("type") == "income":
        if lang == "ml":
            return f"{cat}ലേക്ക് {amt} വരുമാനമായി ചേർത്തു."
        elif lang == "mixed":
            return f"{amt} {cat} income ആയി add ചെയ്തു."
        return f"Added {amt} {cat} income."

    else:
        if lang == "ml":
            return f"{cat}ലേക്ക് {amt} ചേർത്തു."
        elif lang == "mixed":
            return f"{cat} ലേക്ക് {amt} add ചെയ്തു."
        return f"Added {amt} to {cat}."


def _compose_single_edit(res: Dict[str, Any], lang: str) -> str:
    data = res.get("data") or {}
    prev = data.get("previous") or {}
    amt_new = format_inr(data.get("amount", 0))
    amt_prev = format_inr(prev.get("amount", 0))
    contact = data.get("contact_name") or data.get("contact")
    cat = data.get("category_name") or data.get("category") or "Shopping"
    label = contact if contact and str(contact).strip() else cat

    dt_str = format_date_short(data.get("txn_date") or data.get("date") or prev.get("txn_date"))
    date_part = f" on {dt_str}" if dt_str else ""

    if prev and "amount" in prev and amt_prev != amt_new:
        if lang == "ml":
            return f"{label} {amt_prev}{date_part} എന്നത് {amt_new} ആക്കി മാറ്റി. മാറ്റം റദ്ദാക്കാൻ undo എന്ന് പറയുക."
        elif lang == "mixed":
            return f"{label} {amt_prev}{date_part} എന്നത് {amt_new} aakki maatti. Say undo to revert."
        return f"Changed {label} {amt_prev}{date_part} to {amt_new}. Say undo to revert."

    return f"Updated {label} transaction. Say undo to revert."


def _compose_single_delete(res: Dict[str, Any], lang: str) -> str:
    data = res.get("data") or {}
    contact = data.get("contact_name") or data.get("contact")
    cat = data.get("category_name") or data.get("category")
    amt_val = data.get("amount")
    amt = format_inr(amt_val) if amt_val is not None else ""
    dt_str = format_date_short(data.get("txn_date") or data.get("date"))
    is_income = str(data.get("type", "")).strip().lower() == "income"

    if contact and str(contact).strip():
        label = str(contact).strip()
    elif cat and str(cat).strip() and str(cat).strip().lower() not in ("people", "other", "expense", "income"):
        label = str(cat).strip()
    elif amt:
        label = "income" if is_income else "expense"
    else:
        return "Deleted transaction."

    date_part = f" on {dt_str}" if dt_str else ""
    if amt:
        return f"Deleted {label} {amt}{date_part}."
    return f"Deleted {label}{date_part}."


def _compose_single_query(res: Dict[str, Any], lang: str) -> Tuple[str, str]:
    data = res.get("data") or {}
    q_kind = res.get("status") or data.get("query_kind") or res.get("action") or "list"
    if q_kind == "query":
        q_kind = res.get("status") or data.get("query_kind", "list")

    if q_kind == "balances":
        per_contact = data.get("balances") or data.get("per_contact") or []
        if not per_contact:
            side = data.get("balance_side") or "all"
            if side == "owed_to_me":
                if lang == "ml":
                    empty_msg = "ഇപ്പോൾ ആരും നിങ്ങൾക്ക് പണം തരാനില്ല."
                elif lang == "mixed":
                    empty_msg = "Aarum ningalkku paisa tharaanilla."
                else:
                    empty_msg = "Nobody owes you anything right now."
            elif side == "i_owe":
                if lang == "ml":
                    empty_msg = "നിങ്ങൾ ആർക്കും പണം കൊടുക്കാനില്ല."
                elif lang == "mixed":
                    empty_msg = "Ningal aarkkum paisa kodukkaanilla."
                else:
                    empty_msg = "You do not owe anyone anything right now."
            else:
                if lang == "ml":
                    empty_msg = "ബാക്കി ഇടപാടുകൾ ഒന്നുമില്ല."
                elif lang == "mixed":
                    empty_msg = "Baakki idapaadukal onnumilla."
                else:
                    empty_msg = "No outstanding balances right now."
            return empty_msg, empty_msg

        sentences = []
        for c in per_contact:
            name = c.get("contact_name") or c.get("name")
            net = float(c.get("net_balance", 0))
            if net > 0:
                sentences.append(f"{name} owes you {format_inr(net)}.")
            elif net < 0:
                sentences.append(f"You owe {name} {format_inr(abs(net))}.")
            else:
                sentences.append(f"Settled up with {name}.")

        full_text = " ".join(sentences)
        return full_text, full_text

    elif q_kind == "category_breakdown":
        cats = data.get("categories") or []
        filters = data.get("filters_used") or {}
        is_all_time = filters.get("is_all_time") or filters.get("period") == "all_time"
        if is_all_time:
            range_str = " all time"
        else:
            range_str = format_range_from_dates(
                filters.get("resolved_date_from") or filters.get("date_from"),
                filters.get("resolved_date_to") or filters.get("date_to"),
            )
        if not cats:
            msg = f"No spending found{range_str}."
            return msg, msg

        items = [f"{c['category']} {format_inr(c['total'])}" for c in cats]
        full_reply = f"Spending by category{range_str}: " + ", ".join(items) + "."
        top3 = items[:3]
        spoken_reply = f"Top spending{range_str}: " + ", ".join(top3) + "."
        return full_reply, spoken_reply

    elif q_kind == "sum":
        total_val = data.get("sum", data.get("total", 0))
        count_val = data.get("count", 0)
        filters = data.get("filters_used") or {}
        # If user queried for a specific amount/threshold and no match was found
        has_amt_filter = (
            filters.get("amount") is not None
            or filters.get("amount_min") is not None
            or filters.get("amount_max") is not None
        )
        if count_val == 0 and total_val == 0 and has_amt_filter:
            msg = _compose_resolver_none(filters, lang)
            return msg, msg

        total = format_inr(total_val)
        cat = data.get("category") or filters.get("category")
        direction = filters.get("direction")
        range_str = format_range_from_dates(
            filters.get("resolved_date_from") or filters.get("date_from"),
            filters.get("resolved_date_to") or filters.get("date_to"),
        )
        if direction == "received":
            if cat:
                txt = f"Total {cat} income is {total}{range_str}."
            elif range_str:
                txt = f"Received {total}{range_str}."
            else:
                txt = f"Total received is {total}."
        else:
            if cat:
                txt = f"Total {cat} spending is {total}{range_str}."
            elif range_str:
                txt = f"Spent {total}{range_str}."
            else:
                txt = f"Total is {total}."
        return txt, txt

    elif q_kind == "count":
        cnt = data.get("count", 0)
        filters = data.get("filters_used") or {}
        range_str = format_range_from_dates(
            filters.get("resolved_date_from") or filters.get("date_from"),
            filters.get("resolved_date_to") or filters.get("date_to"),
        )
        noun = "transaction" if cnt == 1 else "transactions"
        txt = f"Found {cnt} {noun}{range_str}."
        return txt, txt

    elif q_kind == "biggest":
        row = data.get("biggest") or data.get("transaction")
        filters = data.get("filters_used") or {}
        range_str = format_range_from_dates(
            filters.get("resolved_date_from") or filters.get("date_from"),
            filters.get("resolved_date_to") or filters.get("date_to"),
        )
        if not row:
            msg = f"No transactions found{range_str}."
            return msg, msg
        amt = format_inr(row.get("amount", 0))
        cat = row.get("category_name") or row.get("category") or "Food"
        dt = format_date_short(row.get("txn_date"))
        date_part = f" on {dt}" if dt else ""
        txt = f"Biggest transaction is {amt} {cat}{date_part}."
        return txt, txt

    elif q_kind == "compare":
        # e.g. "This month ₹8,200, last month ₹6,900, up ₹1,300."
        p1_total = format_inr(data.get("sum_1", data.get("period1_total", 0)))
        p2_total = format_inr(data.get("sum_2", data.get("period2_total", 0)))
        diff = float(data.get("delta", data.get("difference", 0)))
        diff_str = format_inr(abs(diff))
        direction = "up" if diff >= 0 else "down"

        p1_lbl = data.get("period1_label", "This month")
        p2_lbl = data.get("period2_label", "last month")
        f1 = data.get("filters_used_1") or {}
        f2 = data.get("filters_used_2") or {}
        r1 = format_range_from_dates(f1.get("resolved_date_from"), f1.get("resolved_date_to"))
        r2 = format_range_from_dates(f2.get("resolved_date_from"), f2.get("resolved_date_to"))

        txt = f"{p1_lbl}{r1} {p1_total}, {p2_lbl}{r2} {p2_total}, {direction} {diff_str}."
        return txt, txt

    elif q_kind == "list":
        rows = data.get("transactions") or []
        filters = data.get("filters_used") or {}
        if not rows:
            msg = _compose_resolver_none(filters, lang)
            return msg, msg

        range_str = format_range_from_dates(
            filters.get("resolved_date_from") or filters.get("date_from"),
            filters.get("resolved_date_to") or filters.get("date_to"),
        )
        items = []
        for r in rows:
            amt = format_inr(r.get("amount", 0))
            cat = r.get("category_name") or r.get("category") or ""
            dt = format_date_short(r.get("txn_date"))
            items.append(f"{amt} {cat} on {dt}".strip())

        full_reply = f"Found {len(rows)} transactions{range_str}: " + ", ".join(items) + "."
        # Spoken text speaks the top 3 only
        top3 = items[:3]
        spoken_reply = f"Top transactions{range_str}: " + ", ".join(top3) + "."
        return full_reply, spoken_reply

    return "Query completed.", "Query completed."


def _compose_single_undo(res: Dict[str, Any], lang: str) -> str:
    if res.get("ok"):
        if lang == "ml":
            return "അവസാനത്തെ പ്രവർത്തനം റദ്ദാക്കി."
        elif lang == "mixed":
            return "Last action undo ചെയ്തു."
        return "Undone last action."
    return "Nothing to undo."


def _compose_resolver_none(filters: Optional[Dict[str, Any]], lang: str) -> str:
    if not filters:
        return "Transaction not found."

    unknown_c = filters.get("unknown_contact")
    if unknown_c:
        if lang == "ml":
            return f"{unknown_c} എന്ന പേരിൽ ഒരു കോൺടാക്റ്റ് എനിക്കറിയില്ല."
        elif lang == "mixed":
            return f"{unknown_c} enna peril oru contact enikkariyilla."
        return f"I don't know a contact named {unknown_c}."

    # Edge case: "it" or "last_touched" with no previous transaction
    if filters.get("ref") == "last_touched":
        return "I don't know which transaction you mean."

    cat = filters.get("category")
    amt = filters.get("amount")
    contact = filters.get("contact")
    direction = filters.get("direction")
    is_income = direction == "received" or filters.get("type") == "income"
    is_all_time = filters.get("is_all_time") or filters.get("period") == "all_time"

    if is_all_time:
        range_str = " all time"
    else:
        d_from = filters.get("resolved_date_from") or filters.get("date_from") or filters.get("date")
        d_to = filters.get("resolved_date_to") or filters.get("date_to") or filters.get("date")
        range_str = format_range_from_dates(d_from, d_to)

    parts = []
    if cat:
        type_word = "income" if is_income else "expense"
        parts.append(f"{cat} {type_word}")
    elif contact:
        parts.append(f"{contact} transaction")
    elif amt is not None:
        type_word = "income" if is_income else "expense"
        parts.append(f"{type_word}")
    else:
        parts.append("transactions")

    if amt is not None:
        parts.append(f"of {format_inr(amt)}")

    if cat and contact:
        parts.append(f"with {contact}")

    desc = " ".join(parts)

    if range_str:
        return f"No {desc}{range_str}."

    if desc == "transactions":
        return "No transactions found."
    return f"No {desc} found."


def compose_reply(
    plan: Optional[Plan],
    results: List[Dict[str, Any]],
    pending: Optional[PendingSummary] = None,
    language: str = "en",
    filters_used: Optional[Dict[str, Any]] = None,
) -> Tuple[str, str]:
    """
    Main composer function. Returns (reply_text, spoken_text).
    Guarantees deterministic, beautifully phrased template output.
    """
    lang = (language or "en").lower()
    if lang not in ("en", "ml", "mixed"):
        lang = "en"

    # 1. Active Pending Item takes precedence for question asking
    if pending:
        if pending.kind == "confirm":
            q = pending.question
            return q, q
        elif pending.kind == "disambiguate":
            candidates = pending.candidates or []
            if candidates:
                cand_strs = []
                for idx, c in enumerate(candidates, 1):
                    amt = format_inr(c.get("amount", 0))
                    cat = c.get("category_name") or c.get("category") or ""
                    dt = format_date_short(c.get("date") or c.get("txn_date"))
                    cand_strs.append(f"{idx}) {cat} {amt} on {dt}".strip())
                reply = "Which one? " + ", ".join(cand_strs)
                # Spoken text speaks options concisely
                spoken = "Which one? " + ", ".join(cand_strs[:3])
                return reply, spoken
            return pending.question, pending.question
        elif pending.kind == "contact_confirm":
            return pending.question, pending.question

    # 2. Check for Plan-level Clarify or Chat
    if plan and plan.actions:
        first_act = plan.actions[0]
        if first_act.op == "clarify":
            q = first_act.question or "Could you clarify that?"
            return q, q

        elif first_act.op == "chat":
            kind = first_act.kind
            if kind == "greeting":
                g = "Hello! How can I help you manage your expenses today?"
                if lang == "ml":
                    g = "നമസ്കാരം! നിങ്ങളുടെ ചിലവുകൾ കൈകാര്യം ചെയ്യാൻ ഞാൻ എങ്ങനെ സഹായിക്കണം?"
                elif lang == "mixed":
                    g = "Hello! Expense track cheyyaan njan engane sahayikkannam?"
                return g, g
            elif kind == "help":
                h = "I can help you track expenses, check balances, and search transactions. For example, say 'Spent 250 on lunch' or 'Who owes me money'."
                return h, h
            elif kind == "off_topic":
                ot = "I can only help with your money."
                if lang == "ml":
                    ot = "പണവുമായി ബന്ധപ്പെട്ട കാര്യങ്ങളിൽ മാത്രമേ എനിക്ക് സഹായിക്കാൻ കഴിയൂ."
                elif lang == "mixed":
                    ot = "Paisa sambandhichulla karyangalil maathrame enikku sahayikkaan kazhiyu."
                return ot, ot
            elif kind == "unsupported":
                u = "Budgets are not available yet."
                return u, u
            elif kind == "unsupported_bulk":
                ub = "I can't delete everything at once. Tell me which transaction to delete."
                if lang == "ml":
                    ub = "എല്ലാം ഒരുമിച്ച് ഒഴിവാക്കാൻ കഴിയില്ല. ഏത് ഇടപാടാണ് ഒഴിവാക്കേണ്ടത് എന്ന് പറയൂ."
                elif lang == "mixed":
                    ub = "Ellaam orumichu ozhivaakkaan kazhiyilla. Ethe idapaadaanu ozhivaakkendathu ennu parayu."
                return ub, ub

    # 3. Process Execution Results
    if not results:
        # Check if resolver found nothing
        msg = _compose_resolver_none(filters_used, lang)
        return msg, msg

    success_sentences: List[str] = []
    failure_sentences: List[str] = []
    spoken_sentences: List[str] = []

    for r in results:
        ok = r.get("ok", False)
        act = r.get("action", "")

        if ok:
            if act == "add":
                sent = _compose_single_add(r, lang)
                success_sentences.append(sent)
                spoken_sentences.append(sent)
            elif act == "edit":
                sent = _compose_single_edit(r, lang)
                success_sentences.append(sent)
                spoken_sentences.append(sent)
            elif act == "delete":
                sent = _compose_single_delete(r, lang)
                success_sentences.append(sent)
                spoken_sentences.append(sent)
            elif act in ("query", "balances", "sum", "count", "biggest", "compare", "list"):
                full_s, spk_s = _compose_single_query(r, lang)
                success_sentences.append(full_s)
                spoken_sentences.append(spk_s)
            elif act == "undo":
                sent = _compose_single_undo(r, lang)
                success_sentences.append(sent)
                spoken_sentences.append(sent)
            else:
                success_sentences.append("Operation completed.")
                spoken_sentences.append("Operation completed.")
        else:
            err = r.get("error") or "Failed to process"
            filters = r.get("filters_used") or filters_used
            if (filters and filters.get("unknown_contact")) or "unknown contact" in err.lower():
                sent = _compose_resolver_none(filters, lang)
                failure_sentences.append(sent)
            elif "not found" in err.lower():
                sent = _compose_resolver_none(filters, lang)
                failure_sentences.append(sent)
            elif "disambiguation" in err.lower():
                failure_sentences.append("Multiple transactions matched.")
            elif "nothing is waiting for confirmation" in err.lower() or r.get("action") == "answer_pending":
                failure_sentences.append("Nothing is waiting for confirmation.")
            else:
                target = r.get("action", "transaction")
                failure_sentences.append(f"I couldn't record {target} because {err}.")

    # Combine multi-action sentences
    full_parts = []
    if success_sentences:
        if len(success_sentences) == 1:
            full_parts.append(success_sentences[0])
        else:
            combined = " and ".join(s.rstrip(".") for s in success_sentences) + "."
            full_parts.append(combined)
    if failure_sentences:
        full_parts.append(" ".join(failure_sentences))

    reply_text = " ".join(full_parts) if full_parts else "Done."

    spoken_parts = []
    if spoken_sentences:
        if len(spoken_sentences) == 1:
            spoken_parts.append(spoken_sentences[0])
        else:
            combined_spk = " and ".join(s.rstrip(".") for s in spoken_sentences) + "."
            spoken_parts.append(combined_spk)
    if failure_sentences:
        spoken_parts.append(" ".join(failure_sentences))

    spoken_text = " ".join(spoken_parts) if spoken_parts else "Done."

    return reply_text, spoken_text


def derive_mood(
    results: Optional[List[Dict[str, Any]]] = None,
    plan: Optional[Any] = None,
    pending: Optional[Any] = None,
) -> Literal["neutral", "happy", "excited", "concerned", "confused"]:
    """
    Derives Pappu mascot mood from result kinds and pending kind only.
    - Pending kinds confirm, contact_confirm and disambiguation give concerned
    - Expense added is happy
    - Income added is excited
    - Unsupported or clarify is confused
    - Everything else is neutral
    """
    # 1. Unsupported or Clarify -> confused
    if plan and getattr(plan, "actions", None):
        for act in plan.actions:
            if getattr(act, "op", None) == "clarify":
                return "confused"
            if getattr(act, "op", None) == "chat" and getattr(act, "kind", None) in ("unsupported", "unsupported_bulk"):
                return "confused"

    if results:
        for r in results:
            err = str(r.get("error") or "").lower()
            if "unsupported" in err or "budget" in err or "clarify" in err:
                return "confused"
            if r.get("action") == "clarify":
                return "confused"

    # 2. Pending kinds confirm, contact_confirm, and disambiguation -> concerned
    if pending:
        p_kind = getattr(pending, "kind", None) or (pending.get("kind") if isinstance(pending, dict) else None)
        if p_kind:
            p_kind_str = str(p_kind).strip().lower()
            if p_kind_str in ("confirm", "contact_confirm", "disambiguation", "disambiguate"):
                return "concerned"

    if results:
        for r in results:
            if r.get("status") in ("needs_confirmation", "contact_confirm") or r.get("needs_confirmation"):
                return "concerned"

    # 3. Income added -> excited
    # 4. Expense added -> happy
    if results:
        for r in results:
            if r.get("ok") and r.get("action") == "add":
                data = r.get("data") or {}
                t_type = str(data.get("type") or r.get("type") or "").lower()
                if t_type == "income":
                    return "excited"
                elif t_type in ("expense", "sent"):
                    return "happy"
                direction = str(data.get("direction") or r.get("direction") or "").lower()
                if direction == "received":
                    return "excited"
                elif direction == "sent":
                    return "happy"
                return "happy"

    return "neutral"
