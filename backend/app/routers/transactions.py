import uuid
from datetime import date
from typing import Optional, List, Literal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user_id
from app.models import Transaction, Category, Profile, Contact
from app.schemas.transaction import (
    TransactionCreate,
    TransactionUpdate,
    TransactionResponse,
)

from app.services.undo import undo_last_transaction, record_undo_action

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

    if payload.contact_id is not None:
        contact = db.query(Contact).filter(
            Contact.id == payload.contact_id,
            Contact.user_id == current_user_id,
        ).first()
        if not contact:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Contact with id {payload.contact_id} does not exist",
            )

    txn = Transaction(
        user_id=current_user_id,
        type=payload.type,
        amount=payload.amount,
        category_id=payload.category_id,
        contact_id=payload.contact_id,
        description=payload.description,
        txn_date=payload.txn_date,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)

    # Record undo action for non-destructive reversal
    record_undo_action(db, current_user_id, "add", txn.id)

    return TransactionResponse(
        id=txn.id,
        user_id=txn.user_id,
        type=txn.type,
        amount=txn.amount,
        category_id=txn.category_id,
        category_name=category.name,
        contact_id=txn.contact_id,
        contact_name=txn.contact.name if txn.contact else None,
        description=txn.description,
        txn_date=txn.txn_date,
        created_at=txn.created_at,
    )

@router.get("", response_model=List[TransactionResponse])
def list_transactions(
    category_id: Optional[int] = Query(None, description="Filter by category ID"),
    contact_id: Optional[uuid.UUID] = Query(None, description="Filter by contact ID"),
    type: Optional[Literal["income", "expense"]] = Query(None, description="Filter by transaction type"),
    start_date: Optional[date] = Query(None, description="Filter start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="Filter end date (inclusive)"),
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    query = db.query(Transaction).filter(Transaction.user_id == current_user_id)

    if category_id is not None:
        query = query.filter(Transaction.category_id == category_id)
    if contact_id is not None:
        query = query.filter(Transaction.contact_id == contact_id)
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
            contact_id=txn.contact_id,
            contact_name=txn.contact.name if txn.contact else None,
            description=txn.description,
            txn_date=txn.txn_date,
            created_at=txn.created_at,
        )
        for txn in txns
    ]

@router.patch("/{id}", response_model=TransactionResponse)
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

    # Capture prior state before mutation
    prev_state = {
        "type": txn.type,
        "amount": str(txn.amount),
        "category_id": txn.category_id,
        "contact_id": str(txn.contact_id) if txn.contact_id else None,
        "description": txn.description,
        "txn_date": str(txn.txn_date),
    }

    if payload.category_id is not None:
        category = db.query(Category).filter(Category.id == payload.category_id).first()
        if not category:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Category with id {payload.category_id} does not exist",
            )
        txn.category_id = payload.category_id
    elif payload.category_name is not None:
        category = db.query(Category).filter(Category.name.ilike(payload.category_name.strip())).first()
        if not category:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Category '{payload.category_name}' does not exist",
            )
        txn.category_id = category.id

    if payload.contact_id is not None:
        contact = db.query(Contact).filter(
            Contact.id == payload.contact_id,
            Contact.user_id == current_user_id,
        ).first()
        if not contact:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Contact with id {payload.contact_id} does not exist",
            )
        txn.contact_id = payload.contact_id

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

    # Record undo action for edit
    record_undo_action(db, current_user_id, "edit", txn.id, prev_state)

    return TransactionResponse(
        id=txn.id,
        user_id=txn.user_id,
        type=txn.type,
        amount=txn.amount,
        category_id=txn.category_id,
        category_name=txn.category.name if txn.category else None,
        contact_id=txn.contact_id,
        contact_name=txn.contact.name if txn.contact else None,
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

    # Capture state before deleting to allow clean undo
    prev_state = {
        "type": txn.type,
        "amount": str(txn.amount),
        "category_id": txn.category_id,
        "contact_id": str(txn.contact_id) if txn.contact_id else None,
        "description": txn.description,
        "txn_date": str(txn.txn_date),
    }

    record_undo_action(db, current_user_id, "delete", txn.id, prev_state)

    db.delete(txn)
    db.commit()

    return {"status": "deleted", "id": str(id)}

