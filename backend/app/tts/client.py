"""
Sarvam AI Text-to-Speech (Bulbul v3) Client.

Handles synthesizing text into spoken audio in English and Malayalam.
"""

import logging
from typing import Optional
import httpx

from app.config import (
    SARVAM_API_KEY,
    SARVAM_TTS_MODEL,
    SARVAM_TTS_API_URL,
    SARVAM_TTS_DEFAULT_SPEAKER,
)
from app.schemas.tts import TTSResponse

logger = logging.getLogger(__name__)


class TTSError(Exception):
    """Raised when Text-to-Speech synthesis fails."""
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def normalize_tts_language_code(language_code: Optional[str]) -> str:
    """
    Map shorthand language codes to Sarvam TTS target_language_code format.
    'ml', 'malayalam' -> 'ml-IN'
    'en', 'english', 'mixed' -> 'en-IN'
    """
    if not language_code:
        return "en-IN"
    code = language_code.strip().lower()
    if code in ("ml", "ml-in", "malayalam"):
        return "ml-IN"
    if code in ("hi", "hi-in", "hindi"):
        return "hi-IN"
    if code in ("ta", "ta-in", "tamil"):
        return "ta-IN"
    if code in ("te", "te-in", "telugu"):
        return "te-IN"
    return "en-IN"


class SarvamTTSClient:
    """
    Client for Sarvam AI Text-to-Speech API (Bulbul v3).
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        api_url: Optional[str] = None,
        default_speaker: Optional[str] = None,
    ):
        self.api_key = api_key if api_key is not None else SARVAM_API_KEY
        self.model = model if model is not None else SARVAM_TTS_MODEL
        self.api_url = api_url if api_url is not None else SARVAM_TTS_API_URL
        self.default_speaker = (
            default_speaker if default_speaker is not None else SARVAM_TTS_DEFAULT_SPEAKER
        )

        if not self.api_key:
            raise ValueError(
                "SARVAM_API_KEY is required. Set it in backend/.env or pass it directly."
            )

    def synthesize(
        self,
        text: str,
        target_language_code: Optional[str] = "en-IN",
        speaker: Optional[str] = None,
        pace: float = 1.0,
    ) -> TTSResponse:
        """
        Synthesize text into speech audio using Sarvam Bulbul v3.

        Args:
            text: Text to be synthesized into speech (max 2500 characters).
            target_language_code: Language code ('en-IN', 'ml-IN', etc.).
            speaker: Bulbul v3 voice speaker (default 'kavitha').
            pace: Speech pacing speed (0.5 to 2.0). Note: pitch and loudness are NOT supported on Bulbul v3.

        Returns:
            TTSResponse containing base64 audio and metadata.

        Raises:
            TTSError: If text is empty or the API request fails.
        """
        clean_text = (text or "").strip()
        if not clean_text:
            raise TTSError("Text cannot be empty for speech synthesis.", status_code=400)

        lang_code = normalize_tts_language_code(target_language_code)
        speaker_voice = speaker or self.default_speaker

        headers = {
            "api-subscription-key": self.api_key,
            "Content-Type": "application/json",
        }
        # Note: pitch and loudness must NOT be included for bulbul:v3
        payload = {
            "inputs": [clean_text],
            "target_language_code": lang_code,
            "speaker": speaker_voice,
            "pace": pace,
            "speech_sample_rate": 24000,
            "enable_preprocessing": True,
            "model": self.model,
        }

        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    self.api_url,
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()

            res_data = response.json()
            audios = res_data.get("audios", [])
            if not audios or not audios[0]:
                raise TTSError("No audio data returned by TTS service.", status_code=502)

            return TTSResponse(
                audio_base64=audios[0],
                language_code=lang_code,
                audio_format="audio/wav",
                request_id=res_data.get("request_id"),
            )
        except httpx.HTTPStatusError as e:
            status_code = e.response.status_code
            error_text = e.response.text
            logger.error(f"Sarvam TTS HTTP error: {status_code} {error_text}")
            forward_status = status_code if status_code < 500 else 502
            raise TTSError(f"TTS API request failed: {status_code} - {error_text}", status_code=forward_status) from e
        except TTSError:
            raise
        except Exception as e:
            logger.error(f"Sarvam TTS unexpected error: {e}")
            raise TTSError(f"Failed to synthesize speech: {e}", status_code=500) from e
