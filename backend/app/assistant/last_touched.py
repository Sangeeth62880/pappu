"""
Helper to retrieve the last touched transaction ID from the latest undo batch.
Enforces 10 minute expiration and clears when row is deleted.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.models.undo_action import UndoAction
from app.models.transaction import Transaction


def get_last_touched_id(db: Session, user_id: uuid.UUID) -> Optional[uuid.UUID]:
    """
    Returns the most recent transaction id from the latest undo batch for user_id.
    Expires after 10 minutes and returns None if the row is deleted.
    """
    latest_action = (
        db.query(UndoAction)
        .filter(UndoAction.user_id == user_id)
        .order_by(UndoAction.id.desc())
        .first()
    )
    if not latest_action:
        return None

    # Clear if action was delete
    if latest_action.action_type == "delete":
        return None

    # Clear if transaction row does not exist in transactions table
    txn = (
        db.query(Transaction)
        .filter(Transaction.id == latest_action.transaction_id, Transaction.user_id == user_id)
        .first()
    )
    if not txn:
        return None

    # Expire after 10 minutes (600 seconds)
    if latest_action.created_at:
        action_time = latest_action.created_at
        if action_time.tzinfo is None:
            action_time = action_time.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if (now - action_time).total_seconds() > 600:
            return None

    return latest_action.transaction_id


def is_recent_or_touched(db: Session, txn: Transaction, user_id: uuid.UUID) -> bool:
    """
    Returns True if the transaction was created or touched in the last 10 minutes.
    """
    now = datetime.now(timezone.utc)
    if txn.created_at:
        t_created = txn.created_at
        if t_created.tzinfo is None:
            t_created = t_created.replace(tzinfo=timezone.utc)
        if (now - t_created).total_seconds() <= 600:
            return True

    recent_undo = (
        db.query(UndoAction)
        .filter(UndoAction.user_id == user_id, UndoAction.transaction_id == txn.id)
        .order_by(UndoAction.id.desc())
        .first()
    )
    if recent_undo and recent_undo.created_at:
        u_time = recent_undo.created_at
        if u_time.tzinfo is None:
            u_time = u_time.replace(tzinfo=timezone.utc)
        if (now - u_time).total_seconds() <= 600:
            return True

    return False

