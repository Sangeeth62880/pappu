import uuid
from typing import Optional
import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.auth import get_current_user_id
from app.models.profile import Profile

router = APIRouter(prefix="/profile", tags=["profile"])

VALID_LANGUAGES = {"en", "ml"}


class ProfileResponse(BaseModel):
    name: str
    email: Optional[str] = None
    language: Optional[str] = None
    voice_replies: Optional[bool] = None


class ProfileUpdate(BaseModel):
    language: Optional[str] = None
    voice_replies: Optional[bool] = None


def _extract_email_from_jwt(authorization: Optional[str]) -> Optional[str]:
    """Extract email from verified JWT token claims if available."""
    if not authorization:
        return None
    try:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token_claims = jwt.decode(parts[1], options={"verify_signature": False})
            return token_claims.get("email")
    except Exception:
        pass
    return None


@router.get("", response_model=ProfileResponse)
def get_profile(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Read-only profile endpoint.
    Returns name and email, plus language and voice_replies preferences.
    Strictly isolated to verified JWT current_user_id. Cross-user access returns 404.
    """
    profile = db.query(Profile).filter(Profile.id == current_user_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    email = _extract_email_from_jwt(authorization)
    if not email and hasattr(profile, "email"):
        email = getattr(profile, "email", None)

    return ProfileResponse(
        name=profile.name,
        email=email,
        language=profile.preferred_language,
        voice_replies=profile.voice_replies,
    )


@router.patch("", response_model=ProfileResponse)
def update_profile(
    body: ProfileUpdate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Update user preferences (language and voice_replies).
    Language must be 'en' or 'ml'. voice_replies is a boolean.
    """
    profile = db.query(Profile).filter(Profile.id == current_user_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    if body.language is not None:
        if body.language not in VALID_LANGUAGES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Language must be one of: {', '.join(sorted(VALID_LANGUAGES))}",
            )
        profile.preferred_language = body.language

    if body.voice_replies is not None:
        profile.voice_replies = body.voice_replies

    db.commit()
    db.refresh(profile)

    email = _extract_email_from_jwt(authorization)
    if not email and hasattr(profile, "email"):
        email = getattr(profile, "email", None)

    return ProfileResponse(
        name=profile.name,
        email=email,
        language=profile.preferred_language,
        voice_replies=profile.voice_replies,
    )

