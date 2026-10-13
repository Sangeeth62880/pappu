"""
Base definitions and serializing helpers for Pappu Assistant v2 executors.
"""

from dataclasses import dataclass
from typing import Optional, Dict, Any, List
from app.models.transaction import Transaction


@dataclass
class ActionResult:
    ok: bool
    action: str
    transaction_id: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    status: Optional[str] = None
    needs_confirmation: bool = False
    filters_used: Optional[Dict[str, Any]] = None
    candidates: Optional[List[Dict[str, Any]]] = None


def serialize_transaction(txn: Transaction) -> Dict[str, Any]:
    return {
        "id": str(txn.id),
        "user_id": str(txn.user_id),
        "type": txn.type,
        "amount": float(txn.amount),
        "category_id": txn.category_id,
        "category_name": txn.category.name if txn.category else None,
        "contact_id": str(txn.contact_id) if txn.contact_id else None,
        "contact_name": txn.contact.name if txn.contact else None,
        "description": txn.description,
        "txn_date": txn.txn_date.isoformat(),
        "created_at": txn.created_at.isoformat() if txn.created_at else None,
    }
