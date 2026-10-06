import uuid
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status

from app.auth import get_current_user_id
from app.stt.client import SarvamSTTClient, STTError
from app.schemas.stt import STTResponse

router = APIRouter(prefix="/stt", tags=["speech-to-text"])

@router.post("/transcribe", response_model=STTResponse)
async def transcribe_audio(
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

    try:
        audio_bytes = await file.read()
        if len(audio_bytes) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded audio file is empty",
            )

        client = SarvamSTTClient()
        response = client.transcribe(
            audio_bytes=audio_bytes,
            filename=file.filename or "recording.m4a",
            content_type=file.content_type or "audio/mp4",
            language_code=language_code or "unknown",
        )
        return response
    except STTError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Speech transcription failed: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error processing audio: {str(e)}",
        )
