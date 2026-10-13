"""
Transaction matcher service for edit/delete/query routing.

Matches database transactions against extracted intent criteria for a specific authenticated user.
Guarantees per-user data isolation via explicit WHERE user_id = :verified_user_id filtering.
"""

import uuid
from datetime import datetime, date
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.transaction import Transaction
from app.models.category import Category
from app.models.contact import Contact
from app.schemas.intent import IntentFields


def match_transactions(
    db: Session,
    user_id: uuid.UUID,
    fields: IntentFields,
    limit: int = 50,
    reasoning: Optional[str] = None,
) -> List[Transaction]:
    """
    Search transactions belonging strictly to `user_id` matching criteria in `fields`.
    """
    query = (
        db.query(Transaction)
        .join(Category, Transaction.category_id == Category.id)
        .filter(Transaction.user_id == user_id)
    )

    if fields.contact_name:
        query = query.join(Contact, Transaction.contact_id == Contact.id).filter(
            func.lower(Contact.name) == fields.contact_name.lower().strip()
        )

    if fields.category:
        query = query.filter(func.lower(Category.name) == fields.category.lower().strip())

    reasoning_lower = (reasoning or "").lower()
    is_month_query = any(w in reasoning_lower for w in ["month", "മാസം", "current month", "this month"])

    if fields.date:
        date_str = fields.date.strip()
        try:
            if is_month_query:
                # If reasoning indicates a monthly query, extract year & month
                parsed_d = datetime.strptime(date_str[:7], "%Y-%m").date()
                query = query.filter(
                    func.extract("year", Transaction.txn_date) == parsed_d.year,
                    func.extract("month", Transaction.txn_date) == parsed_d.month,
                )
            elif len(date_str) == 7:
                # Year-Month query (e.g. 2026-10)
                year, month = map(int, date_str.split("-"))
                query = query.filter(
                    func.extract("year", Transaction.txn_date) == year,
                    func.extract("month", Transaction.txn_date) == month,
                )
            elif len(date_str) == 10:
                parsed_d = datetime.strptime(date_str, "%Y-%m-%d").date()
                query = query.filter(Transaction.txn_date == parsed_d)
        except (ValueError, TypeError):
            pass
    elif is_month_query:
        # Default to current month if reasoning asks for this month but date was omitted
        today = date.today()
        query = query.filter(
            func.extract("year", Transaction.txn_date) == today.year,
            func.extract("month", Transaction.txn_date) == today.month,
        )

    if fields.description:
        desc_clean = fields.description.strip()
        query = query.filter(Transaction.description.ilike(f"%{desc_clean}%"))

    return query.order_by(Transaction.txn_date.desc(), Transaction.created_at.desc()).limit(limit).all()
