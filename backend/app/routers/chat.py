import uuid
import json
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.auth import get_current_user_id
from app.models.profile import Profile
from app.models.chat_message import ChatMessage
from app.schemas.chat import (
    ChatMessageCreate,
    ChatMessageItem,
    ChatHistoryResponse,
)

router = APIRouter(prefix="/chat", tags=["chat"])


def _ensure_profile_exists(db: Session, user_id: uuid.UUID):
    profile = db.query(Profile).filter(Profile.id == user_id).first()
    if not profile:
        profile = Profile(id=user_id, name="User", preferred_language="en")
        db.add(profile)
        db.commit()


def _parse_payload(payload_str: Optional[str]):
    if not payload_str:
        return None
    try:
        return json.loads(payload_str)
    except Exception:
        return payload_str


def _format_message(msg: ChatMessage) -> ChatMessageItem:
    return ChatMessageItem(
        id=str(msg.id),
        user_id=str(msg.user_id),
        role=msg.role,
        text=msg.text,
        payload=_parse_payload(msg.payload),
        created_at=msg.created_at.isoformat() if msg.created_at else "",
    )


@router.get("/history", response_model=ChatHistoryResponse)
def get_chat_history(
    limit: int = Query(50, ge=1, le=200, description="Number of messages to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Get paginated chat history for the authenticated user.
    Returns messages ordered chronologically (oldest to newest in the window).
    """
    _ensure_profile_exists(db, current_user_id)
    query = db.query(ChatMessage).filter(ChatMessage.user_id == current_user_id)
    total = query.count()

    # Query latest messages first by id desc, then reverse to chronological order
    recent_items = (
        query.order_by(ChatMessage.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    chronological_items = list(reversed(recent_items))

    return ChatHistoryResponse(
        messages=[_format_message(m) for m in chronological_items],
        total=total,
    )


@router.post("/message", response_model=ChatMessageItem, status_code=status.HTTP_201_CREATED)
def create_chat_message(
    body: ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Save a new chat message for the authenticated user.
    """
    _ensure_profile_exists(db, current_user_id)

    payload_str = None
    if body.payload is not None:
        if isinstance(body.payload, str):
            payload_str = body.payload
        else:
            payload_str = json.dumps(body.payload)

    new_msg = ChatMessage(
        user_id=current_user_id,
        role=body.role,
        text=body.text,
        payload=payload_str,
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)

    return _format_message(new_msg)


@router.delete("/history")
def clear_chat_history(
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Delete all chat history for the authenticated user.
    """
    _ensure_profile_exists(db, current_user_id)
    deleted_count = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == current_user_id)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"status": "cleared", "deleted_count": deleted_count}
