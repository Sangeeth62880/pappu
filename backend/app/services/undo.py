"""
Undo service for reversing the user's most recent transaction mutation.

Per PROJECT_SPEC.md §6 and BUILD_PHASES.md Phase 4:
Strictly scoped to the verified_user_id.
Supports non-destructive undo for edits, adds, and deletions.
"""

import json
import uuid
from decimal import Decimal
from datetime import datetime, date
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

from app.models.transaction import Transaction
from app.models.undo_action import UndoAction


def record_undo_action(
    db: Session,
    user_id: uuid.UUID,
    action_type: str,
    transaction_id: uuid.UUID,
    previous_state: Optional[Dict[str, Any]] = None,
) -> UndoAction:
    """
    Log an undoable action ('add', 'edit', 'delete') for the authenticated user.
    """
    undo_entry = UndoAction(
        user_id=user_id,
        action_type=action_type,
        transaction_id=transaction_id,
        previous_state=json.dumps(previous_state) if previous_state else None,
    )
    db.add(undo_entry)
    db.commit()
    db.refresh(undo_entry)
    return undo_entry


def undo_last_transaction(db: Session, user_id: uuid.UUID) -> Optional[dict]:
    """
    Reverses the most recent transaction mutation for `user_id`:
    - 'edit': Restores previous field values.
    - 'delete': Restores the deleted transaction.
    - 'add': Deletes the created transaction.
    - Fallback: Deletes the most recent transaction by created_at.
    """
    latest_action = (
        db.query(UndoAction)
        .filter(UndoAction.user_id == user_id)
        .order_by(UndoAction.id.desc())
        .first()
    )

    if latest_action:
        action_type = latest_action.action_type
        txn_id = latest_action.transaction_id
        prev_data = json.loads(latest_action.previous_state) if latest_action.previous_state else {}

        if action_type == "edit":
            txn = db.query(Transaction).filter(
                Transaction.id == txn_id,
                Transaction.user_id == user_id,
            ).first()

            if txn:
                if "amount" in prev_data and prev_data["amount"] is not None:
                    txn.amount = Decimal(str(prev_data["amount"]))
                if "type" in prev_data and prev_data["type"] is not None:
                    txn.type = prev_data["type"]
                if "category_id" in prev_data and prev_data["category_id"] is not None:
                    txn.category_id = int(prev_data["category_id"])
                if "description" in prev_data:
                    txn.description = prev_data["description"]
                if "txn_date" in prev_data and prev_data["txn_date"]:
                    txn.txn_date = date.fromisoformat(str(prev_data["txn_date"]))
                if "contact_id" in prev_data:
                    txn.contact_id = uuid.UUID(prev_data["contact_id"]) if prev_data["contact_id"] else None

                db.commit()
                db.refresh(txn)

                result_info = {
                    "id": str(txn.id),
                    "user_id": str(txn.user_id),
                    "type": txn.type,
                    "amount": float(txn.amount),
                    "category_id": txn.category_id,
                    "category_name": txn.category.name if txn.category else None,
                    "description": txn.description,
                    "txn_date": str(txn.txn_date),
                    "action_undone": "edit",
                }
                db.delete(latest_action)
                db.commit()
                return result_info

        elif action_type == "delete":
            restored_txn = Transaction(
                id=txn_id,
                user_id=user_id,
                type=prev_data.get("type", "expense"),
                amount=Decimal(str(prev_data.get("amount", "0.00"))),
                category_id=int(prev_data.get("category_id", 1)),
                contact_id=uuid.UUID(prev_data["contact_id"]) if prev_data.get("contact_id") else None,
                description=prev_data.get("description"),
                txn_date=date.fromisoformat(str(prev_data.get("txn_date", date.today()))),
            )
            db.add(restored_txn)
            db.commit()
            db.refresh(restored_txn)

            result_info = {
                "id": str(restored_txn.id),
                "user_id": str(restored_txn.user_id),
                "type": restored_txn.type,
                "amount": float(restored_txn.amount),
                "category_id": restored_txn.category_id,
                "category_name": restored_txn.category.name if restored_txn.category else None,
                "description": restored_txn.description,
                "txn_date": str(restored_txn.txn_date),
                "action_undone": "delete",
            }
            db.delete(latest_action)
            db.commit()
            return result_info

        elif action_type == "add":
            txn = db.query(Transaction).filter(
                Transaction.id == txn_id,
                Transaction.user_id == user_id,
            ).first()

            result_info = None
            if txn:
                result_info = {
                    "id": str(txn.id),
                    "user_id": str(txn.user_id),
                    "type": txn.type,
                    "amount": float(txn.amount),
                    "category_id": txn.category_id,
                    "category_name": txn.category.name if txn.category else None,
                    "description": txn.description,
                    "txn_date": str(txn.txn_date),
                    "action_undone": "add",
                }
                db.delete(txn)
                db.commit()

            db.delete(latest_action)
            db.commit()
            if result_info:
                return result_info

    # Fallback for seeded transactions or untracked legacy adds
    last_txn = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id)
        .order_by(Transaction.created_at.desc(), Transaction.txn_date.desc())
        .first()
    )

    if not last_txn:
        return None

    deleted_info = {
        "id": str(last_txn.id),
        "user_id": str(last_txn.user_id),
        "type": last_txn.type,
        "amount": float(last_txn.amount),
        "category_id": last_txn.category_id,
        "category_name": last_txn.category.name if last_txn.category else None,
        "description": last_txn.description,
        "txn_date": str(last_txn.txn_date),
        "action_undone": "add",
    }

    db.delete(last_txn)
    db.commit()

    return deleted_info
