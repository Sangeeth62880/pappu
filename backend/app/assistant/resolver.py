"""
Deterministic Transaction Resolver for Pappu Assistant v2.

Resolves transactions using non null selector criteria.
Enforces strict user isolation and deterministic filtering.
"""

import uuid
from decimal import Decimal
from datetime import date
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Literal, Union
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.transaction import Transaction
from app.models.category import Category
from app.models.contact import Contact
from app.assistant.schemas import Selector
from app.services.date_utils import resolve_period_to_dates


@dataclass
class ResolveResult:
    outcome: Literal["none", "one", "many"]
    rows: List[Transaction] = field(default_factory=list)
    filters_used: Dict[str, Any] = field(default_factory=dict)


def _get_val(selector: Union[Selector, dict], key: str, default: Any = None) -> Any:
    if isinstance(selector, dict):
        return selector.get(key, default)
    return getattr(selector, key, default)


def resolve(
    db: Session,
    user_id: uuid.UUID,
    selector: Optional[Union[Selector, dict]] = None,
    last_touched_id: Optional[uuid.UUID] = None,
    ref_date: Optional[Union[date, str]] = None,
    for_mutation: bool = False,
) -> ResolveResult:
    """
    Resolve transactions strictly matching selector criteria for user_id.

    Ordering:
    - For delete and edit (for_mutation=True), "latest" orders by created_at desc.
    - For list and query results (for_mutation=False), order by txn_date desc then created_at desc.
    Recency: 'latest' takes 1 (newest), 'earliest' takes 1 (oldest).
    nth: 1-indexed position in ordered results for delete and edit. For list queries with recency latest, nth is treated as limit.
    Description is never filtered unless selector.text is set.
    """
    filters_used: Dict[str, Any] = {}

    if selector is None:
        selector = Selector()

    query = db.query(Transaction).filter(Transaction.user_id == user_id)

    # 1. Ref filter: last_touched
    ref = _get_val(selector, "ref")
    if ref == "last_touched":
        filters_used["ref"] = "last_touched"
        if not last_touched_id:
            return ResolveResult(outcome="none", rows=[], filters_used=filters_used)
        query = query.filter(Transaction.id == last_touched_id)

    # 2. Contact filter
    contact_val = _get_val(selector, "contact")
    if contact_val:
        clean_contact = str(contact_val).strip()
        filters_used["contact"] = clean_contact
        needle = clean_contact.lower()

        # Query contacts belonging to user_id
        user_contacts = db.query(Contact).filter(Contact.user_id == user_id).all()
        matched_contact_ids = []
        for c in user_contacts:
            if c.name.strip().lower() == needle:
                matched_contact_ids.append(c.id)
            elif c.aliases and any(str(alias).strip().lower() == needle for alias in c.aliases):
                matched_contact_ids.append(c.id)

        if matched_contact_ids:
            query = query.filter(Transaction.contact_id.in_(matched_contact_ids))
        else:
            # Contact not found for this user
            filters_used["unknown_contact"] = clean_contact
            query = query.filter(Transaction.contact_id == None, False)

    # 3. Category filter
    category_val = _get_val(selector, "category")
    if category_val:
        clean_cat = str(category_val).strip()
        filters_used["category"] = clean_cat
        query = query.join(Category, Transaction.category_id == Category.id).filter(
            func.lower(Category.name) == clean_cat.lower()
        )

    # 4. Direction filter
    direction_val = _get_val(selector, "direction")
    if direction_val:
        clean_dir = str(direction_val).strip().lower()
        filters_used["direction"] = direction_val
        if clean_dir == "sent":
            query = query.filter(Transaction.type == "expense")
        elif clean_dir == "received":
            query = query.filter(Transaction.type == "income")
        elif clean_dir in ("expense", "income"):
            query = query.filter(Transaction.type == clean_dir)

    # 5. Exact Amount filter
    amount_val = _get_val(selector, "amount")
    if amount_val is not None:
        filters_used["amount"] = amount_val
        query = query.filter(Transaction.amount == Decimal(str(amount_val)))

    # 6. Amount Range filters (amount_min, amount_max)
    amount_min_val = _get_val(selector, "amount_min")
    if amount_min_val is not None:
        filters_used["amount_min"] = amount_min_val
        query = query.filter(Transaction.amount >= Decimal(str(amount_min_val)))

    amount_max_val = _get_val(selector, "amount_max")
    if amount_max_val is not None:
        filters_used["amount_max"] = amount_max_val
        query = query.filter(Transaction.amount <= Decimal(str(amount_max_val)))

    # 7. Period and Date range (inclusive)
    period_val = _get_val(selector, "period")
    if period_val:
        clean_period = str(period_val).strip().lower()
        filters_used["period"] = clean_period
        if clean_period == "all_time":
            filters_used["is_all_time"] = True
        else:
            p_from, p_to = resolve_period_to_dates(clean_period, ref_date=ref_date)
            filters_used["resolved_date_from"] = p_from.isoformat()
            filters_used["resolved_date_to"] = p_to.isoformat()
            query = query.filter(Transaction.txn_date >= p_from, Transaction.txn_date <= p_to)
    else:
        date_from_val = _get_val(selector, "date_from")
        if date_from_val:
            filters_used["date_from"] = date_from_val
            d_from = (
                date_from_val
                if isinstance(date_from_val, date)
                else date.fromisoformat(str(date_from_val).strip())
            )
            filters_used["resolved_date_from"] = d_from.isoformat()
            query = query.filter(Transaction.txn_date >= d_from)

        date_to_val = _get_val(selector, "date_to")
        if date_to_val:
            filters_used["date_to"] = date_to_val
            d_to = (
                date_to_val
                if isinstance(date_to_val, date)
                else date.fromisoformat(str(date_to_val).strip())
            )
            filters_used["resolved_date_to"] = d_to.isoformat()
            query = query.filter(Transaction.txn_date <= d_to)

    # 8. Text search on description (ILIKE only when set)
    text_val = _get_val(selector, "text")
    if text_val:
        clean_text = str(text_val).strip()
        filters_used["text"] = clean_text
        query = query.filter(Transaction.description.ilike(f"%{clean_text}%"))

    # Ordering
    if for_mutation:
        # For delete and edit, latest orders by created_at desc
        query = query.order_by(Transaction.created_at.desc())
    else:
        # For list and query results, order by txn_date desc then created_at desc
        query = query.order_by(Transaction.txn_date.desc(), Transaction.created_at.desc())

    rows: List[Transaction] = query.all()

    recency_val = _get_val(selector, "recency")
    nth_val = _get_val(selector, "nth")
    limit_val = _get_val(selector, "limit")

    if for_mutation:
        if recency_val:
            filters_used["recency"] = recency_val
        if nth_val is not None:
            filters_used["nth"] = nth_val
            idx = nth_val - 1 if nth_val >= 1 else 0
            if 0 <= idx < len(rows):
                rows = [rows[idx]]
            else:
                rows = []
        elif recency_val == "latest":
            rows = rows[:1]
        elif recency_val == "earliest":
            rows = rows[-1:] if rows else []
        elif limit_val is not None:
            filters_used["limit"] = limit_val
            rows = rows[:limit_val]
    else:
        # List and query results:
        # For list queries treat nth with recency latest as limit and never return an empty result because of it
        if recency_val == "latest" and nth_val is not None:
            filters_used["recency"] = "latest"
            filters_used["limit"] = nth_val
            rows = rows[:nth_val]
        elif limit_val is not None:
            filters_used["limit"] = limit_val
            if recency_val:
                filters_used["recency"] = recency_val
            rows = rows[:limit_val]
        elif nth_val is not None:
            filters_used["nth"] = nth_val
            idx = nth_val - 1 if nth_val >= 1 else 0
            if 0 <= idx < len(rows):
                rows = [rows[idx]]
            else:
                rows = []
        elif recency_val == "latest":
            filters_used["recency"] = "latest"
            rows = rows[:1]
        elif recency_val == "earliest":
            filters_used["recency"] = "earliest"
            rows = rows[-1:] if rows else []

    count = len(rows)
    if count == 0:
        outcome = "none"
    elif count == 1:
        outcome = "one"
    else:
        outcome = "many"

    return ResolveResult(outcome=outcome, rows=rows, filters_used=filters_used)
