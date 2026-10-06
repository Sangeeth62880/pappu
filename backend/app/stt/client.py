"""
Sarvam AI Speech-to-Text (Saaras v3) Client.

Handles audio file upload and speech transcription in English, Malayalam,
and code-mixed language.
"""

import logging
from typing import Optional
import httpx

from app.config import SARVAM_API_KEY, SARVAM_STT_MODEL, SARVAM_STT_API_URL
from app.schemas.stt import STTResponse

logger = logging.getLogger(__name__)

class STTError(Exception):
    """Raised when Speech-to-Text transcription fails."""
    pass

class SarvamSTTClient:
    """
    Client for Sarvam AI Speech-to-Text API (Saaras v3).
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        api_url: Optional[str] = None,
    ):
        self.api_key = api_key if api_key is not None else SARVAM_API_KEY
        self.model = model if model is not None else SARVAM_STT_MODEL
        self.api_url = api_url if api_url is not None else SARVAM_STT_API_URL

        if not self.api_key:
            raise ValueError(
                "SARVAM_API_KEY is required. Set it in backend/.env or pass it directly."
            )

    def transcribe(
        self,
        audio_bytes: bytes,
        filename: str = "audio.wav",
        content_type: str = "audio/wav",
        language_code: Optional[str] = "unknown",
    ) -> STTResponse:
        """
        Transcribe audio bytes to text using Sarvam Saaras v3.

        Args:
            audio_bytes: Raw binary audio data.
            filename: Audio filename (e.g. audio.wav, recording.webm, audio.m4a).
            content_type: MIME type of the audio.
            language_code: Target or hint language code ('en-IN', 'ml-IN', or 'unknown' for auto-detection).

        Returns:
            STTResponse containing the transcript and detected language.

        Raises:
            STTError: If the audio is empty or the API request fails.
        """
        if not audio_bytes or len(audio_bytes) == 0:
            raise STTError("Audio data cannot be empty.")

        if content_type == "audio/m4a":
            content_type = "audio/mp4"

        headers = {
            "api-subscription-key": self.api_key,
        }
        files = {
            "file": (filename, audio_bytes, content_type),
        }
        data = {
            "model": self.model,
            "language_code": language_code or "unknown",
        }

        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    self.api_url,
                    headers=headers,
                    files=files,
                    data=data,
                )
                response.raise_for_status()

            res_data = response.json()
            transcript = res_data.get("transcript", "")
            return STTResponse(
                transcript=transcript.strip() if transcript else "",
                language_code=res_data.get("language_code"),
                language_probability=res_data.get("language_probability"),
                request_id=res_data.get("request_id"),
            )
        except httpx.HTTPStatusError as e:
            logger.error(f"Sarvam STT HTTP error: {e.response.status_code} {e.response.text}")
            raise STTError(f"STT API request failed: {e.response.status_code} - {e.response.text}") from e
        except Exception as e:
            logger.error(f"Sarvam STT unexpected error: {e}")
            raise STTError(f"Failed to transcribe audio: {e}") from e
