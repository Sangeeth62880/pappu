"""
Intent parser router.

Endpoint:
- POST /intent/parse: Plain text -> validated IntentObject
"""

import uuid
import logging
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user_id
from app.llm.client import SarvamLLMClient
from app.schemas.intent import IntentObject, IntentValidationError

router = APIRouter(prefix="/intent", tags=["intent"])
logger = logging.getLogger(__name__)


class IntentParseRequest(BaseModel):
    """Request body for /intent/parse."""
    text: str


class IntentParseResponse(BaseModel):
    """Response body wrapping the parsed intent."""
    intent: IntentObject


# Lazily initialized client (avoids requiring SARVAM_API_KEY at import time)
_llm_client: SarvamLLMClient | None = None


def _get_llm_client() -> SarvamLLMClient:
    """Get or create the LLM client singleton."""
    global _llm_client
    if _llm_client is None:
        _llm_client = SarvamLLMClient()
    return _llm_client


@router.post("/parse", response_model=IntentParseResponse)
def parse_intent(
    payload: IntentParseRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Parse plain text into a structured intent object.
    Requires a valid Supabase JWT.
    """
    if not payload.text or not payload.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text input cannot be empty",
        )

    try:
        client = _get_llm_client()
        intent = client.parse_intent(payload.text.strip())
        return IntentParseResponse(intent=intent)
    except IntentValidationError as e:
        logger.warning(f"Intent validation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse intent: {e}",
        )
    except Exception as e:
        logger.error(f"LLM service error in /intent/parse: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM service error: {e}",
        )
