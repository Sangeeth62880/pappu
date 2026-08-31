import uuid
from datetime import date
from typing import Optional, List, Literal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user_id
from app.models import Transaction, Category, Profile
from app.schemas.transaction import (
    TransactionCreate,
    TransactionUpdate,
    TransactionResponse,
)

from app.services.undo import undo_last_transaction

router = APIRouter(prefix="/transactions", tags=["transactions"])

def _ensure_profile_exists(db: Session, user_id: uuid.UUID):
    profile = db.query(Profile).filter(Profile.id == user_id).first()
    if not profile:
        profile = Profile(id=user_id, name="User", preferred_language="en")
        db.add(profile)
        db.commit()

@router.post("/undo")
def undo_transaction(
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Undo/revert the most recent transaction for the authenticated user.
    """
    deleted_txn = undo_last_transaction(db, current_user_id)
    if not deleted_txn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No recent transaction found to undo",
        )
    return {"status": "undone", "transaction": deleted_txn}


@router.post("", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: TransactionCreate,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    _ensure_profile_exists(db, current_user_id)

    category = db.query(Category).filter(Category.id == payload.category_id).first()
    if not category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category with id {payload.category_id} does not exist",
        )

    txn = Transaction(
        user_id=current_user_id,
        type=payload.type,
        amount=payload.amount,
        category_id=payload.category_id,
        description=payload.description,
        txn_date=payload.txn_date,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)

    return TransactionResponse(
        id=txn.id,
        user_id=txn.user_id,
        type=txn.type,
        amount=txn.amount,
        category_id=txn.category_id,
        category_name=category.name,
        description=txn.description,
        txn_date=txn.txn_date,
        created_at=txn.created_at,
    )

@router.get("", response_model=List[TransactionResponse])
def list_transactions(
    category_id: Optional[int] = Query(None, description="Filter by category ID"),
    type: Optional[Literal["income", "expense"]] = Query(None, description="Filter by transaction type"),
    start_date: Optional[date] = Query(None, description="Filter start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="Filter end date (inclusive)"),
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    query = db.query(Transaction).filter(Transaction.user_id == current_user_id)

    if category_id is not None:
        query = query.filter(Transaction.category_id == category_id)
    if type is not None:
        query = query.filter(Transaction.type == type)
    if start_date is not None:
        query = query.filter(Transaction.txn_date >= start_date)
    if end_date is not None:
        query = query.filter(Transaction.txn_date <= end_date)

    txns = query.order_by(Transaction.txn_date.desc(), Transaction.created_at.desc()).all()

    return [
        TransactionResponse(
            id=txn.id,
            user_id=txn.user_id,
            type=txn.type,
            amount=txn.amount,
            category_id=txn.category_id,
            category_name=txn.category.name if txn.category else None,
            description=txn.description,
            txn_date=txn.txn_date,
            created_at=txn.created_at,
        )
        for txn in txns
    ]

@router.put("/{id}", response_model=TransactionResponse)
def update_transaction(
    id: uuid.UUID,
    payload: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    txn = db.query(Transaction).filter(Transaction.id == id, Transaction.user_id == current_user_id).first()
    if not txn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction with id {id} not found",
        )

    if payload.category_id is not None:
        category = db.query(Category).filter(Category.id == payload.category_id).first()
        if not category:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Category with id {payload.category_id} does not exist",
            )
        txn.category_id = payload.category_id

    if payload.type is not None:
        txn.type = payload.type
    if payload.amount is not None:
        txn.amount = payload.amount
    if payload.description is not None:
        txn.description = payload.description
    if payload.txn_date is not None:
        txn.txn_date = payload.txn_date

    db.commit()
    db.refresh(txn)

    return TransactionResponse(
        id=txn.id,
        user_id=txn.user_id,
        type=txn.type,
        amount=txn.amount,
        category_id=txn.category_id,
        category_name=txn.category.name if txn.category else None,
        description=txn.description,
        txn_date=txn.txn_date,
        created_at=txn.created_at,
    )

@router.delete("/{id}")
def delete_transaction(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    txn = db.query(Transaction).filter(Transaction.id == id, Transaction.user_id == current_user_id).first()
    if not txn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction with id {id} not found",
        )

    db.delete(txn)
    db.commit()

    return {"status": "deleted", "id": str(id)}
