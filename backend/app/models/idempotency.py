import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Uuid, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.sql import func
from app.database import Base


class AssistantIdempotency(Base):
    __tablename__ = "assistant_idempotency"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    client_msg_id = Column(String, nullable=False, index=True)
    response_json = Column(JSONB().with_variant(JSON, "sqlite"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    __table_args__ = (
        UniqueConstraint("user_id", "client_msg_id", name="uq_user_client_msg_id"),
    )
