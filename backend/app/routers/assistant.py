"""
Assistant Router for Pappu Assistant v2.

Endpoints:
- POST /assistant/pending/{id}/answer: Deterministically resolves an active confirmation.
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user_id
from app.assistant.schemas import PendingAnswerRequest, AssistantResponse
from app.assistant.pending import handle_answer_pending, get_pending_by_id

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.post("/pending/{pending_id}/answer", response_model=AssistantResponse)
def answer_pending_endpoint(
    pending_id: uuid.UUID,
    body: PendingAnswerRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> AssistantResponse:
    """
    Deterministically resolves an active pending confirmation (yes, no, pick, cancel).
    No LLM call is executed.
    Cross-user pending IDs return 404.
    """
    # Verify pending item exists and belongs to the authenticated user
    item = get_pending_by_id(db, pending_id, user_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pending confirmation not found",
        )

    response = handle_answer_pending(
        db=db,
        user_id=user_id,
        pending_id=pending_id,
        answer=body.answer,
        index=body.index,
    )

    if response is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pending confirmation not found",
        )

    return response
