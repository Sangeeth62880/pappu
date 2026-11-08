"""
Budget executors for Pappu Assistant v2.

set_budget: creates or replaces a monthly category budget (upsert, no confirmation:
it never touches a transaction, and saying it again replaces the amount).
query budget: this month's spent vs budget for one category or all of them.
"""

import uuid
from datetime import date
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
) -> ActionResult:
    if not budget_service.budget_category_name(op.category):
        return _category_error("set_budget", op.category)
    try:
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
