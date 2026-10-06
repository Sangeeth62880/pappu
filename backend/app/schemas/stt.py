from typing import Optional
from pydantic import BaseModel, Field

class STTResponse(BaseModel):
    """
    Response model for speech-to-text transcription.
    """
    transcript: str = Field(..., description="Transcribed text from the audio")
    language_code: Optional[str] = Field(None, description="Detected or specified language code (e.g. en-IN, ml-IN)")
    language_probability: Optional[float] = Field(None, description="Confidence score for language detection")
    request_id: Optional[str] = Field(None, description="Sarvam API request tracking ID")
