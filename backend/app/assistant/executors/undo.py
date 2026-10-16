"""
Undo executor for Pappu Assistant v2.

Reverts the entire latest undo batch for user_id:
- edit restores previous field values
- add deletes only that row
- delete recreates the deleted transaction row
"""

import json
import uuid
from decimal import Decimal
from datetime import date
from typing import Optional
from sqlalchemy.orm import Session

from app.models.transaction import Transaction
from app.models.undo_action import UndoAction
from app.assistant.schemas import UndoOp
from app.assistant.executors.base import ActionResult


def execute_undo(
    db: Session,
    user_id: uuid.UUID,
    op: Optional[UndoOp] = None,
) -> ActionResult:
    """
    Reverts the most recent undo batch for user_id.
    """
    try:
        latest_action = (
            db.query(UndoAction)
            .filter(UndoAction.user_id == user_id)
            .order_by(UndoAction.id.desc())
            .first()
        )

        if not latest_action:
            return ActionResult(
                ok=False,
                action="undo",
                error="Nothing to undo",
            )

        if latest_action.batch_id:
            actions_to_revert = (
                db.query(UndoAction)
                .filter(
                    UndoAction.user_id == user_id,
                    UndoAction.batch_id == latest_action.batch_id,
                )
                .order_by(UndoAction.id.desc())
                .all()
            )
        else:
            actions_to_revert = [latest_action]

        reverted_count = 0
        reverted_details = []

        for action in actions_to_revert:
            action_type = action.action_type
            txn_id = action.transaction_id
            prev_data = json.loads(action.previous_state) if action.previous_state else {}

            if action_type == "add":
                txn = (
                    db.query(Transaction)
                    .filter(
                        Transaction.id == txn_id,
                        Transaction.user_id == user_id,
                    )
                    .first()
                )
                if txn:
                    db.delete(txn)
                    reverted_count += 1
                    reverted_details.append({"action": "add", "transaction_id": str(txn_id), "status": "deleted"})

            elif action_type == "edit":
                txn = (
                    db.query(Transaction)
                    .filter(
                        Transaction.id == txn_id,
                        Transaction.user_id == user_id,
                    )
                    .first()
                )
                if txn and prev_data:
                    if "amount" in prev_data and prev_data["amount"] is not None:
                        txn.amount = Decimal(str(prev_data["amount"]))
                    if "type" in prev_data and prev_data["type"] is not None:
                        txn.type = prev_data["type"]
                    if "category_id" in prev_data and prev_data["category_id"] is not None:
                        txn.category_id = int(prev_data["category_id"])
                    if "contact_id" in prev_data:
                        txn.contact_id = (
                            uuid.UUID(prev_data["contact_id"]) if prev_data["contact_id"] else None
                        )
                    if "description" in prev_data:
                        txn.description = prev_data["description"]
                    if "txn_date" in prev_data and prev_data["txn_date"]:
                        txn.txn_date = date.fromisoformat(str(prev_data["txn_date"]))

                    reverted_count += 1
                    reverted_details.append({"action": "edit", "transaction_id": str(txn_id), "status": "restored"})

            elif action_type == "delete":
                if prev_data:
                    restored_txn = Transaction(
                        id=txn_id,
                        user_id=user_id,
                        type=prev_data.get("type", "expense"),
                        amount=Decimal(str(prev_data.get("amount", "0.00"))),
                        category_id=int(prev_data.get("category_id", 1)),
                        contact_id=(
                            uuid.UUID(prev_data["contact_id"]) if prev_data.get("contact_id") else None
                        ),
                        description=prev_data.get("description"),
                        txn_date=date.fromisoformat(str(prev_data.get("txn_date"))),
                    )
                    db.add(restored_txn)
                    reverted_count += 1
                    reverted_details.append({"action": "delete", "transaction_id": str(txn_id), "status": "recreated"})

            db.delete(action)

        db.commit()

        return ActionResult(
            ok=True,
            action="undo",
            status="undone",
            data={
                "batch_id": str(latest_action.batch_id) if latest_action.batch_id else None,
                "undone_count": reverted_count,
                "details": reverted_details,
            },
        )

    except Exception as e:
        db.rollback()
        return ActionResult(
            ok=False,
            action="undo",
            error=str(e),
        )
