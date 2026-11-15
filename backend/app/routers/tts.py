"""
Router for Text-to-Speech (TTS) endpoints using Sarvam Bulbul v3.
"""

import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user_id
from app.rate_limit import rate_limit
from app.schemas.tts import TTSRequest, TTSResponse
from app.tts.client import SarvamTTSClient, TTSError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tts", tags=["text-to-speech"])


# A plain `def`: the Sarvam call blocks, so it must run in the thread pool, not on the event loop.
@router.post("/synthesize", response_model=TTSResponse, dependencies=[Depends(rate_limit("tts"))])
def synthesize_speech(
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
            # Our own 400s are safe to show; upstream error text stays in the log.
            detail=str(e) if e.status_code == 400 else "Speech synthesis failed",
        )
    except Exception as e:
        logger.error(f"Unexpected internal error in /tts/synthesize: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal error processing TTS",
        )
