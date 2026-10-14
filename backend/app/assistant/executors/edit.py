"""
Edit executor for Pappu Assistant v2.

Resolves target transaction, applies changes, stores previous values for undo,
and logs UndoAction with the shared batch_id.
"""

import json
import uuid
from typing import Optional
from sqlalchemy.orm import Session

from app.models.transaction import Transaction
from app.models.contact import Contact
from app.models.undo_action import UndoAction
from app.assistant.schemas import EditOp
from app.assistant.resolver import resolve
from app.assistant.validation import (
    validate_amount,
    validate_and_parse_date,
    resolve_category,
)
from app.assistant.executors.base import ActionResult, serialize_transaction


def execute_edit(
    db: Session,
    user_id: uuid.UUID,
    op: EditOp,
    batch_id: uuid.UUID,
    last_touched_id: Optional[uuid.UUID] = None,
) -> ActionResult:
    """
    Executes an Edit operation for user_id and logs previous state into UndoAction.
    """
    try:
        resolve_res = resolve(db, user_id, op.selector, last_touched_id, for_mutation=True)

        if resolve_res.filters_used.get("unknown_contact"):
            return ActionResult(
                ok=False,
                action="edit",
                error="Unknown contact",
                filters_used=resolve_res.filters_used,
            )

        if resolve_res.outcome == "none":
            return ActionResult(
                ok=False,
                action="edit",
                error="Transaction not found",
                filters_used=resolve_res.filters_used,
            )

        if resolve_res.outcome == "many":
            return ActionResult(
                ok=False,
                action="edit",
                error="Multiple transactions matched disambiguation required",
                candidates=[serialize_transaction(r) for r in resolve_res.rows],
                filters_used=resolve_res.filters_used,
            )

        txn = resolve_res.rows[0]
        if txn.user_id != user_id:
            return ActionResult(
                ok=False,
                action="edit",
                error="Transaction not found",
            )

        # Store previous state for undo
        previous_state = {
            "type": txn.type,
            "amount": str(txn.amount),
            "category_id": txn.category_id,
            "contact_id": str(txn.contact_id) if txn.contact_id else None,
            "description": txn.description,
            "txn_date": txn.txn_date.isoformat(),
        }

        patch = op.patch
        if "amount" in patch and patch["amount"] is not None:
            txn.amount = validate_amount(patch["amount"])

        if "type" in patch and patch["type"]:
            txn.type = str(patch["type"]).strip().lower()

        if "category" in patch and patch["category"]:
            cat = resolve_category(db, str(patch["category"]), default_type=txn.type)
            txn.category_id = cat.id

        if "contact" in patch:
            if patch["contact"]:
                contact_name = str(patch["contact"]).strip()
                contact = None
                user_contacts = db.query(Contact).filter(Contact.user_id == user_id).all()
                for c in user_contacts:
                    if c.name.strip().lower() == contact_name.lower():
                        contact = c
                        break
                    elif c.aliases and any(str(a).strip().lower() == contact_name.lower() for a in c.aliases):
                        contact = c
                        break

                if not contact:
                    contact = Contact(id=uuid.uuid4(), user_id=user_id, name=contact_name, aliases=[])
                    db.add(contact)
                    db.flush()

                txn.contact_id = contact.id
            else:
                txn.contact_id = None

        if "description" in patch:
            txn.description = patch["description"]

        if "date" in patch and patch["date"]:
            parsed_date, _ = validate_and_parse_date(patch["date"])
            txn.txn_date = parsed_date

        undo = UndoAction(
            user_id=user_id,
            action_type="edit",
            transaction_id=txn.id,
            batch_id=batch_id,
            previous_state=json.dumps(previous_state),
        )
        db.add(undo)
        db.commit()
        db.refresh(txn)

        txn_data = serialize_transaction(txn)
        txn_data["previous"] = previous_state

        return ActionResult(
            ok=True,
            action="edit",
            transaction_id=str(txn.id),
            data=txn_data,
        )

    except Exception as e:
        db.rollback()
        return ActionResult(
            ok=False,
            action="edit",
            error=str(e),
        )
