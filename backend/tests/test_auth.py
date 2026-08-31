import time
import uuid
import jwt
import pytest
from unittest.mock import patch
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient

from app.auth import get_current_user_id, jwks_client

# Generate a test EC P-256 keypair for ES256 testing
test_private_key = ec.generate_private_key(ec.SECP256R1())
test_public_key = test_private_key.public_key()

other_private_key = ec.generate_private_key(ec.SECP256R1())
other_public_key = other_private_key.public_key()

test_app = FastAPI()

@test_app.get("/protected")
def protected_route(user_id: uuid.UUID = Depends(get_current_user_id)):
    return {"user_id": str(user_id)}

client = TestClient(test_app)

class MockSigningKey:
    def __init__(self, key):
        self.key = key

def create_test_es256_jwt(
    user_id: str,
    key=test_private_key,
    kid: str = "test-key-id",
    exp_delta: int = 3600,
    include_sub: bool = True,
):
    payload = {
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + exp_delta,
    }
    if include_sub:
        payload["sub"] = user_id
    return jwt.encode(payload, key, algorithm="ES256", headers={"kid": kid})

def test_auth_valid_es256_jwt():
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)

    with patch.object(jwks_client, "get_signing_key_from_jwt", return_value=MockSigningKey(test_public_key)):
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
    token = create_test_es256_jwt(user_id, exp_delta=-100)

    with patch.object(jwks_client, "get_signing_key_from_jwt", return_value=MockSigningKey(test_public_key)):
        response = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401
        assert "Token has expired" in response.json()["detail"]

def test_auth_invalid_signature():
    user_id = str(uuid.uuid4())
    # Signed by a different key than what JWKS returns
    token = create_test_es256_jwt(user_id, key=other_private_key)

    with patch.object(jwks_client, "get_signing_key_from_jwt", return_value=MockSigningKey(test_public_key)):
        response = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401
        assert "Invalid token" in response.json()["detail"]

def test_auth_missing_sub_claim():
    token = create_test_es256_jwt(user_id="dummy", include_sub=False)

    with patch.object(jwks_client, "get_signing_key_from_jwt", return_value=MockSigningKey(test_public_key)):
        response = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401
        assert "Token missing 'sub' claim" in response.json()["detail"]

def test_auth_invalid_uuid_sub():
    token = create_test_es256_jwt(user_id="not-a-valid-uuid")

    with patch.object(jwks_client, "get_signing_key_from_jwt", return_value=MockSigningKey(test_public_key)):
        response = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401
        assert "Invalid token" in response.json()["detail"]
