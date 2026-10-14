"""
Tests for Fix 7: Chat saves and context.
- Single writer: one send produces exactly two chat_messages rows.
- Current user message is excluded from last_3_chat_turns.
- Deduplication of consecutive identical chat turns in context.
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, init_db, get_db
from app.auth import jwks_client
from app.models.profile import Profile
from app.models.chat_message import ChatMessage
from app.assistant.context import load_assistant_context
from tests.test_assistant_message import _auth_header, MockSigningKey, test_public_key

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
        with patch.object(
            jwks_client,
            "get_signing_key_from_jwt",
            return_value=MockSigningKey(test_public_key),
        ):
            yield session
    finally:
        session.close()
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(bind=engine)


def test_one_send_produces_exactly_two_chat_messages_rows(test_db_session: Session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Chat Single Writer User", preferred_language="en")
    test_db_session.add(profile)
    test_db_session.commit()

    headers = _auth_header(user_id)
    res = client.post(
        "/assistant/message",
        json={"text": "Spent 250 on lunch", "input": "typed"},
        headers=headers,
    )
    assert res.status_code == 200

    # Assert exactly two chat_messages rows created
    rows = (
        test_db_session.query(ChatMessage)
        .filter(ChatMessage.user_id == user_id)
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        .all()
    )
    assert len(rows) == 2
    assert rows[0].role == "user"
    assert rows[0].text == "Spent 250 on lunch"
    assert rows[1].role == "assistant"
    assert "Added ₹250 to Food." in rows[1].text


def test_exclude_current_message_from_last_3_chat_turns(test_db_session: Session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Context User", preferred_language="en")
    test_db_session.add(profile)

    # Pre-populate prior turn
    m1 = ChatMessage(user_id=user_id, role="user", text="Earlier message")
    m2 = ChatMessage(user_id=user_id, role="assistant", text="Earlier reply")
    # Pre-populate a message matching the current message
    m3 = ChatMessage(user_id=user_id, role="user", text="Current query text")
    test_db_session.add_all([m1, m2, m3])
    test_db_session.commit()

    ctx = load_assistant_context(
        user_id=user_id,
        db=test_db_session,
        current_message_text="Current query text",
    )

    texts = [turn.text for turn in ctx.last_3_chat_turns]
    assert "Current query text" not in texts
    assert "Earlier message" in texts
    assert "Earlier reply" in texts


def test_deduplicate_consecutive_identical_chat_turns(test_db_session: Session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Dedup User", preferred_language="en")
    test_db_session.add(profile)

    # Pre-populate duplicate messages
    m1 = ChatMessage(user_id=user_id, role="user", text="Hello")
    m2 = ChatMessage(user_id=user_id, role="user", text="Hello")
    m3 = ChatMessage(user_id=user_id, role="assistant", text="Hi there")
    m4 = ChatMessage(user_id=user_id, role="assistant", text="Hi there")
    test_db_session.add_all([m1, m2, m3, m4])
    test_db_session.commit()

    ctx = load_assistant_context(user_id=user_id, db=test_db_session)
    assert len(ctx.last_3_chat_turns) == 2
    assert ctx.last_3_chat_turns[0].role == "user"
    assert ctx.last_3_chat_turns[0].text == "Hello"
    assert ctx.last_3_chat_turns[1].role == "assistant"
    assert ctx.last_3_chat_turns[1].text == "Hi there"
