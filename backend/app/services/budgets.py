"""
Per-category monthly budgets (PROJECT_SPEC.md §4 and §5b Budgets).

Deterministic code only. The LLM planner never reaches this module directly; it only
produces set_budget / query budget actions that the executors pass in here.

Rules:
- Budgets exist for the fixed expense categories in BUDGET_CATEGORIES. Salary (income)
  and People (person transfers, excluded from spending) cannot have a budget.
- One budget per (user, category). Setting it again replaces the amount (upsert);
  delete_budget removes it.
- Spent uses the system-wide spending definition (is_spending_txn in app/services/spending.py,
  the same check the summary uses), in the category, inside the current IST calendar month.
- Every query is scoped by the verified user_id.
- Alert: an add that moves its category across 80% (ok to near) or 100% (to over) in the
  current IST month gets one alert. Later adds in the same state do not repeat it.
"""

import uuid
from datetime import date
from decimal import Decimal, ROUND_FLOOR
from typing import Any, Dict, List, Optional, Tuple, Union

from sqlalchemy.orm import Session, joinedload

from app.models.budget import CategoryBudget
from app.models.category import Category
from app.models.transaction import Transaction
from app.services.date_utils import get_current_ist_datetime, resolve_period_to_dates
from app.services.spending import is_spending_txn
from app.assistant.validation import KNOWN_CATEGORIES, validate_amount

BUDGET_CATEGORIES: Tuple[str, ...] = ("Food", "Transport", "Shopping", "Bills", "Entertainment", "Other")

# A budget is "near" from 80% of the amount up to 100%, and "over" above 100%.
NEAR_PERCENT = Decimal("80")
FULL_PERCENT = Decimal("100")


class BudgetCategoryError(ValueError):
    """The category is missing, unknown, or cannot have a budget."""


def budget_category_name(name: Optional[str]) -> Optional[str]:
    """Canonical budget category name for name, or None when it cannot have a budget."""
    if not name or not str(name).strip():
        return None
    canonical = KNOWN_CATEGORIES.get(str(name).strip().lower())
    return canonical if canonical in BUDGET_CATEGORIES else None


def month_bounds(ref_date: Optional[Union[date, str]] = None) -> Tuple[date, date]:
    """First and last day of the IST calendar month containing ref_date (default today IST)."""
    if ref_date is None:
        ref_date = get_current_ist_datetime().date()
    return resolve_period_to_dates("this_month", ref_date)


def _ratio_state(spent: Decimal, budget: Decimal) -> str:
    if spent * 100 > budget * FULL_PERCENT:
        return "over"
    if spent * 100 >= budget * NEAR_PERCENT:
        return "near"
    return "ok"


def status_item(category: str, budget: Decimal, spent: Decimal, start: date) -> Dict[str, Any]:
    remaining = budget - spent
    percent = int((spent * 100 / budget).to_integral_value(rounding=ROUND_FLOOR))
    return {
        "category": category,
        "budget": float(budget),
        "spent": float(spent),
        "remaining": float(max(remaining, Decimal("0.00"))),
        "over_by": float(max(-remaining, Decimal("0.00"))),
        "percent": percent,
        "state": _ratio_state(spent, budget),
        "month": start.strftime("%Y-%m"),
    }


def _spent_by_category(
    db: Session,
    user_id: uuid.UUID,
    start: date,
    end: date,
    category_ids: Optional[List[int]] = None,
) -> Dict[int, Decimal]:
    """This user's spending per category between start and end, using is_spending_txn."""
    query = (
        db.query(Transaction)
        .options(joinedload(Transaction.category))
        .filter(
            Transaction.user_id == user_id,
            Transaction.txn_date >= start,
            Transaction.txn_date <= end,
        )
    )
    if category_ids is not None:
        query = query.filter(Transaction.category_id.in_(category_ids))
    totals: Dict[int, Decimal] = {}
    for txn in query.all():
        if is_spending_txn(txn, allow_people=False):
            totals[txn.category_id] = totals.get(txn.category_id, Decimal("0.00")) + Decimal(str(txn.amount))
    return totals


def _category_row(db: Session, canonical: str) -> Category:
    cat = db.query(Category).filter(Category.name == canonical).first()
    if not cat:
        # Categories are a fixed seeded list; never create one here.
        raise BudgetCategoryError(f"Category {canonical} is not seeded")
    return cat


def list_budgets(
    db: Session,
    user_id: uuid.UUID,
    ref_date: Optional[Union[date, str]] = None,
) -> Dict[str, Any]:
    """Every budget the user has, with this month's spending, in BUDGET_CATEGORIES order."""
    start, end = month_bounds(ref_date)
    rows = (
        db.query(CategoryBudget, Category.name)
        .join(Category, Category.id == CategoryBudget.category_id)
        .filter(CategoryBudget.user_id == user_id)
        .all()
    )
    spent = _spent_by_category(db, user_id, start, end, [b.category_id for b, _ in rows])
    items = [
        status_item(name, Decimal(str(b.amount)), spent.get(b.category_id, Decimal("0.00")), start)
        for b, name in rows
        if name in BUDGET_CATEGORIES
    ]
    items.sort(key=lambda item: BUDGET_CATEGORIES.index(item["category"]))
    return {
        "month": start.strftime("%Y-%m"),
        "budgets": items,
        "categories": list(BUDGET_CATEGORIES),
    }


def get_budget_status(
    db: Session,
    user_id: uuid.UUID,
    category: str,
    ref_date: Optional[Union[date, str]] = None,
) -> Optional[Dict[str, Any]]:
    """This month's status for one category, or None when the user has no budget for it."""
    canonical = budget_category_name(category)
    if not canonical:
        raise BudgetCategoryError(f"No budget category for {category!r}")
    cat = _category_row(db, canonical)
    row = (
        db.query(CategoryBudget)
        .filter(CategoryBudget.user_id == user_id, CategoryBudget.category_id == cat.id)
        .first()
    )
    if not row:
        return None
    start, end = month_bounds(ref_date)
    spent = _spent_by_category(db, user_id, start, end, [cat.id]).get(cat.id, Decimal("0.00"))
    return status_item(canonical, Decimal(str(row.amount)), spent, start)


_STATE_ORDER = {"ok": 0, "near": 1, "over": 2}


def alert_for_add(db: Session, user_id: uuid.UUID, txn: Transaction) -> Optional[Dict[str, Any]]:
    """
    Status item plus "alert" ('near' | 'over') when the committed txn moved its category's
    spending this month across a threshold; None otherwise (including no budget, not
    spending, another month, or any error, so an alert can never fail the add).
    """
    try:
        if txn.type != "expense" or txn.contact_id is not None:
            return None
        start, end = month_bounds()
        if not (start <= txn.txn_date <= end):
            return None
        row = (
            db.query(CategoryBudget, Category.name)
            .join(Category, Category.id == CategoryBudget.category_id)
            .filter(CategoryBudget.user_id == user_id, CategoryBudget.category_id == txn.category_id)
            .first()
        )
        if not row or row[1] not in BUDGET_CATEGORIES:
            return None
        budget_row, name = row
        budget = Decimal(str(budget_row.amount))
        spent_after = _spent_by_category(db, user_id, start, end, [txn.category_id]).get(txn.category_id, Decimal("0.00"))
        spent_before = spent_after - Decimal(str(txn.amount))
        before, after = _ratio_state(spent_before, budget), _ratio_state(spent_after, budget)
        if after == "ok" or _STATE_ORDER[after] <= _STATE_ORDER[before]:
            return None
        item = status_item(name, budget, spent_after, start)
        item["alert"] = after
        return item
    except Exception:
        return None


def set_budget(
    db: Session,
    user_id: uuid.UUID,
    category: Optional[str],
    amount: Union[float, int, Decimal, str],
    ref_date: Optional[Union[date, str]] = None,
) -> Dict[str, Any]:
    """
    Creates or replaces the user's monthly budget for category and commits.
    Returns the status item plus previous_budget (None when it is new).
    """
    canonical = budget_category_name(category)
    if not canonical:
        raise BudgetCategoryError(f"No budget category for {category!r}")
    value = validate_amount(amount)
    cat = _category_row(db, canonical)

    row = (
        db.query(CategoryBudget)
        .filter(CategoryBudget.user_id == user_id, CategoryBudget.category_id == cat.id)
        .first()
    )
    previous = Decimal(str(row.amount)) if row else None
    if row:
        row.amount = value
        row.updated_at = get_current_ist_datetime()
    else:
        db.add(CategoryBudget(id=uuid.uuid4(), user_id=user_id, category_id=cat.id, amount=value))
    db.commit()

    start, end = month_bounds(ref_date)
    spent = _spent_by_category(db, user_id, start, end, [cat.id]).get(cat.id, Decimal("0.00"))
    item = status_item(canonical, value, spent, start)
    item["previous_budget"] = float(previous) if previous is not None else None
    return item


def delete_budget(db: Session, user_id: uuid.UUID, category: Optional[str]) -> bool:
    """Removes the user's budget for category and commits. False when the user has none."""
    canonical = budget_category_name(category)
    if not canonical:
        raise BudgetCategoryError(f"No budget category for {category!r}")
    cat = _category_row(db, canonical)
    deleted = (
        db.query(CategoryBudget)
        .filter(CategoryBudget.user_id == user_id, CategoryBudget.category_id == cat.id)
        .delete(synchronize_session=False)
    )
    db.commit()
    return deleted > 0
