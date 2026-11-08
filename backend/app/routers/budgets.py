"""
Budgets API (PROJECT_SPEC.md §8).

- GET /budgets: this month's spent vs budget for every budget the user has set.
- PUT /budgets/{category}: create or replace the monthly budget for one category.

user_id always comes from the verified JWT, never from the request.
"""

import uuid
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user_id
from app.database import get_db
from app.models.profile import Profile
from app.services import budgets as budget_service

router = APIRouter(prefix="/budgets", tags=["budgets"])


class BudgetItem(BaseModel):
    category: str
    budget: float
    spent: float
    remaining: float
    over_by: float
    percent: int
    state: str  # 'ok' | 'near' (80% to 100%) | 'over' (above 100%)
    month: str
    previous_budget: Optional[float] = None


class BudgetListResponse(BaseModel):
    month: str
    budgets: List[BudgetItem]
    categories: List[str]


class BudgetSetRequest(BaseModel):
    amount: Decimal = Field(gt=0)


def _ensure_profile(db: Session, user_id: uuid.UUID) -> None:
    if not db.query(Profile.id).filter(Profile.id == user_id).first():
        db.add(Profile(id=user_id, name="User", preferred_language="en"))
        db.commit()


@router.get("", response_model=BudgetListResponse)
def get_budgets(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> BudgetListResponse:
    return BudgetListResponse(**budget_service.list_budgets(db, user_id))


@router.put("/{category}", response_model=BudgetItem)
def put_budget(
    category: str,
    body: BudgetSetRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> BudgetItem:
    if not budget_service.budget_category_name(category):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Budgets can be set for: {', '.join(budget_service.BUDGET_CATEGORIES)}",
        )
    _ensure_profile(db, user_id)
    try:
        item = budget_service.set_budget(db, user_id, category, body.amount)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    return BudgetItem(**item)
