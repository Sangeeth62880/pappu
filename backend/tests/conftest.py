import os

# app.config refuses to import without a Supabase JWKS endpoint. Tests never hit
# the network (jwks_client is patched), so a placeholder project URL is enough.
os.environ.setdefault("SUPABASE_URL", "https://test-project.supabase.co")


# ---- Shared fixtures for the bill split tests (Phase 14) ----
import uuid as _uuid
from unittest.mock import patch as _patch

import pytest as _pytest


@_pytest.fixture
def bill_db():
    """In-memory database wired into the app, with JWT verification pointed at the test key."""
    from sqlalchemy import create_engine, event
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from app.auth import jwks_client
    from app.database import get_db, init_db
    from app.main import app
    from tests.test_auth import MockSigningKey, test_public_key

    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    init_db(bind_engine=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    session = TestingSessionLocal()
    try:
        with _patch.object(
            jwks_client, "get_signing_key_from_jwt", return_value=MockSigningKey(test_public_key)
        ):
            yield session
    finally:
        session.close()
        app.dependency_overrides.pop(get_db, None)


@_pytest.fixture
def make_user(bill_db):
    """Creates a profile and returns (user_id, auth headers) for a verified token of that user."""
    from app.models.profile import Profile
    from tests.test_auth import create_test_es256_jwt

    def _make(name="Test User", language="en", upi_id=None):
        user_id = _uuid.uuid4()
        bill_db.add(Profile(id=user_id, name=name, preferred_language=language, upi_id=upi_id))
        bill_db.commit()
        token = create_test_es256_jwt(user_id=str(user_id))
        return user_id, {"Authorization": f"Bearer {token}"}

    return _make
