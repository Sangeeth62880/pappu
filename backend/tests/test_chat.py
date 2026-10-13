import uuid
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db, init_db
from app.models import ChatMessage, Profile
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


def test_create_and_fetch_chat_message(test_db_session):
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id=user_id)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Post user message
    res_user = client.post(
        "/chat/message",
        json={"role": "user", "text": "Spent 250 on lunch"},
        headers=headers,
    )
    assert res_user.status_code == 201
    data_user = res_user.json()
    assert data_user["role"] == "user"
    assert data_user["text"] == "Spent 250 on lunch"
    assert data_user["user_id"] == str(user_id)

    # 2. Post assistant reply with payload
    res_asst = client.post(
        "/chat/message",
        json={
            "role": "assistant",
            "text": "Added lunch for ₹250",
            "payload": {"type": "add", "amount": 250},
        },
        headers=headers,
    )
    assert res_asst.status_code == 201
    data_asst = res_asst.json()
    assert data_asst["role"] == "assistant"
    assert data_asst["payload"]["amount"] == 250

    # 3. Fetch history
    res_history = client.get("/chat/history", headers=headers)
    assert res_history.status_code == 200
    history = res_history.json()
    assert history["total"] == 2
    assert len(history["messages"]) == 2
    # Chronological ordering: user message first, then assistant
    assert history["messages"][0]["role"] == "user"
    assert history["messages"][1]["role"] == "assistant"


def test_chat_pagination(test_db_session):
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id=user_id)
    headers = {"Authorization": f"Bearer {token}"}

    # Create 5 messages
    for i in range(5):
        client.post(
            "/chat/message",
            json={"role": "user", "text": f"Message {i}"},
            headers=headers,
        )

    # Fetch with limit=2, offset=0 (should return 2 most recent, in chronological order: Message 3, Message 4)
    res_page1 = client.get("/chat/history?limit=2&offset=0", headers=headers)
    assert res_page1.status_code == 200
    page1 = res_page1.json()
    assert page1["total"] == 5
    assert len(page1["messages"]) == 2
    assert page1["messages"][0]["text"] == "Message 3"
    assert page1["messages"][1]["text"] == "Message 4"

    # Fetch next page with limit=2, offset=2 (Message 1, Message 2)
    res_page2 = client.get("/chat/history?limit=2&offset=2", headers=headers)
    assert res_page2.status_code == 200
    page2 = res_page2.json()
    assert len(page2["messages"]) == 2
    assert page2["messages"][0]["text"] == "Message 1"
    assert page2["messages"][1]["text"] == "Message 2"


def test_clear_chat_history(test_db_session):
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id=user_id)
    headers = {"Authorization": f"Bearer {token}"}

    client.post(
        "/chat/message",
        json={"role": "user", "text": "Hello"},
        headers=headers,
    )
    client.post(
        "/chat/message",
        json={"role": "assistant", "text": "Hi!"},
        headers=headers,
    )

    del_res = client.delete("/chat/history", headers=headers)
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "cleared"
    assert del_res.json()["deleted_count"] == 2

    # Verify history is empty
    hist_res = client.get("/chat/history", headers=headers)
    assert hist_res.json()["total"] == 0
    assert hist_res.json()["messages"] == []


def test_chat_user_isolation(test_db_session):
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())
    token_a = create_test_es256_jwt(user_id=user_a)
    token_b = create_test_es256_jwt(user_id=user_b)
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User A posts a message
    client.post("/chat/message", json={"role": "user", "text": "Private User A message"}, headers=headers_a)

    # User B should see 0 messages
    res_b = client.get("/chat/history", headers=headers_b)
    assert res_b.json()["total"] == 0
    assert res_b.json()["messages"] == []

    # User B clears history; User A's history must remain untouched
    client.delete("/chat/history", headers=headers_b)

    res_a = client.get("/chat/history", headers=headers_a)
    assert res_a.json()["total"] == 1
    assert res_a.json()["messages"][0]["text"] == "Private User A message"


def test_chat_unauthenticated(test_db_session):
    res_get = client.get("/chat/history")
    assert res_get.status_code in (401, 403)

    res_post = client.post("/chat/message", json={"role": "user", "text": "Hello"})
    assert res_post.status_code in (401, 403)
