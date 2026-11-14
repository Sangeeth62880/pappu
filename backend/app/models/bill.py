"""
Bill split models (PROJECT_SPEC.md §4, §5b Bill Split).

A bill is a parsed restaurant bill owned by one user. The photo is never stored.
Items are assigned to people while the bill is a draft; shares are written only on confirm.
"""

import uuid
from sqlalchemy import (
    Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.types import JSON

from app.database import Base

BILL_STATUSES = ("draft", "confirmed", "cancelled", "undone")


class Bill(Base):
    __tablename__ = "bills"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    merchant = Column(Text, nullable=True)
    bill_date = Column(Date, nullable=False)
    tax = Column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    service_charge = Column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    discount = Column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    total = Column(Numeric(12, 2), nullable=False)
    status = Column(String, nullable=False, default="draft", server_default="draft")
    # Everyone at the table besides the user: [{"name": "Rahul", "contact_id": "<uuid>" | null}].
    # contact_id null means a new name; that contact is created only on confirm.
    people = Column(JSONB().with_variant(JSON, "sqlite"), nullable=False, default=list)
    # Set on confirm; equals undo_actions.batch_id for every row the confirm wrote.
    undo_batch_id = Column(Uuid, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    items = relationship(
        "BillItem", back_populates="bill", cascade="all, delete-orphan", order_by="BillItem.position"
    )
    shares = relationship("BillShare", back_populates="bill", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("total > 0", name="ck_bill_total_positive"),
        CheckConstraint(
            "status IN ('draft', 'confirmed', 'cancelled', 'undone')", name="ck_bill_status"
        ),
    )


class BillItem(Base):
    __tablename__ = "bill_items"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    bill_id = Column(Uuid, ForeignKey("bills.id", ondelete="CASCADE"), nullable=False, index=True)
    # 1-based order on the bill. The split planner refers to items by this number.
    position = Column(Integer, nullable=False)
    name = Column(Text, nullable=False)
    quantity = Column(Numeric(8, 2), nullable=False, default=1, server_default="1")
    amount = Column(Numeric(12, 2), nullable=False)  # line total
    needs_check = Column(Boolean, nullable=False, default=False, server_default="false")
    # People this item is split between: "me" or a name from Bill.people. Null = nobody yet.
    assigned_to = Column(JSONB().with_variant(JSON, "sqlite"), nullable=True)

    bill = relationship("Bill", back_populates="items")


class BillShare(Base):
    __tablename__ = "bill_shares"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    bill_id = Column(Uuid, ForeignKey("bills.id", ondelete="CASCADE"), nullable=False, index=True)
    is_self = Column(Boolean, nullable=False, default=False, server_default="false")
    contact_id = Column(Uuid, ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True)
    name = Column(Text, nullable=False)  # "You" for the user's own share, else the contact's name
    amount = Column(Numeric(12, 2), nullable=False)
    transaction_id = Column(Uuid, nullable=True)       # written for this share on confirm
    paid_transaction_id = Column(Uuid, nullable=True)  # the repayment, set by "Mark paid"

    bill = relationship("Bill", back_populates="shares")
    contact = relationship("Contact")
