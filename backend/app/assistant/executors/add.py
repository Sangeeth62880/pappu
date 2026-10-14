"""
Add executor for Pappu Assistant v2.

Supports expense, income, and person transactions.
Auto-creates contacts for person transactions if they do not exist.
Writes undo action with the shared batch_id.
"""

import uuid
from decimal import Decimal
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


from app.assistant.contacts import resolve_contact, create_contact


def execute_add(
    db: Session,
    user_id: uuid.UUID,
    op: AddOp,
    batch_id: uuid.UUID,
    confirmed: bool = False,
) -> ActionResult:
    """
    Executes an Add operation for user_id and logs UndoAction with batch_id.
    If date is in the future and confirmed is False, returns needs_confirmation.
    If contact matches fuzzily and confirmed is False, returns needs_confirmation for contact_confirm.
    """
    try:
        amount = validate_amount(op.amount)
        parsed_date, needs_confirmation = validate_and_parse_date(op.date)

        if needs_confirmation and not confirmed:
            return ActionResult(
                ok=False,
                action="add",
                needs_confirmation=True,
                candidates=[{
                    "amount": float(amount),
                    "kind": op.kind,
                    "category": op.category or ("People" if op.kind == "person" else None),
                    "date": parsed_date.isoformat(),
                    "contact": op.contact,
                    "description": op.description,
                }],
            )

        contact: Optional[Contact] = None
        if op.kind == "person":
            contact_name = validate_person_contact(op.contact)
            txn_type = direction_to_type(op.direction)

            res = resolve_contact(db, user_id, contact_name)
            if res.status == "fuzzy" and not confirmed:
                return ActionResult(
                    ok=False,
                    action="add",
                    needs_confirmation=True,
                    status="contact_confirm",
                    candidates=[{
                        "candidate_id": str(res.candidate.id),
                        "candidate_name": res.candidate.name,
                        "spoken_name": res.spoken_name,
                        "similarity": res.similarity,
                    }],
                )
            elif res.status == "exact":
                contact = res.contact
            elif res.status == "fuzzy" and confirmed:
                contact = res.candidate
            else:
                contact = create_contact(db, user_id, res.spoken_name)

            category = resolve_category(db, "People", default_type=txn_type)

            # Determine person flow from prior balance and direction
            prev_txns = (
                db.query(Transaction)
                .filter(Transaction.user_id == user_id, Transaction.contact_id == contact.id)
                .all()
            )
            prev_sent = sum((t.amount for t in prev_txns if t.type == "expense"), Decimal("0.00"))
            prev_received = sum((t.amount for t in prev_txns if t.type == "income"), Decimal("0.00"))
            prev_net = prev_sent - prev_received

            desc = (op.description or "").lower()
            if op.direction == "received":
                if prev_net > Decimal("0.00"):
                    person_flow = "repayment"
                else:
                    person_flow = "i_owe"
            else:
                if "owe" in desc or "lent" in desc or "lend" in desc:
                    person_flow = "they_owe"
                elif prev_net < Decimal("0.00"):
                    person_flow = "repayment"
                else:
                    person_flow = None

        elif op.kind in ("expense", "income"):
            txn_type = op.kind
            category = resolve_category(db, op.category, default_type=txn_type)

            if op.contact:
                res = resolve_contact(db, user_id, op.contact)
                if res.status == "fuzzy" and not confirmed:
                    return ActionResult(
                        ok=False,
                        action="add",
                        needs_confirmation=True,
                        status="contact_confirm",
                        candidates=[{
                            "candidate_id": str(res.candidate.id),
                            "candidate_name": res.candidate.name,
                            "spoken_name": res.spoken_name,
                            "similarity": res.similarity,
                        }],
                    )
                elif res.status == "exact":
                    contact = res.contact
                elif res.status == "fuzzy" and confirmed:
                    contact = res.candidate
                else:
                    contact = create_contact(db, user_id, res.spoken_name)
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

        serialized = serialize_transaction(txn)
        if op.kind == "person" and person_flow:
            serialized["person_flow"] = person_flow

        return ActionResult(
            ok=True,
            action="add",
            transaction_id=str(txn.id),
            data=serialized,
            needs_confirmation=needs_confirmation,
        )

    except Exception as e:
        db.rollback()
        return ActionResult(
            ok=False,
            action="add",
            error=str(e),
        )
