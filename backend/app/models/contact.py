import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Uuid
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.types import JSON

class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    aliases = Column(ARRAY(String).with_variant(JSON, "sqlite"), nullable=False, default=list, server_default="{}")
    phone = Column(String, nullable=True)
    upi_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    profile = relationship("Profile", backref="contacts")
    transactions = relationship("Transaction", back_populates="contact")
