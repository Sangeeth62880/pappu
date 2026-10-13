import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class PendingAction(Base):
    __tablename__ = "pending_actions"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String, nullable=False)  # 'confirm' | 'disambiguate' | 'contact_confirm' | 'future_date'
    plan_json = Column(JSONB().with_variant(JSON, "sqlite"), nullable=False)
    candidates_json = Column(JSONB().with_variant(JSON, "sqlite"), nullable=True)
    status = Column(String, nullable=False, default="pending")  # 'pending' | 'resolved' | 'expired' | 'superseded'
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    profile = relationship("Profile", back_populates="pending_actions")
