"""
Single shared module defining the system-wide definition of spending.

Rule:
Spending means transaction type 'expense', excluding the 'People' category
unless the user explicitly asks about a person or about money sent.
Biggest expense uses this definition, so it can never return income.
The same rule applies to sum, biggest, group by / category breakdown, and the Home dashboard summary.
"""

from typing import Any, Optional
from app.models.transaction import Transaction


def is_spending_txn(
    txn: Any,
    allow_people: bool = False,
) -> bool:
    """
    Evaluates whether a transaction model or dict qualifies as spending.
    Spending requires:
    1. type == 'expense'
    2. category != 'People' and contact_id is None, unless allow_people is True.
    """
    txn_type = getattr(txn, "type", None) or (txn.get("type") if isinstance(txn, dict) else None)
    if txn_type != "expense":
        return False

    if allow_people:
        return True

    cat_name = None
    if hasattr(txn, "category") and txn.category:
        cat_name = getattr(txn.category, "name", None)
    elif isinstance(txn, dict):
        cat_name = txn.get("category_name") or txn.get("category")

    if cat_name and str(cat_name).strip().lower() == "people":
        return False

    contact_id = getattr(txn, "contact_id", None) if not isinstance(txn, dict) else txn.get("contact_id")
    if contact_id is not None:
        return False

    return True


def should_allow_people(
    selector: Optional[Any] = None,
    allow_people_explicit: bool = False,
) -> bool:
    """
    Determines if people transfers should be included in a spending query:
    Allowed only if the user explicitly asks about a person or about money sent.
    """
    if allow_people_explicit:
        return True
    if selector is None:
        return False

    def _get(key: str):
        if hasattr(selector, key):
            return getattr(selector, key)
        if isinstance(selector, dict):
            return selector.get(key)
        return None

    # User explicitly asks about a person
    if _get("contact"):
        return True

    # User explicitly asks for People category
    cat = _get("category")
    if cat and str(cat).strip().lower() == "people":
        return True

    return False
