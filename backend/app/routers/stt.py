import logging
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status

from app.auth import get_current_user_id
from app.rate_limit import rate_limit
from app.stt.client import SarvamSTTClient, STTError
from app.schemas.stt import STTResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/stt", tags=["speech-to-text"])

# A voice note for one command is well under a megabyte; refuse anything far beyond that.
MAX_AUDIO_BYTES = 10 * 1024 * 1024


# A plain `def`: the Sarvam call blocks, so it must run in the thread pool, not on the event loop.
@router.post("/transcribe", response_model=STTResponse, dependencies=[Depends(rate_limit("stt"))])
def transcribe_audio(
    file: UploadFile = File(...),
    language_code: Optional[str] = Form(None),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Transcribe spoken audio input using Sarvam Saaras v3.
    Accepts audio file (WAV, MP3, AAC, M4A, WEBM, OGG) and returns transcribed text.
    """
    if not file or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio file is required",
        )

    audio_bytes = file.file.read(MAX_AUDIO_BYTES + 1)
    if len(audio_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded audio file is empty",
        )
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Audio file is too large",
        )

    try:
        client = SarvamSTTClient()
        return client.transcribe(
            audio_bytes=audio_bytes,
            filename=file.filename or "recording.m4a",
            content_type=file.content_type or "audio/mp4",
            language_code=language_code or "unknown",
        )
    except STTError as e:
        # The upstream error text stays in the log; the client gets a fixed message.
        logger.error("STT error in /stt/transcribe: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Speech transcription failed",
        )
    except Exception as e:
        logger.error("Unexpected error in /stt/transcribe: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal error processing audio",
        )
