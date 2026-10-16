"""
Tests for profile preference persistence via PATCH /profile.

Covers:
- GET /profile returns defaults
- PATCH /profile persists language
- PATCH /profile persists voice_replies
- PATCH /profile rejects invalid language
- PATCH /profile partial updates (language only, voice_replies only)
- Clear chat does not affect profile preferences
"""

import uuid
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db, init_db
from app.models import Profile
from app.auth import jwks_client
from tests.test_auth import create_test_es256_jwt, test_public_key, MockSigningKey

client = TestClient(app)


@pytest.fixture
def test_db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    init_db(bind_engine=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    session = TestingSessionLocal()
    try:
        with patch.object(jwks_client, "get_signing_key_from_jwt", return_value=MockSigningKey(test_public_key)):
            yield session
    finally:
        session.close()
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(bind=engine)


def _create_profile(session, user_id, name="Test User", language="en", voice_replies=True):
    """Helper to create a profile in the test DB."""
    profile = Profile(
        id=uuid.UUID(user_id),
        name=name,
        preferred_language=language,
        voice_replies=voice_replies,
    )
    session.add(profile)
    session.commit()
    return profile


class TestGetProfile:
    def test_get_profile_returns_defaults(self, test_db_session):
        user_id = str(uuid.uuid4())
        _create_profile(test_db_session, user_id)
        token = create_test_es256_jwt(user_id=user_id)
        headers = {"Authorization": f"Bearer {token}"}

        res = client.get("/profile", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["name"] == "Test User"
        assert data["language"] == "en"
        assert data["voice_replies"] is True

    def test_get_profile_404_for_missing(self, test_db_session):
        user_id = str(uuid.uuid4())
        token = create_test_es256_jwt(user_id=user_id)
        headers = {"Authorization": f"Bearer {token}"}

        res = client.get("/profile", headers=headers)
        assert res.status_code == 404


class TestPatchProfile:
    def test_patch_language_en_to_ml(self, test_db_session):
        user_id = str(uuid.uuid4())
        _create_profile(test_db_session, user_id, language="en")
        token = create_test_es256_jwt(user_id=user_id)
        headers = {"Authorization": f"Bearer {token}"}

        res = client.patch("/profile", json={"language": "ml"}, headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["language"] == "ml"

        # Verify persistence via GET
        get_res = client.get("/profile", headers=headers)
        assert get_res.json()["language"] == "ml"

    def test_patch_voice_replies_off(self, test_db_session):
        user_id = str(uuid.uuid4())
        _create_profile(test_db_session, user_id, voice_replies=True)
        token = create_test_es256_jwt(user_id=user_id)
        headers = {"Authorization": f"Bearer {token}"}

        res = client.patch("/profile", json={"voice_replies": False}, headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["voice_replies"] is False

        # Verify persistence via GET
        get_res = client.get("/profile", headers=headers)
        assert get_res.json()["voice_replies"] is False

    def test_patch_voice_replies_on(self, test_db_session):
        user_id = str(uuid.uuid4())
        _create_profile(test_db_session, user_id, voice_replies=False)
        token = create_test_es256_jwt(user_id=user_id)
        headers = {"Authorization": f"Bearer {token}"}

        res = client.patch("/profile", json={"voice_replies": True}, headers=headers)
        assert res.status_code == 200
        assert res.json()["voice_replies"] is True

    def test_patch_both_language_and_voice(self, test_db_session):
        user_id = str(uuid.uuid4())
        _create_profile(test_db_session, user_id, language="en", voice_replies=True)
        token = create_test_es256_jwt(user_id=user_id)
        headers = {"Authorization": f"Bearer {token}"}

        res = client.patch(
            "/profile",
            json={"language": "ml", "voice_replies": False},
            headers=headers,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["language"] == "ml"
        assert data["voice_replies"] is False

    def test_patch_invalid_language_rejected(self, test_db_session):
        user_id = str(uuid.uuid4())
        _create_profile(test_db_session, user_id)
        token = create_test_es256_jwt(user_id=user_id)
        headers = {"Authorization": f"Bearer {token}"}

        res = client.patch("/profile", json={"language": "fr"}, headers=headers)
        assert res.status_code == 422

        # Original language unchanged
        get_res = client.get("/profile", headers=headers)
        assert get_res.json()["language"] == "en"

    def test_patch_empty_body_is_noop(self, test_db_session):
        user_id = str(uuid.uuid4())
        _create_profile(test_db_session, user_id, language="ml", voice_replies=False)
        token = create_test_es256_jwt(user_id=user_id)
        headers = {"Authorization": f"Bearer {token}"}

        res = client.patch("/profile", json={}, headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["language"] == "ml"
        assert data["voice_replies"] is False

    def test_patch_profile_404_for_missing(self, test_db_session):
        user_id = str(uuid.uuid4())
        token = create_test_es256_jwt(user_id=user_id)
        headers = {"Authorization": f"Bearer {token}"}

        res = client.patch("/profile", json={"language": "en"}, headers=headers)
        assert res.status_code == 404


class TestClearChatDoesNotAffectProfile:
    def test_clear_chat_preserves_preferences(self, test_db_session):
        user_id = str(uuid.uuid4())
        _create_profile(test_db_session, user_id, language="ml", voice_replies=False)
        token = create_test_es256_jwt(user_id=user_id)
        headers = {"Authorization": f"Bearer {token}"}

        # Add a chat message
        client.post(
            "/chat/message",
            json={"role": "user", "text": "Hello"},
            headers=headers,
        )

        # Clear chat
        del_res = client.delete("/chat/history", headers=headers)
        assert del_res.status_code == 200

        # Profile preferences must be intact
        get_res = client.get("/profile", headers=headers)
        data = get_res.json()
        assert data["language"] == "ml"
        assert data["voice_replies"] is False
