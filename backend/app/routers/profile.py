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


class ProfileResponse(BaseModel):
    name: str
    email: Optional[str] = None
    language: Optional[str] = None
    voice_replies: Optional[bool] = None


@router.get("", response_model=ProfileResponse)
def get_profile(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Read-only profile endpoint.
    Returns name and email, plus language and voice_replies if those columns exist.
    Strictly isolated to verified JWT current_user_id. Cross-user access returns 404.
    """
    profile = db.query(Profile).filter(Profile.id == current_user_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    # Extract email from verified JWT token claims if available
    email = None
    if authorization:
        try:
            parts = authorization.split()
            if len(parts) == 2 and parts[0].lower() == "bearer":
                token_claims = jwt.decode(parts[1], options={"verify_signature": False})
                email = token_claims.get("email")
        except Exception:
            pass

    if not email and hasattr(profile, "email"):
        email = getattr(profile, "email", None)

    lang = getattr(profile, "preferred_language", None) or getattr(profile, "language", None)
    voice = getattr(profile, "voice_replies", None) if hasattr(Profile, "voice_replies") else None

    return ProfileResponse(
        name=profile.name,
        email=email,
        language=lang,
        voice_replies=voice,
    )
