import uuid
import ssl
import certifi
import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientError, PyJWKError, ExpiredSignatureError, InvalidTokenError
from fastapi import Header, HTTPException, status
from app.config import SUPABASE_JWKS_URL

# Create SSL context using certifi CA bundle to ensure reliable TLS handshake across platforms
ssl_context = ssl.create_default_context(cafile=certifi.where())

# Initialize cached JWKS client for asymmetric ES256 public key verification
jwks_client = PyJWKClient(SUPABASE_JWKS_URL, cache_keys=True, ssl_context=ssl_context)
fallback_jwks_client = PyJWKClient(
    "https://mvobtveaewxgiczulyrq.supabase.co/auth/v1/.well-known/jwks.json",
    cache_keys=True,
    ssl_context=ssl_context,
)

def get_current_user_id(authorization: str | None = Header(None)) -> uuid.UUID:
    """
    FastAPI dependency to extract and verify the Supabase JWT from the Authorization header
    using Supabase's public JWKS endpoint (ES256 asymmetric signing keys).
    Extracts user_id from the verified 'sub' claim.
    Never trusts user_id from request body (per PROJECT_SPEC.md §8 & CLAUDE.md).
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format. Expected 'Bearer <token>'",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = parts[1]

    try:
        try:
            signing_key = jwks_client.get_signing_key_from_jwt(token)
        except (PyJWKClientError, PyJWKError):
            signing_key = fallback_jwks_client.get_signing_key_from_jwt(token)

        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            options={"verify_aud": False},
        )
        user_id_str = payload.get("sub")
        if not user_id_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing 'sub' claim",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return uuid.UUID(user_id_str)
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (InvalidTokenError, PyJWKClientError, PyJWKError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
