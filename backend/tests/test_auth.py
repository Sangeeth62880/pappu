import time
import uuid
import jwt
import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient

from app.auth import get_current_user_id
from app.config import SUPABASE_JWT_SECRET

# Test app with protected route
test_app = FastAPI()

@test_app.get("/protected")
def protected_route(user_id: uuid.UUID = Depends(get_current_user_id)):
    return {"user_id": str(user_id)}

client = TestClient(test_app)

def create_test_jwt(user_id: str, secret: str = SUPABASE_JWT_SECRET, exp_delta: int = 3600, include_sub: bool = True):
    payload = {
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + exp_delta,
    }
    if include_sub:
        payload["sub"] = user_id
    return jwt.encode(payload, secret, algorithm="HS256")

def test_auth_valid_jwt():
    user_id = str(uuid.uuid4())
    token = create_test_jwt(user_id)

    response = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json() == {"user_id": user_id}

def test_auth_missing_header():
    response = client.get("/protected")
    assert response.status_code == 401
    assert "Authorization header missing" in response.json()["detail"]

def test_auth_invalid_header_format():
    response = client.get("/protected", headers={"Authorization": "Basic 12345"})
    assert response.status_code == 401
    assert "Invalid authorization header format" in response.json()["detail"]

def test_auth_expired_jwt():
    user_id = str(uuid.uuid4())
    token = create_test_jwt(user_id, exp_delta=-100) # expired in the past

    response = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert "Token has expired" in response.json()["detail"]

def test_auth_invalid_signature():
    user_id = str(uuid.uuid4())
    token = create_test_jwt(user_id, secret="wrong-secret-key")

    response = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert "Invalid token" in response.json()["detail"]

def test_auth_missing_sub_claim():
    token = create_test_jwt(user_id="dummy", include_sub=False)

    response = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert "Token missing 'sub' claim" in response.json()["detail"]

def test_auth_invalid_uuid_sub():
    token = create_test_jwt(user_id="not-a-valid-uuid")

    response = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert "Invalid token" in response.json()["detail"]
