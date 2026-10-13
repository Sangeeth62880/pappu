from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Uuid, Integer
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, nullable=False)  # 'user' | 'assistant'
    text = Column(Text, nullable=False)
    payload = Column(Text, nullable=True)  # JSON-encoded payload
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    profile = relationship("Profile", back_populates="chat_messages")
