"""
Delete executor for Pappu Assistant v2.

Executes only when called after confirmation.
Captures full previous transaction state for undo recovery.
"""

import json
import uuid
from typing import Optional
from sqlalchemy.orm import Session

from app.models.transaction import Transaction
from app.models.undo_action import UndoAction
from app.schemas.plan_v2 import DeleteOp
from app.assistant.resolver import resolve
from app.assistant.executors.base import ActionResult, serialize_transaction


def execute_delete(
    db: Session,
    user_id: uuid.UUID,
    op: DeleteOp,
    batch_id: uuid.UUID,
    last_touched_id: Optional[uuid.UUID] = None,
    confirmed: bool = False,
) -> ActionResult:
    """
    Executes a Delete operation for user_id.
    Requires confirmed=True to actually delete; otherwise returns needs_confirmation.
    """
    try:
        resolve_res = resolve(db, user_id, op.selector, last_touched_id)

        if resolve_res.outcome == "none":
            return ActionResult(
                ok=False,
                action="delete",
                error="Transaction not found",
                filters_used=resolve_res.filters_used,
            )

        if resolve_res.outcome == "many":
            return ActionResult(
                ok=False,
                action="delete",
                error="Multiple transactions matched disambiguation required",
                candidates=[serialize_transaction(r) for r in resolve_res.rows],
                filters_used=resolve_res.filters_used,
            )

        txn = resolve_res.rows[0]
        if txn.user_id != user_id:
            return ActionResult(
                ok=False,
                action="delete",
                error="Transaction not found",
            )

        if not confirmed:
            return ActionResult(
                ok=True,
                action="delete",
                status="needs_confirmation",
                transaction_id=str(txn.id),
                data=serialize_transaction(txn),
                filters_used=resolve_res.filters_used,
            )

        # Confirmed deletion
        previous_state = {
            "type": txn.type,
            "amount": str(txn.amount),
            "category_id": txn.category_id,
            "contact_id": str(txn.contact_id) if txn.contact_id else None,
            "description": txn.description,
            "txn_date": txn.txn_date.isoformat(),
        }

        undo = UndoAction(
            user_id=user_id,
            action_type="delete",
            transaction_id=txn.id,
            batch_id=batch_id,
            previous_state=json.dumps(previous_state),
        )
        db.add(undo)
        db.delete(txn)
        db.commit()

        return ActionResult(
            ok=True,
            action="delete",
            status="deleted",
            transaction_id=str(txn.id),
            data=previous_state,
        )

    except Exception as e:
        db.rollback()
        return ActionResult(
            ok=False,
            action="delete",
            error=str(e),
        )
