"""
Unit and integration tests for Fix 2:
- last_touched 10 minute expiration and row deletion clearing
- Edit confirmation when target is not created or touched in last 10 minutes
- Edit reply format including date and contact
- Delete confirmation reply stating what was deleted
"""

import uuid
from decimal import Decimal
from datetime import date, datetime, timedelta, timezone
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, init_db
from app.models.profile import Profile
from app.models.category import Category
from app.models.contact import Contact
from app.models.transaction import Transaction
from app.models.undo_action import UndoAction
from app.assistant.last_touched import get_last_touched_id, is_recent_or_touched
from app.assistant.composer import _compose_single_edit, _compose_single_delete
from app.assistant.schemas import EditAction, Selector
from app.assistant.pending import create_pending, handle_answer_pending


@pytest.fixture
def db_session():
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
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def test_last_touched_expires_after_10_minutes(db_session):
    user_id = uuid.uuid4()
    prof = Profile(id=user_id, name="Test User")
    cat = db_session.query(Category).filter(Category.name == "Food").first()
    db_session.add(prof)

    now = datetime.now(timezone.utc)
    txn = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=Decimal("250.00"),
        category_id=cat.id,
        txn_date=date(2026, 10, 14),
        created_at=now - timedelta(minutes=15),
    )
    db_session.add(txn)
    db_session.commit()

    # Undo action recorded 11 minutes ago (expired)
    undo_old = UndoAction(
        user_id=user_id,
        action_type="add",
        transaction_id=txn.id,
        created_at=now - timedelta(minutes=11),
    )
    db_session.add(undo_old)
    db_session.commit()

    # Should expire and return None
    assert get_last_touched_id(db_session, user_id) is None

    # Now add an undo action from 2 minutes ago
    undo_fresh = UndoAction(
        user_id=user_id,
        action_type="edit",
        transaction_id=txn.id,
        created_at=now - timedelta(minutes=2),
    )
    db_session.add(undo_fresh)
    db_session.commit()

    # Should return txn.id
    assert get_last_touched_id(db_session, user_id) == txn.id


def test_last_touched_clears_when_row_deleted(db_session):
    user_id = uuid.uuid4()
    prof = Profile(id=user_id, name="Test User")
    cat = db_session.query(Category).filter(Category.name == "Food").first()
    db_session.add(prof)

    now = datetime.now(timezone.utc)
    txn = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=Decimal("150.00"),
        category_id=cat.id,
        txn_date=date(2026, 10, 14),
        created_at=now,
    )
    db_session.add(txn)
    db_session.commit()

    undo_add = UndoAction(
        user_id=user_id,
        action_type="add",
        transaction_id=txn.id,
        created_at=now,
    )
    db_session.add(undo_add)
    db_session.commit()

    assert get_last_touched_id(db_session, user_id) == txn.id

    # Delete the transaction row and record delete undo
    db_session.delete(txn)
    undo_del = UndoAction(
        user_id=user_id,
        action_type="delete",
        transaction_id=txn.id,
        created_at=now,
    )
    db_session.add(undo_del)
    db_session.commit()

    # Must be cleared to None
    assert get_last_touched_id(db_session, user_id) is None


def test_is_recent_or_touched_checks_creation_and_undo(db_session):
    user_id = uuid.uuid4()
    prof = Profile(id=user_id, name="Test User")
    cat = db_session.query(Category).filter(Category.name == "Food").first()
    db_session.add(prof)

    now = datetime.now(timezone.utc)

    # 1. Row created 15 minutes ago, never touched -> False
    old_txn = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=Decimal("200.00"),
        category_id=cat.id,
        txn_date=date(2026, 10, 1),
        created_at=now - timedelta(minutes=15),
    )
    db_session.add(old_txn)
    db_session.commit()
    assert is_recent_or_touched(db_session, old_txn, user_id) is False

    # 2. Row touched 3 minutes ago -> True
    undo_recent = UndoAction(
        user_id=user_id,
        action_type="edit",
        transaction_id=old_txn.id,
        created_at=now - timedelta(minutes=3),
    )
    db_session.add(undo_recent)
    db_session.commit()
    assert is_recent_or_touched(db_session, old_txn, user_id) is True

    # 3. Fresh row created 2 minutes ago -> True
    fresh_txn = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=Decimal("100.00"),
        category_id=cat.id,
        txn_date=date(2026, 10, 14),
        created_at=now - timedelta(minutes=2),
    )
    db_session.add(fresh_txn)
    db_session.commit()
    assert is_recent_or_touched(db_session, fresh_txn, user_id) is True


def test_edit_reply_includes_date_and_contact():
    # Case with Shopping category and date 15 Sep
    res = {
        "ok": True,
        "action": "edit",
        "data": {
            "amount": 300.0,
            "category_name": "Shopping",
            "txn_date": "2026-09-15",
            "previous": {
                "amount": "350.00",
                "txn_date": "2026-09-15",
            },
        },
    }
    reply = _compose_single_edit(res, "en")
    assert reply == "Changed Shopping ₹350 on 15 Sep to ₹300. Say undo to revert."

    # Case with contact Pooja
    res_contact = {
        "ok": True,
        "action": "edit",
        "data": {
            "amount": 500.0,
            "contact_name": "Pooja",
            "txn_date": "2026-10-14",
            "previous": {
                "amount": "400.00",
                "txn_date": "2026-10-14",
            },
        },
    }
    reply_contact = _compose_single_edit(res_contact, "en")
    assert reply_contact == "Changed Pooja ₹400 on 14 Oct to ₹500. Say undo to revert."


def test_delete_confirmation_reply_says_what_was_deleted():
    res_del = {
        "ok": True,
        "action": "delete",
        "data": {
            "amount": 100.0,
            "contact_name": "Pooja",
            "txn_date": "2026-10-14",
            "type": "expense",
        },
    }
    reply = _compose_single_delete(res_del, "en")
    assert reply == "Deleted Pooja ₹100 on 14 Oct."
