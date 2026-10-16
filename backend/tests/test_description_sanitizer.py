"""
Tests for Fix 5: Description sanitizer.
After planning, drops description if it equals or contains the full input sentence,
or contains amount digits plus currency or spend verb pattern copied from input.
"""

import uuid
from decimal import Decimal
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
from app.models.transaction import Transaction
from app.assistant.schemas import Plan, AddAction, EditAction, Selector
from app.assistant.sanitizer import sanitize_description, sanitize_plan
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


def test_sanitize_description_5th_october_exact_sentence():
    inp = "Spent ₹350 on shopping on 5th October"
    
    # 1. Equals full sentence
    assert sanitize_description("Spent ₹350 on shopping on 5th October", inp, 350) is None
    assert sanitize_description("spent ₹350 on shopping on 5th october", inp, 350) is None
    
    # 2. Contains full sentence
    assert sanitize_description("I Spent ₹350 on shopping on 5th October today", inp, 350) is None

    # 3. Contains digits + currency + spend verb
    assert sanitize_description("Spent ₹350 on shopping", inp, 350) is None
    assert sanitize_description("Spent 350", inp, 350) is None
    assert sanitize_description("₹350", inp, 350) is None
    assert sanitize_description("350 rs", inp, 350) is None

    # 4. Pure spend verb
    assert sanitize_description("spent", inp, 350) is None
    assert sanitize_description("expense", inp, 350) is None

    # 5. Clean item descriptions must be preserved
    assert sanitize_description("shopping", inp, 350) == "shopping"
    assert sanitize_description("t-shirt", inp, 350) == "t-shirt"
    assert sanitize_description("groceries at market", inp, 350) == "groceries at market"


def test_sanitize_plan_add_and_edit():
    inp = "Spent ₹350 on shopping on 5th October"
    plan = Plan(
        actions=[
            AddAction(
                op="add",
                kind="expense",
                amount=350,
                category="Shopping",
                description="Spent ₹350 on shopping on 5th October",
            ),
            EditAction(
                op="edit",
                selector=Selector(),
                patch={"description": "Spent ₹350 on shopping on 5th October", "amount": 350},
            ),
        ]
    )

    sanitized = sanitize_plan(plan, inp)
    assert sanitized.actions[0].description is None
    assert sanitized.actions[1].patch["description"] is None


def test_integration_5th_october_sanitizer_persisted_transaction(test_db_session: Session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Sanitizer User")
    test_db_session.add(profile)
    test_db_session.commit()

    inp = "Spent ₹350 on shopping on 5th October"
    mock_plan = Plan(
        actions=[
            AddAction(
                op="add",
                kind="expense",
                amount=350,
                category="Shopping",
                date="2026-10-05",
                description="Spent ₹350 on shopping on 5th October",
            )
        ]
    )

    with patch("app.routers.assistant.AssistantPlanner.plan", return_value=mock_plan):
        res = client.post(
            "/assistant/message",
            json={"text": inp, "input": "voice"},
            headers=_auth_header(user_id),
        )

    assert res.status_code == 200
    data = res.json()
    assert data["changed"] is True

    # Verify transaction in database has None for description instead of the whole sentence
    txn_id = uuid.UUID(data["results"][0]["transaction_id"])
    txn = test_db_session.query(Transaction).filter(Transaction.id == txn_id).first()
    assert txn is not None
    assert txn.description is None
    assert txn.amount == Decimal("350.00")
