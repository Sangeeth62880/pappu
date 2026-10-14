"""
Tests for Fix 5:
- assistant_traces write off the request path via background tasks.
- chat_messages saving remains synchronous.
"""
import uuid
from decimal import Decimal
from datetime import date
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db, init_db
from app.models.profile import Profile
from app.models.category import Category
from app.models.chat_message import ChatMessage
from app.models.assistant_trace import AssistantTrace
from app.assistant.schemas import Plan, AddAction
from app.assistant.planner import AssistantPlanner
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
        with patch.object(
            jwks_client,
            "get_signing_key_from_jwt",
            return_value=MockSigningKey(test_public_key),
        ):
            yield session
    finally:
        session.close()
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)


def test_chat_messages_synchronous_and_trace_persisted(test_db_session):
    user_id = uuid.uuid4()
    prof = Profile(id=user_id, name="Async Trace User", preferred_language="en")
    test_db_session.add(prof)
    test_db_session.commit()

    token = create_test_es256_jwt(user_id=str(user_id))
    headers = {"Authorization": f"Bearer {token}"}

    mock_plan = Plan(
        actions=[AddAction(op="add", kind="expense", amount=150.0, category="Food")],
        language="en",
    )

    with patch.object(AssistantPlanner, "plan", return_value=mock_plan):
        res = client.post(
            "/assistant/message",
            json={"text": "Spent 150 on food", "input": "typed"},
            headers=headers,
        )

    assert res.status_code == 200

    # 1. Chat messages must be present immediately synchronously
    chat_msgs = (
        test_db_session.query(ChatMessage)
        .filter(ChatMessage.user_id == user_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    assert len(chat_msgs) == 2
    assert chat_msgs[0].role == "user"
    assert chat_msgs[0].text == "Spent 150 on food"
    assert chat_msgs[1].role == "assistant"
    assert "₹150" in chat_msgs[1].text

    # 2. AssistantTrace must be saved (TestClient executes background tasks before returning)
    trace = (
        test_db_session.query(AssistantTrace)
        .filter(AssistantTrace.user_id == user_id)
        .first()
    )
    assert trace is not None
    assert trace.message_text == "Spent 150 on food"
    assert trace.reply_text == res.json()["reply_text"]
