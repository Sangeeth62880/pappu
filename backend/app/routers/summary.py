import uuid
from decimal import Decimal
from typing import Dict, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user_id
from app.models import Transaction, Contact
from app.schemas.transaction import (
    SummaryResponse,
    CategoryBreakdownItem,
    PeopleSummaryResponse,
    ContactSummaryItem,
    ContactDetailResponse,
    TransactionResponse,
)

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


def _compute_contact_balance(contact: Contact, txns: List[Transaction]) -> ContactSummaryItem:
    total_sent = Decimal("0.00")      # expense
    total_received = Decimal("0.00")  # income

    for txn in txns:
        if txn.type == "expense":
            total_sent += txn.amount
        elif txn.type == "income":
            total_received += txn.amount

    net_balance = total_sent - total_received

    if net_balance > Decimal("0.00"):
        net_status = "owes_you"
        display_text = f"{contact.name} owes you ₹{net_balance:.2f}"
    elif net_balance < Decimal("0.00"):
        net_status = "you_owe"
        display_text = f"You owe {contact.name} ₹{abs(net_balance):.2f}"
    else:
        net_status = "settled"
        display_text = f"Settled up with {contact.name} (₹0.00)"

    return ContactSummaryItem(
        contact_id=contact.id,
        contact_name=contact.name,
        total_sent=total_sent,
        total_received=total_received,
        net_balance=net_balance,
        status=net_status,
        display_text=display_text,
        transaction_count=len(txns),
    )


@router.get("/people", response_model=PeopleSummaryResponse)
def get_people_summary(
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    List all contacts for the user with net balances, total sent, and total received.
    Formula: net_balance = sum(money sent [expense]) - sum(money received [income]).
    """
    contacts = (
        db.query(Contact)
        .filter(Contact.user_id == current_user_id)
        .order_by(Contact.name.asc())
        .all()
    )

    contact_summaries = []
    total_owed_to_user = Decimal("0.00")
    total_user_owes = Decimal("0.00")

    for contact in contacts:
        contact_txns = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == current_user_id,
                Transaction.contact_id == contact.id,
            )
            .all()
        )
        item = _compute_contact_balance(contact, contact_txns)
        contact_summaries.append(item)

        if item.net_balance > Decimal("0.00"):
            total_owed_to_user += item.net_balance
        elif item.net_balance < Decimal("0.00"):
            total_user_owes += abs(item.net_balance)

    return PeopleSummaryResponse(
        contacts=contact_summaries,
        total_owed_to_user=total_owed_to_user,
        total_user_owes=total_user_owes,
    )


@router.get("/people/{contact_id}", response_model=ContactDetailResponse)
def get_contact_detail(
    contact_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Full transaction history with that contact plus net balance and contact details.
    """
    contact = (
        db.query(Contact)
        .filter(
            Contact.id == contact_id,
            Contact.user_id == current_user_id,
        )
        .first()
    )
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Contact with id {contact_id} not found",
        )

    contact_txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user_id,
            Transaction.contact_id == contact.id,
        )
        .order_by(Transaction.txn_date.desc(), Transaction.created_at.desc())
        .all()
    )

    summary_item = _compute_contact_balance(contact, contact_txns)

    formatted_txns = [
        TransactionResponse(
            id=t.id,
            user_id=t.user_id,
            type=t.type,
            amount=t.amount,
            category_id=t.category_id,
            category_name=t.category.name if t.category else None,
            contact_id=t.contact_id,
            contact_name=contact.name,
            description=t.description,
            txn_date=t.txn_date,
            created_at=t.created_at,
        )
        for t in contact_txns
    ]

    return ContactDetailResponse(
        contact_id=contact.id,
        contact_name=contact.name,
        total_sent=summary_item.total_sent,
        total_received=summary_item.total_received,
        net_balance=summary_item.net_balance,
        status=summary_item.status,
        display_text=summary_item.display_text,
        transactions=formatted_txns,
    )

