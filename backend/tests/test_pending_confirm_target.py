"""
Confirming a pending delete/edit must act on the exact row the user was shown
(target_id), not on whatever the planner's original selector matches at "yes" time.
"""

import uuid
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db, init_db
from app.models.category import Category
from app.models.profile import Profile
from app.models.transaction import Transaction
from app.assistant.planner import AssistantPlanner
from app.assistant.schemas import Plan, DeleteAction, EditAction, Selector
from app.auth import jwks_client
from tests.test_auth import create_test_es256_jwt, test_public_key, MockSigningKey

client = TestClient(app)


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    init_db(bind_engine=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = Session()

    def override_get_db():
        yield session

    app.dependency_overrides[get_db] = override_get_db
    with patch.object(jwks_client, "get_signing_key_from_jwt", return_value=MockSigningKey(test_public_key)):
        yield session
    app.dependency_overrides.pop(get_db, None)
    session.close()
    Base.metadata.drop_all(bind=engine)


def _setup(db):
    user_id = uuid.uuid4()
    db.add(Profile(id=user_id, name="Target User"))
    db.commit()
    food_id = db.query(Category).filter(Category.name == "Food").first().id
    old = datetime.now(timezone.utc) - timedelta(hours=2)  # not "recent", so edits also need confirm
    shown = Transaction(
        user_id=user_id, amount=Decimal("600"), type="expense", category_id=food_id,
        txn_date=date(2026, 10, 13), description="dinner", created_at=old,
    )
    db.add(shown)
    db.commit()
    headers = {"Authorization": f"Bearer {create_test_es256_jwt(user_id=str(user_id))}"}
    return user_id, food_id, shown.id, headers


def _add_newer_txn(db, user_id, food_id):
    # Simulates an add from another screen (History/Home) while the question is open.
    newer = Transaction(
        user_id=user_id, amount=Decimal("50"), type="expense", category_id=food_id,
        txn_date=date(2026, 10, 14), description="tea", created_at=datetime.now(timezone.utc),
    )
    db.add(newer)
    db.commit()
    return newer.id


def test_confirmed_delete_removes_the_row_that_was_shown(db):
    user_id, food_id, shown_id, headers = _setup(db)

    plan = Plan(actions=[DeleteAction(selector=Selector(recency="latest"))])
    with patch.object(AssistantPlanner, "plan", return_value=plan):
        res = client.post("/assistant/message", json={"text": "delete my last transaction"}, headers=headers)
    pending = res.json()["pending"]
    assert pending["kind"] == "confirm"
    assert "₹600" in pending["question"]

    newer_id = _add_newer_txn(db, user_id, food_id)

    res = client.post(f"/assistant/pending/{pending['id']}/answer", json={"answer": "yes"}, headers=headers)
    assert res.status_code == 200

    db.expire_all()
    remaining = {t.id for t in db.query(Transaction).filter(Transaction.user_id == user_id)}
    assert shown_id not in remaining
    assert newer_id in remaining


def test_confirmed_edit_changes_the_row_that_was_shown(db):
    user_id, food_id, shown_id, headers = _setup(db)

    plan = Plan(actions=[EditAction(selector=Selector(recency="latest"), patch={"amount": 700})])
    with patch.object(AssistantPlanner, "plan", return_value=plan):
        res = client.post("/assistant/message", json={"text": "change my last transaction to 700"}, headers=headers)
    pending = res.json()["pending"]
    assert pending["kind"] == "confirm"
    assert "₹600" in pending["question"]

    newer_id = _add_newer_txn(db, user_id, food_id)

    res = client.post(f"/assistant/pending/{pending['id']}/answer", json={"answer": "yes"}, headers=headers)
    assert res.status_code == 200

    db.expire_all()
    assert db.get(Transaction, shown_id).amount == Decimal("700")
    assert db.get(Transaction, newer_id).amount == Decimal("50")
