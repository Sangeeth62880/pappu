import uuid
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Uuid
from sqlalchemy.sql import func
from app.database import Base

class UndoAction(Base):
    __tablename__ = "undo_actions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    action_type = Column(String, nullable=False)  # 'add' | 'edit' | 'delete'
    transaction_id = Column(Uuid, nullable=False)
    batch_id = Column(Uuid, nullable=True, index=True)
    previous_state = Column(Text, nullable=True)  # JSON-encoded dictionary of prior state
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
