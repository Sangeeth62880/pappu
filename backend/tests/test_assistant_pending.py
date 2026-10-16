"""
Unit and Integration Tests for Assistant v2 Pending State and Contact Aliases.

Tests:
1. Expiry (5 minute expiration, expired items return 'That request expired, please say it again.')
2. Supersede message (superseded pending records cancellation and returns 'Nothing is waiting for confirmation.')
3. One active pending item per user (new pending auto-supersedes previous)
4. Yes, no, and pick flows
5. Alias saved after contact_confirm yes, then 'പൂജ' resolves to Pooja
6. Fuzzy hit does not auto merge
7. Cross user pending id returns 404 (never 403)
8. Pending survives process restart (persisted in DB)
9. Future date add asks before saving
"""

import uuid
from datetime import datetime, timezone, timedelta, date
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db, init_db
from app.models.profile import Profile
from app.models.contact import Contact
from app.models.transaction import Transaction
from app.models.category import Category
from app.models.pending_action import PendingAction
from app.assistant.pending import (
    create_pending,
    get_active_pending,
    get_pending_by_id,
    supersede_pending,
    handle_answer_pending,
)
from app.assistant.contacts import (
    resolve_contact,
    create_contact,
    add_alias_to_contact,
)
from app.assistant.schemas import AddAction, DeleteAction
from app.assistant.executors.add import execute_add
from app.assistant.executors.coordinator import execute_ops
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
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(bind=engine)


def test_one_active_pending_per_user(test_db_session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Test User")
    test_db_session.add(profile)
    test_db_session.commit()

    # Create first pending item
    p1, superseded1 = create_pending(
        db=test_db_session,
        user_id=user_id,
        kind="confirm",
        plan_json={"action": {"op": "delete", "amount": 250}},
    )
    assert superseded1 is None
    assert p1.status == "pending"

    # Active item is p1
    active = get_active_pending(test_db_session, user_id)
    assert active is not None
    assert active.id == p1.id

    # Create second pending item: auto-supersedes p1
    p2, superseded2 = create_pending(
        db=test_db_session,
        user_id=user_id,
        kind="confirm",
        plan_json={"action": {"op": "delete", "amount": 500}},
    )
    assert superseded2 is not None
    assert superseded2.id == p1.id
    assert superseded2.status == "superseded"
    assert p2.status == "pending"

    # Active item is now p2
    active_now = get_active_pending(test_db_session, user_id)
    assert active_now is not None
    assert active_now.id == p2.id


def test_pending_expiry(test_db_session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Expiry User")
    test_db_session.add(profile)
    test_db_session.commit()

    # Create pending item with negative expiry (already in past)
    p, _ = create_pending(
        db=test_db_session,
        user_id=user_id,
        kind="confirm",
        plan_json={"action": {"op": "delete", "amount": 250}},
        expires_in_seconds=-10,
    )

    # get_active_pending detects expiry and updates status to 'expired'
    active = get_active_pending(test_db_session, user_id)
    assert active is None

    test_db_session.refresh(p)
    assert p.status == "expired"

    # Calling answer on expired item returns specific expired message
    resp = handle_answer_pending(test_db_session, user_id, p.id, answer="yes")
    assert resp.reply_text == "That request expired, please say it again."
    assert resp.pending is None
    assert resp.changed is False


def test_supersede_message(test_db_session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Supersede User")
    test_db_session.add(profile)
    test_db_session.commit()

    # Create P1
    p1, _ = create_pending(
        db=test_db_session,
        user_id=user_id,
        kind="confirm",
        plan_json={"action": {"op": "delete", "amount": 250}},
    )

    # Create P2 (supersedes P1)
    p2, superseded = create_pending(
        db=test_db_session,
        user_id=user_id,
        kind="confirm",
        plan_json={"action": {"op": "delete", "amount": 400}},
    )
    assert superseded.id == p1.id

    # Trying to answer the superseded P1 returns empty state message
    resp = handle_answer_pending(test_db_session, user_id, p1.id, answer="yes")
    assert resp.reply_text == "Nothing is waiting for confirmation."
    assert resp.changed is False


def test_answer_pending_yes_and_no_flow_for_delete(test_db_session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Delete User")
    test_db_session.add(profile)

    food_cat = test_db_session.query(Category).filter(Category.name == "Food").first()
    txn = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=300.0,
        category_id=food_cat.id,
        txn_date=datetime.now(timezone.utc).date(),
    )
    test_db_session.add(txn)
    test_db_session.commit()

    # 1. Create confirm pending item for delete
    p, _ = create_pending(
        db=test_db_session,
        user_id=user_id,
        kind="confirm",
        plan_json={"action": {"op": "delete", "selector": {"amount": 300}}},
    )

    # 2. Answer "no" cancels it
    resp_no = handle_answer_pending(test_db_session, user_id, p.id, answer="no")
    assert resp_no.reply_text == "Cancelled."
    assert resp_no.changed is False
    test_db_session.refresh(p)
    assert p.status == "cancelled"

    # Transaction is still present in DB
    assert test_db_session.query(Transaction).filter(Transaction.id == txn.id).first() is not None

    # 3. Create another confirm pending item
    p2, _ = create_pending(
        db=test_db_session,
        user_id=user_id,
        kind="confirm",
        plan_json={"action": {"op": "delete", "selector": {"amount": 300}}},
    )

    # 4. Answer "yes" executes delete and says what was deleted
    resp_yes = handle_answer_pending(test_db_session, user_id, p2.id, answer="yes")
    assert resp_yes.reply_text.startswith("Deleted expense ₹300")
    assert resp_yes.changed is True

    test_db_session.refresh(p2)
    assert p2.status == "resolved"

    # Transaction is now deleted from DB
    assert test_db_session.query(Transaction).filter(Transaction.id == txn.id).first() is None


def test_answer_pending_pick_flow_for_disambiguation(test_db_session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Disambig User")
    test_db_session.add(profile)

    food_cat = test_db_session.query(Category).filter(Category.name == "Food").first()
    txn1 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=250.0,
        category_id=food_cat.id,
        txn_date=date(2026, 10, 14),
    )
    txn2 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=150.0,
        category_id=food_cat.id,
        txn_date=date(2026, 10, 14),
    )
    test_db_session.add_all([txn1, txn2])
    test_db_session.commit()

    candidates = [
        {"id": str(txn1.id), "amount": 250.0, "category": "Food", "date": "2026-10-14"},
        {"id": str(txn2.id), "amount": 150.0, "category": "Food", "date": "2026-10-14"},
    ]

    # Create disambiguate pending item for delete
    p, _ = create_pending(
        db=test_db_session,
        user_id=user_id,
        kind="disambiguate",
        plan_json={"action": {"op": "delete", "selector": {"category": "Food"}}},
        candidates=candidates,
    )

    # Pick candidate index 2 (150 Food)
    resp = handle_answer_pending(test_db_session, user_id, p.id, answer="pick", index=2)
    assert resp.pending is not None
    assert resp.pending.kind == "confirm"
    assert "150" in resp.pending.question
    assert resp.changed is False

    # Original disambiguate item is resolved
    test_db_session.refresh(p)
    assert p.status == "resolved"

    # Confirm the selected delete
    new_pending_id = uuid.UUID(resp.pending.id)
    resp_confirm = handle_answer_pending(test_db_session, user_id, new_pending_id, answer="yes")
    assert resp_confirm.reply_text == "Deleted Food ₹150 on 14 Oct."
    assert resp_confirm.changed is True

    # Verify txn2 is deleted and txn1 is preserved
    assert test_db_session.query(Transaction).filter(Transaction.id == txn2.id).first() is None
    assert test_db_session.query(Transaction).filter(Transaction.id == txn1.id).first() is not None


def test_alias_saved_after_contact_confirm_yes(test_db_session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Pooja Fan")
    test_db_session.add(profile)

    pooja = Contact(id=uuid.uuid4(), user_id=user_id, name="Pooja", aliases=[])
    test_db_session.add(pooja)
    test_db_session.commit()

    spoken_form = "പൂജ"

    # 1. Initially, resolve_contact on "പൂജ" does not exact match, it is new/fuzzy
    init_res = resolve_contact(test_db_session, user_id, spoken_form)
    assert init_res.status in ("fuzzy", "new")

    # 2. Simulate contact_confirm pending item asking "Is this Pooja?"
    p, _ = create_pending(
        db=test_db_session,
        user_id=user_id,
        kind="contact_confirm",
        plan_json={
            "target_contact_id": str(pooja.id),
            "spoken_name": spoken_form,
            "action": {
                "op": "add",
                "kind": "person",
                "direction": "sent",
                "amount": 500,
                "contact": "Pooja",
            },
            "question": "Is this Pooja?",
        },
    )

    # 3. Answering "yes" saves alias on Pooja and executes add
    resp = handle_answer_pending(test_db_session, user_id, p.id, answer="yes")
    assert resp.changed is True
    assert "Saved alias for Pooja" in resp.reply_text

    # 4. Verify alias was added to Pooja's contact in DB
    test_db_session.refresh(pooja)
    assert spoken_form in (pooja.aliases or [])

    # 5. Subsequent resolve_contact on "പൂജ" now immediately resolves EXACT to Pooja!
    next_res = resolve_contact(test_db_session, user_id, spoken_form)
    assert next_res.status == "exact"
    assert next_res.contact.id == pooja.id
    assert next_res.contact.name == "Pooja"


def test_fuzzy_hit_does_not_auto_merge(test_db_session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Fuzzy User")
    test_db_session.add(profile)

    pooja = Contact(id=uuid.uuid4(), user_id=user_id, name="Pooja", aliases=[])
    test_db_session.add(pooja)
    test_db_session.commit()

    # "Pooj" is fuzzy similar to "Pooja" (similarity ~0.89 >= 0.65)
    res = resolve_contact(test_db_session, user_id, "Pooj")
    assert res.status == "fuzzy"
    assert res.candidate.id == pooja.id
    assert res.contact is None  # Does NOT auto-merge!

    # Create contact_confirm item
    p, _ = create_pending(
        db=test_db_session,
        user_id=user_id,
        kind="contact_confirm",
        plan_json={
            "target_contact_id": str(pooja.id),
            "spoken_name": "Pooj",
            "action": {
                "op": "add",
                "kind": "person",
                "direction": "sent",
                "amount": 300,
                "contact": "Pooj",
            },
            "question": "Is this Pooja?",
        },
    )

    # Answering "no" rejects merge and creates a separate new contact "Pooj"
    resp = handle_answer_pending(test_db_session, user_id, p.id, answer="no")
    assert resp.changed is True
    assert "Created contact Pooj" in resp.reply_text

    # Check that a separate contact was created
    new_c = test_db_session.query(Contact).filter(Contact.user_id == user_id, Contact.name == "Pooj").first()
    assert new_c is not None
    assert new_c.id != pooja.id


def test_cross_user_pending_id_returns_404(test_db_session):
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())

    profile_a = Profile(id=uuid.UUID(user_a), name="User A")
    profile_b = Profile(id=uuid.UUID(user_b), name="User B")
    test_db_session.add_all([profile_a, profile_b])
    test_db_session.commit()

    # User A creates a pending item
    pa, _ = create_pending(
        db=test_db_session,
        user_id=uuid.UUID(user_a),
        kind="confirm",
        plan_json={"action": {"op": "delete", "amount": 100}},
    )

    # User B attempts to answer User A's pending item
    token_b = create_test_es256_jwt(user_id=user_b)
    headers_b = {"Authorization": f"Bearer {token_b}"}

    res = client.post(
        f"/assistant/pending/{pa.id}/answer",
        json={"answer": "yes"},
        headers=headers_b,
    )
    # Rule 2: Cross user ids return 404, never 403
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_pending_survives_process_restart(test_db_session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Restart User")
    test_db_session.add(profile)
    test_db_session.commit()

    # Session 1: create pending item
    p, _ = create_pending(
        db=test_db_session,
        user_id=user_id,
        kind="confirm",
        plan_json={"action": {"op": "add", "amount": 1000}, "question": "Record 1000?"},
        candidates=[{"amount": 1000}],
    )
    pending_id = p.id
    test_db_session.commit()

    # Simulate restart by clearing session cache and querying afresh
    test_db_session.expire_all()

    queried = (
        test_db_session.query(PendingAction)
        .filter(PendingAction.id == pending_id, PendingAction.user_id == user_id)
        .first()
    )
    assert queried is not None
    assert queried.status == "pending"
    assert queried.kind == "confirm"
    assert queried.plan_json["question"] == "Record 1000?"
    assert queried.candidates_json == [{"amount": 1000}]


def test_future_date_add_asks_before_saving(test_db_session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Future Date User")
    test_db_session.add(profile)
    test_db_session.commit()

    future_date_str = "2028-12-25"
    op = AddAction(
        op="add",
        kind="expense",
        amount=500,
        category="Food",
        date=future_date_str,
        description="Christmas dinner",
    )

    batch_id = uuid.uuid4()

    # 1. Calling execute_add with confirmed=False asks for confirmation and does NOT save
    result = execute_add(test_db_session, user_id, op, batch_id, confirmed=False)
    assert result.ok is False
    assert result.needs_confirmation is True

    # Ensure transaction was not saved to DB
    count = test_db_session.query(Transaction).filter(Transaction.user_id == user_id).count()
    assert count == 0

    # 2. Create confirm pending item
    p, _ = create_pending(
        db=test_db_session,
        user_id=user_id,
        kind="confirm",
        plan_json={"action": op.model_dump(), "question": f"Record 500 for {future_date_str}?"},
    )

    # 3. Answering "yes" executes add with confirmed=True and saves to DB
    resp = handle_answer_pending(test_db_session, user_id, p.id, answer="yes")
    assert resp.changed is True
    assert resp.reply_text == "Recorded transaction."

    # Now transaction is saved in DB
    saved_txn = test_db_session.query(Transaction).filter(Transaction.user_id == user_id).first()
    assert saved_txn is not None
    assert float(saved_txn.amount) == 500.0
    assert saved_txn.txn_date.isoformat() == future_date_str


def test_answer_pending_pick_flow_for_edit(test_db_session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Edit Disambig User")
    test_db_session.add(profile)

    food_cat = test_db_session.query(Category).filter(Category.name == "Food").first()
    txn1 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=250.0,
        category_id=food_cat.id,
        txn_date=datetime.now(timezone.utc).date(),
    )
    txn2 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=250.0,
        category_id=food_cat.id,
        txn_date=datetime.now(timezone.utc).date() - timedelta(days=1),
    )
    test_db_session.add_all([txn1, txn2])
    test_db_session.commit()

    candidates = [
        {"id": str(txn1.id), "amount": 250.0, "category": "Food", "date": "2026-10-14"},
        {"id": str(txn2.id), "amount": 250.0, "category": "Food", "date": "2026-10-13"},
    ]

    p, _ = create_pending(
        db=test_db_session,
        user_id=user_id,
        kind="disambiguate",
        plan_json={"action": {"op": "edit", "selector": {"amount": 250}, "patch": {"amount": 400}}},
        candidates=candidates,
    )

    # Pick index 1 (txn1)
    resp = handle_answer_pending(test_db_session, user_id, p.id, answer="pick", index=1)
    assert resp.changed is True
    assert resp.reply_text == "Updated transaction."

    test_db_session.refresh(txn1)
    test_db_session.refresh(txn2)
    assert float(txn1.amount) == 400.0
    assert float(txn2.amount) == 250.0


def test_answer_pending_pick_invalid_index(test_db_session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Invalid Index User")
    test_db_session.add(profile)

    candidates = [
        {"id": str(uuid.uuid4()), "amount": 100.0},
        {"id": str(uuid.uuid4()), "amount": 200.0},
    ]

    p, _ = create_pending(
        db=test_db_session,
        user_id=user_id,
        kind="disambiguate",
        plan_json={"action": {"op": "delete", "selector": {"amount": 100}}},
        candidates=candidates,
    )

    # Pick index 99 (out of range)
    resp = handle_answer_pending(test_db_session, user_id, p.id, answer="pick", index=99)
    assert resp.changed is False
    assert "between 1 and 2" in resp.reply_text
    assert resp.pending is not None
    assert resp.pending.id == str(p.id)


def test_endpoint_answer_pending_success(test_db_session):
    user_id = str(uuid.uuid4())
    profile = Profile(id=uuid.UUID(user_id), name="Endpoint User")
    test_db_session.add(profile)
    test_db_session.commit()

    p, _ = create_pending(
        db=test_db_session,
        user_id=uuid.UUID(user_id),
        kind="confirm",
        plan_json={"action": {"op": "delete", "amount": 120}},
        question="Delete 120 Food?",
    )

    token = create_test_es256_jwt(user_id=user_id)
    headers = {"Authorization": f"Bearer {token}"}

    res = client.post(
        f"/assistant/pending/{p.id}/answer",
        json={"answer": "no"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["reply_text"] == "Cancelled."
    assert data["spoken_text"] == "Cancelled."
    assert data["language"] == "en"
    assert data["changed"] is False
    assert data["pending"] is None
    assert isinstance(data["results"], list)


def test_endpoint_answer_pending_synonyms(test_db_session):
    user_id = str(uuid.uuid4())
    profile = Profile(id=uuid.UUID(user_id), name="Synonym User")
    test_db_session.add(profile)
    test_db_session.commit()

    token = create_test_es256_jwt(user_id=user_id)
    headers = {"Authorization": f"Bearer {token}"}

    # Test answering with 'confirm' synonym for confirm item
    p1, _ = create_pending(
        db=test_db_session,
        user_id=uuid.UUID(user_id),
        kind="confirm",
        plan_json={"action": {"op": "add", "kind": "expense", "amount": 250, "category": "Food"}},
        question="Confirm ₹250 Food?",
    )
    res = client.post(
        f"/assistant/pending/{p1.id}/answer",
        json={"answer": "confirm"},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["changed"] is True

    # Test answering disambiguation with 0-based index
    p2, _ = create_pending(
        db=test_db_session,
        user_id=uuid.UUID(user_id),
        kind="disambiguate",
        plan_json={"action": {"op": "delete"}},
        candidates=[{"id": str(uuid.uuid4()), "amount": 100, "category": "Food", "date": "2026-10-14"}],
        question="Which one?",
    )
    res2 = client.post(
        f"/assistant/pending/{p2.id}/answer",
        json={"answer": "pick", "index": 0},
        headers=headers,
    )
    assert res2.status_code == 200
    assert "Delete Food ₹100 on 14 Oct?" in res2.json()["reply_text"]

