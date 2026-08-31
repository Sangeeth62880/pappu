"""
Undo service for reversing the user's most recent transaction.

Per PROJECT_SPEC.md §6 and BUILD_PHASES.md Phase 4:
"undo correctly reverses the most recent transaction only."
Strictly scoped to the verified_user_id.
"""

import uuid
from typing import Optional
from sqlalchemy.orm import Session

from app.models.transaction import Transaction


def undo_last_transaction(db: Session, user_id: uuid.UUID) -> Optional[dict]:
    """
    Find and delete the most recent transaction created by `user_id`.
    Returns dict summary of the deleted transaction, or None if no transactions exist.
    """
    last_txn = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id)
        .order_by(Transaction.created_at.desc())
        .first()
    )

    if not last_txn:
        return None

    # Capture details before deleting
    deleted_info = {
        "id": str(last_txn.id),
        "user_id": str(last_txn.user_id),
        "type": last_txn.type,
        "amount": float(last_txn.amount),
        "category_id": last_txn.category_id,
        "category_name": last_txn.category.name if last_txn.category else None,
        "description": last_txn.description,
        "txn_date": str(last_txn.txn_date),
    }

    db.delete(last_txn)
    db.commit()

    return deleted_info
