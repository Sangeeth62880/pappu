import uuid
from sqlalchemy import Column, String, Numeric, Integer, Date, DateTime, ForeignKey, Text, Uuid
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String, nullable=False)  # 'income' | 'expense'
    amount = Column(Numeric(12, 2), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False, index=True)
    contact_id = Column(Uuid, ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True, index=True)
    description = Column(Text, nullable=True)
    txn_date = Column(Date, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    profile = relationship("Profile", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")
    contact = relationship("Contact", back_populates="transactions")
