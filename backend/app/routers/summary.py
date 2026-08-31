import uuid
from decimal import Decimal
from typing import Dict
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user_id
from app.models import Transaction
from app.schemas.transaction import SummaryResponse, CategoryBreakdownItem

router = APIRouter(prefix="/summary", tags=["summary"])

@router.get("", response_model=SummaryResponse)
def get_summary(
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    txns = db.query(Transaction).filter(Transaction.user_id == current_user_id).all()

    total_income = Decimal("0.00")
    total_expense = Decimal("0.00")
    breakdown_map: Dict[int, CategoryBreakdownItem] = {}

    for txn in txns:
        if txn.type == "income":
            total_income += txn.amount
        else:
            total_expense += txn.amount

        cat_id = txn.category_id
        cat_name = txn.category.name if txn.category else "Unknown"
        cat_type = txn.category.type if txn.category else txn.type

        if cat_id not in breakdown_map:
            breakdown_map[cat_id] = CategoryBreakdownItem(
                category_id=cat_id,
                category_name=cat_name,
                type=cat_type,
                total_amount=Decimal("0.00"),
                count=0,
            )
        breakdown_map[cat_id].total_amount += txn.amount
        breakdown_map[cat_id].count += 1

    balance = total_income - total_expense

    return SummaryResponse(
        balance=balance,
        total_income=total_income,
        total_expense=total_expense,
        category_breakdown=list(breakdown_map.values()),
        transaction_count=len(txns),
    )
