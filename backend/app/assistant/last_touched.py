"""
Helper to retrieve the last touched transaction ID from the latest undo batch.
"""

import uuid
from typing import Optional
from sqlalchemy.orm import Session
from app.models.undo_action import UndoAction


def get_last_touched_id(db: Session, user_id: uuid.UUID) -> Optional[uuid.UUID]:
    """
    Returns the most recent transaction id from the latest undo batch for user_id.
    """
    latest_action = (
        db.query(UndoAction)
        .filter(UndoAction.user_id == user_id)
        .order_by(UndoAction.id.desc())
        .first()
    )
    if not latest_action:
        return None

    if latest_action.batch_id:
        batch_action = (
            db.query(UndoAction)
            .filter(
                UndoAction.user_id == user_id,
                UndoAction.batch_id == latest_action.batch_id,
            )
            .order_by(UndoAction.id.desc())
            .first()
        )
        return batch_action.transaction_id if batch_action else latest_action.transaction_id

    return latest_action.transaction_id
