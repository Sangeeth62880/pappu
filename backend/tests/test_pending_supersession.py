"""
Tests for Fix 6: Pending supersession.
Any new message that is not an answer_pending plan supersedes the active pending item.
The reply states it: "I cancelled the pending delete of രാഹുൽ ₹300."
Flow test: delete request, then an unrelated add, then yes returns "Nothing is waiting for confirmation."
"""

import uuid
from decimal import Decimal
from datetime import date
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
from app.models.contact import Contact
from app.models.transaction import Transaction
from app.models.pending_action import PendingAction
from app.assistant.pending import format_superseded_message, get_active_pending
from app.assistant.validation import resolve_category
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


def test_format_superseded_message():
    # 1. Malayalam contact delete
    item1 = PendingAction(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        kind="confirm",
        status="pending",
        plan_json={"action": {"op": "delete"}, "question": "Delete രാഹുൽ ₹300 on 14 Oct?"},
        candidates_json=[{"contact_name": "രാഹുൽ", "amount": 300, "type": "expense"}],
    )
    assert format_superseded_message(item1) == "I cancelled the pending delete of രാഹുൽ ₹300."

    # 2. Category delete
    item2 = PendingAction(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        kind="confirm",
        status="pending",
        plan_json={"action": {"op": "delete"}, "question": "Delete Food ₹250 on 14 Oct?"},
        candidates_json=[{"category_name": "Food", "amount": 250, "type": "expense"}],
    )
    assert format_superseded_message(item2) == "I cancelled the pending delete of Food ₹250."


def test_full_supersession_flow(test_db_session: Session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Supersession User", preferred_language="en")
    test_db_session.add(profile)

    contact = Contact(id=uuid.uuid4(), user_id=user_id, name="രാഹുൽ", aliases=["rahul", "രാഹുൽ"])
    test_db_session.add(contact)
    test_db_session.commit()

    cat = resolve_category(test_db_session, "People", default_type="expense")
    txn = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        contact_id=contact.id,
        category_id=cat.id,
        amount=Decimal("300.00"),
        type="expense",
        txn_date=date(2026, 10, 14),
    )
    test_db_session.add(txn)
    test_db_session.commit()

    headers = _auth_header(user_id)

    # Step 1: User asks to delete the transaction to Rahul
    res1 = client.post(
        "/assistant/message",
        json={"text": "Delete Rahul 300", "input": "voice"},
        headers=headers,
    )
    assert res1.status_code == 200
    data1 = res1.json()
    assert "Delete രാഹുൽ ₹300 on 14 Oct?" in data1["reply_text"]
    assert data1["pending"] is not None

    active = get_active_pending(test_db_session, user_id)
    assert active is not None
    assert active.status == "pending"

    # Step 2: Unrelated new command arrives (Spent 250 on lunch)
    res2 = client.post(
        "/assistant/message",
        json={"text": "Spent 250 on lunch", "input": "voice"},
        headers=headers,
    )
    assert res2.status_code == 200
    data2 = res2.json()
    assert "I cancelled the pending delete of രാഹുൽ ₹300." in data2["reply_text"]
    assert "Added ₹250 to Food." in data2["reply_text"]
    assert data2["changed"] is True

    # The previous pending item is superseded in DB
    test_db_session.refresh(active)
    assert active.status == "superseded"
    assert get_active_pending(test_db_session, user_id) is None

    # Step 3: User says "yes" afterwards
    res3 = client.post(
        "/assistant/message",
        json={"text": "yes", "input": "voice"},
        headers=headers,
    )
    assert res3.status_code == 200
    data3 = res3.json()
    assert data3["reply_text"] == "Nothing is waiting for confirmation."
    assert data3["changed"] is False
