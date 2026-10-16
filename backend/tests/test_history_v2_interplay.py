"""
Test History manual delete and Assistant V2 interplay:
- After a manual DELETE /transactions/{id}, last_touched is cleared if it was the touched row.
- The next assistant message "delete it" does NOT resolve to or act on the deleted row.
"""

import uuid
from decimal import Decimal
from datetime import date, datetime, timezone
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
from app.models.transaction import Transaction
from app.models.undo_action import UndoAction
from app.assistant.last_touched import get_last_touched_id
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


def test_manual_delete_in_history_prevents_assistant_acting_on_stale_row(test_db_session):
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)
    food_cat = test_db_session.query(Category).filter_by(name="Food").first()

    # Create profile
    prof = Profile(id=uuid.UUID(user_id), name="Test User")
    test_db_session.add(prof)
    test_db_session.commit()

    # 1. Create a transaction
    txn = Transaction(
        id=uuid.uuid4(),
        user_id=uuid.UUID(user_id),
        type="expense",
        amount=Decimal("350.00"),
        category_id=food_cat.id,
        description="Lunch at cafe",
        txn_date=date(2026, 10, 14),
        created_at=datetime.now(timezone.utc),
    )
    test_db_session.add(txn)
    test_db_session.commit()

    # Simulate it was touched recently
    undo = UndoAction(
        user_id=uuid.UUID(user_id),
        action_type="add",
        transaction_id=txn.id,
        created_at=datetime.now(timezone.utc),
    )
    test_db_session.add(undo)
    test_db_session.commit()

    # Prior to delete, last_touched resolves to txn.id
    assert get_last_touched_id(test_db_session, uuid.UUID(user_id)) == txn.id

    # 2. Manual delete through existing DELETE /transactions/{id}
    del_resp = client.delete(
        f"/transactions/{txn.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert del_resp.status_code == 200

    # 3. Confirm last_touched is cleared and row no longer exists
    assert get_last_touched_id(test_db_session, uuid.UUID(user_id)) is None
    deleted_row = test_db_session.query(Transaction).filter_by(id=txn.id).first()
    assert deleted_row is None

    # 4. Next assistant message "delete it" must not act on or resolve to the deleted row
    msg_resp = client.post(
        "/assistant/message",
        headers={"Authorization": f"Bearer {token}"},
        json={"text": "delete it", "input": "typed"},
    )
    assert msg_resp.status_code == 200
    data = msg_resp.json()

    # Assistant does not delete the row again or act on stale id
    results = data.get("results", [])
    deleted_results = [r for r in results if r.get("kind") == "deleted"]
    assert len(deleted_results) == 0

    # The assistant indicates nothing to delete / clarify
    reply = data.get("reply_text", "") or data.get("spoken_text", "")
    assert len(results) == 0 or "nothing" in reply.lower() or "which" in reply.lower() or "don't" in reply.lower()
