"""
Budget executors for Pappu Assistant v2.

set_budget: creates a monthly category budget, or replaces one. Replacing an existing
budget with a different amount returns needs_confirmation unless confirmed is True; the
router turns that into a pending confirm. The same amount again executes directly.
query budget: this month's spent vs budget for one category or all of them.
"""

import uuid
from datetime import date
from decimal import Decimal
from typing import Optional, Union

from sqlalchemy.orm import Session

from app.assistant.schemas import QueryOp, SetBudgetOp
from app.assistant.executors.base import ActionResult
# Module import (not names): app.services.budgets imports app.assistant.validation,
# so binding names here would break when that module is the first one imported.
from app.services import budgets as budget_service


def _category_error(action: str, category: Optional[str]) -> ActionResult:
    if not category or not str(category).strip():
        error = "budget_missing_category"
    else:
        error = "budget_invalid_category"
    return ActionResult(
        ok=False,
        action=action,
        status=error,
        error=error,
        data={"category": category, "categories": list(budget_service.BUDGET_CATEGORIES)},
    )


def execute_set_budget(
    db: Session,
    user_id: uuid.UUID,
    op: SetBudgetOp,
    ref_date: Optional[Union[date, str]] = None,
    confirmed: bool = False,
) -> ActionResult:
    canonical = budget_service.budget_category_name(op.category)
    if not canonical:
        return _category_error("set_budget", op.category)
    try:
        if not confirmed:
            current = budget_service.current_budget_amount(db, user_id, canonical)
            if current is not None and op.amount is not None and current != Decimal(str(op.amount)):
                return ActionResult(
                    ok=False,
                    action="set_budget",
                    status="needs_confirmation",
                    needs_confirmation=True,
                    data={"category": canonical, "budget": float(op.amount), "previous_budget": float(current)},
                )
        item = budget_service.set_budget(db, user_id, op.category, op.amount, ref_date=ref_date)
    except Exception as e:
        db.rollback()
        return ActionResult(ok=False, action="set_budget", error=str(e))
    return ActionResult(ok=True, action="set_budget", status="set_budget", data=item)


def execute_budget_query(
    db: Session,
    user_id: uuid.UUID,
    op: QueryOp,
    ref_date: Optional[Union[date, str]] = None,
) -> ActionResult:
    category = op.selector.category if op.selector else None
    if category:
        if not budget_service.budget_category_name(category):
            return _category_error("query", category)
        item = budget_service.get_budget_status(db, user_id, category, ref_date=ref_date)
        start, _ = budget_service.month_bounds(ref_date)
        return ActionResult(
            ok=True,
            action="query",
            status="budget",
            data={
                "category": budget_service.budget_category_name(category),
                "budgets": [item] if item else [],
                "month": start.strftime("%Y-%m"),
            },
        )

    listing = budget_service.list_budgets(db, user_id, ref_date=ref_date)
    return ActionResult(
        ok=True,
        action="query",
        status="budget",
        data={"category": None, "budgets": listing["budgets"], "month": listing["month"]},
    )
