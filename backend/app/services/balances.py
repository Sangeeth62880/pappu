import uuid
from decimal import Decimal
from typing import List, Optional, Union
from sqlalchemy.orm import Session

from app.models import Transaction, Contact
from app.schemas.transaction import ContactSummaryItem


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


def balances(
    db: Session,
    user_id: uuid.UUID,
    contact: Optional[Union[str, uuid.UUID]] = None,
    include_settled: bool = False,
) -> List[ContactSummaryItem]:
    """
    Compute balances for user contacts.
    Returns one row per contact with nonzero net by default,
    or for the requested contact.
    Sign convention: expense = you sent, income = you received.
    """
    contacts_query = (
        db.query(Contact)
        .filter(Contact.user_id == user_id)
        .order_by(Contact.name.asc())
    )
    user_contacts = contacts_query.all()

    target_contacts = []
    if contact is not None:
        target_uuid = None
        if isinstance(contact, uuid.UUID):
            target_uuid = contact
        elif isinstance(contact, str):
            try:
                target_uuid = uuid.UUID(contact.strip())
            except (ValueError, AttributeError):
                target_uuid = None

        if target_uuid:
            target_contacts = [c for c in user_contacts if c.id == target_uuid]
        else:
            needle = str(contact).strip().lower()
            for c in user_contacts:
                if c.name.strip().lower() == needle:
                    target_contacts.append(c)
                elif c.aliases and any(alias.strip().lower() == needle for alias in c.aliases):
                    target_contacts.append(c)
    else:
        target_contacts = user_contacts

    results: List[ContactSummaryItem] = []
    for c in target_contacts:
        txns = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.contact_id == c.id,
            )
            .all()
        )
        item = _compute_contact_balance(c, txns)
        if contact is not None or include_settled or item.net_balance != Decimal("0.00"):
            results.append(item)

    return results
