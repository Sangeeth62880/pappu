"""
Pydantic schemas for Text-to-Speech (TTS) requests and responses.
"""

from typing import Optional
from pydantic import BaseModel, Field


class TTSRequest(BaseModel):
    """Request payload for text-to-speech synthesis."""
    text: str = Field(
        ...,
        min_length=1,
        max_length=2500,
        description="Text content to be synthesized to speech",
    )
    target_language_code: Optional[str] = Field(
        "en-IN",
        description="Target language code (e.g., 'en-IN', 'ml-IN', 'hi-IN')",
    )
    speaker: Optional[str] = Field(
        "kavitha",
        description="Bulbul v3 speaker voice (e.g. 'kavitha', 'kavya', 'arya', 'gokul')",
    )
    pace: Optional[float] = Field(
        1.0,
        ge=0.5,
        le=2.0,
        description="Speech pacing speed (0.5 to 2.0)",
    )


class TTSResponse(BaseModel):
    """Response payload containing base64 audio and metadata."""
    audio_base64: str = Field(
        ...,
        description="Base64-encoded WAV audio data",
    )
    language_code: str = Field(
        ...,
        description="Language code used for synthesis",
    )
    audio_format: str = Field(
        default="audio/wav",
        description="MIME format of the synthesized audio",
    )
    request_id: Optional[str] = Field(
        None,
        description="Sarvam API request ID",
    )
