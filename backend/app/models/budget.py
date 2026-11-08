import uuid
from sqlalchemy import Column, Integer, Numeric, DateTime, ForeignKey, Uuid, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class CategoryBudget(Base):
    """
    Monthly spending budget for one fixed category, per user (PROJECT_SPEC.md §4).
    The same amount applies to every IST calendar month; spending is computed, never stored.
    """
    __tablename__ = "category_budgets"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    category = relationship("Category")

    __table_args__ = (
        UniqueConstraint("user_id", "category_id", name="uq_category_budget_user_category"),
        CheckConstraint("amount > 0", name="ck_category_budget_amount_positive"),
    )
