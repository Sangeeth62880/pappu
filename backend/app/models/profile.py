import uuid
from sqlalchemy import Column, String, DateTime, Uuid
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    preferred_language = Column(String, nullable=False, default="en", server_default="en")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    transactions = relationship("Transaction", back_populates="profile", cascade="all, delete-orphan")
    chat_messages = relationship("ChatMessage", back_populates="profile", cascade="all, delete-orphan")
    assistant_traces = relationship("AssistantTrace", back_populates="profile", cascade="all, delete-orphan")
