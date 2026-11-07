import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Uuid, UniqueConstraint, CheckConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.sql import func
from app.database import Base


class AssistantIdempotency(Base):
    __tablename__ = "assistant_idempotency"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    client_msg_id = Column(String, nullable=False, index=True)
    # 'in_progress' from reservation until the request finishes; 'done' once response_json is stored.
    # app/assistant/idempotency.py always sets it; the 'done' default only keeps rows written by
    # older code (response stored in the same insert) valid during a deploy or rollback.
    status = Column(String, nullable=False, server_default="done")
    response_json = Column(JSONB().with_variant(JSON, "sqlite"), nullable=True)
    reserved_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    __table_args__ = (
        UniqueConstraint("user_id", "client_msg_id", name="uq_user_client_msg_id"),
        CheckConstraint("status IN ('in_progress', 'done')", name="ck_assistant_idempotency_status"),
    )
