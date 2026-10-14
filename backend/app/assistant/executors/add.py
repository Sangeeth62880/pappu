"""
Add executor for Pappu Assistant v2.

Supports expense, income, and person transactions.
Auto-creates contacts for person transactions if they do not exist.
Writes undo action with the shared batch_id.
"""

import uuid
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.transaction import Transaction
from app.models.contact import Contact
from app.models.undo_action import UndoAction
from app.assistant.schemas import AddOp, direction_to_type
from app.assistant.validation import (
    validate_amount,
    validate_and_parse_date,
    resolve_category,
    validate_person_contact,
)
from app.assistant.executors.base import ActionResult, serialize_transaction


def execute_add(
    db: Session,
    user_id: uuid.UUID,
    op: AddOp,
    batch_id: uuid.UUID,
) -> ActionResult:
    """
    Executes an Add operation for user_id and logs UndoAction with batch_id.
    """
    try:
        amount = validate_amount(op.amount)
        parsed_date, needs_confirmation = validate_and_parse_date(op.date)

        contact: Optional[Contact] = None
        if op.kind == "person":
            contact_name = validate_person_contact(op.contact)
            txn_type = direction_to_type(op.direction)

            # Match or create contact
            clean_name = contact_name.strip()
            user_contacts = db.query(Contact).filter(Contact.user_id == user_id).all()
            for c in user_contacts:
                if c.name.strip().lower() == clean_name.lower():
                    contact = c
                    break
                elif c.aliases and any(str(a).strip().lower() == clean_name.lower() for a in c.aliases):
                    contact = c
                    break

            if not contact:
                contact = Contact(
                    id=uuid.uuid4(),
                    user_id=user_id,
                    name=clean_name,
                    aliases=[],
                )
                db.add(contact)
                db.flush()

            category = resolve_category(db, "People", default_type=txn_type)

        elif op.kind in ("expense", "income"):
            txn_type = op.kind
            category = resolve_category(db, op.category, default_type=txn_type)

            if op.contact:
                clean_name = op.contact.strip()
                user_contacts = db.query(Contact).filter(Contact.user_id == user_id).all()
                for c in user_contacts:
                    if c.name.strip().lower() == clean_name.lower():
                        contact = c
                        break
                    elif c.aliases and any(str(a).strip().lower() == clean_name.lower() for a in c.aliases):
                        contact = c
                        break

                if not contact:
                    contact = Contact(
                        id=uuid.uuid4(),
                        user_id=user_id,
                        name=clean_name,
                        aliases=[],
                    )
                    db.add(contact)
                    db.flush()
        else:
            return ActionResult(
                ok=False,
                action="add",
                error=f"Unsupported transaction kind: {op.kind}",
            )

        txn = Transaction(
            id=uuid.uuid4(),
            user_id=user_id,
            type=txn_type,
            amount=amount,
            category_id=category.id,
            contact_id=contact.id if contact else None,
            description=op.description,
            txn_date=parsed_date,
        )
        db.add(txn)
        db.flush()

        undo = UndoAction(
            user_id=user_id,
            action_type="add",
            transaction_id=txn.id,
            batch_id=batch_id,
            previous_state=None,
        )
        db.add(undo)
        db.commit()
        db.refresh(txn)

        return ActionResult(
            ok=True,
            action="add",
            transaction_id=str(txn.id),
            data=serialize_transaction(txn),
            needs_confirmation=needs_confirmation,
        )

    except Exception as e:
        db.rollback()
        return ActionResult(
            ok=False,
            action="add",
            error=str(e),
        )
