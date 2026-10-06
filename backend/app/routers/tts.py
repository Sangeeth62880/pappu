"""
Router for Text-to-Speech (TTS) endpoints using Sarvam Bulbul v3.
"""

import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user_id
from app.schemas.tts import TTSRequest, TTSResponse
from app.tts.client import SarvamTTSClient, TTSError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tts", tags=["text-to-speech"])


@router.post("/synthesize", response_model=TTSResponse)
async def synthesize_speech(
    request: TTSRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Synthesize text into speech audio using Sarvam Bulbul v3.
    Accepts text, target language code (e.g. 'ml-IN', 'en-IN'), and optional voice/pace.
    Returns base64 encoded audio.
    """
    try:
        client = SarvamTTSClient()
        response = client.synthesize(
            text=request.text,
            target_language_code=request.target_language_code,
            speaker=request.speaker,
            pace=request.pace or 1.0,
        )
        return response
    except TTSError as e:
        logger.error(f"TTS error in /tts/synthesize: {e}", exc_info=True)
        raise HTTPException(
            status_code=e.status_code,
            detail=f"Speech synthesis failed: {str(e)}",
        )
    except Exception as e:
        logger.error(f"Unexpected internal error in /tts/synthesize: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error processing TTS: {str(e)}",
        )
