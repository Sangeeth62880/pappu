import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Uuid, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class AssistantTrace(Base):
    __tablename__ = "assistant_traces"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    message_text = Column(Text, nullable=False)
    input_type = Column(String, nullable=False, default="text")
    context_json = Column(JSONB().with_variant(JSON, "sqlite"), nullable=True)
    raw_llm_output = Column(Text, nullable=True)
    plan_json = Column(JSONB().with_variant(JSON, "sqlite"), nullable=True)
    resolver_filters_json = Column(JSONB().with_variant(JSON, "sqlite"), nullable=True)
    result_json = Column(JSONB().with_variant(JSON, "sqlite"), nullable=True)
    latency_ms_per_stage = Column(JSONB().with_variant(JSON, "sqlite"), nullable=True)
    schema_valid = Column(Boolean, nullable=False, default=True)
    reply_text = Column(Text, nullable=True)
    spoken_text = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    profile = relationship("Profile", back_populates="assistant_traces")
