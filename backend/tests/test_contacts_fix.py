"""
Unit tests for Contact Merge Tool and Spoken Contact Confirmation.
Verifies JWT isolation, transaction reassignment, alias preservation,
and confirmation flow for new spoken names without transliteration.
"""

import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.profile import Profile
from app.models.contact import Contact
from app.models.transaction import Transaction
from app.models.category import Category
from app.assistant.contacts import resolve_contact, merge_contacts, normalize_name
from app.assistant.schemas import Plan, AddAction
from app.assistant.planner import AssistantPlanner
from app.assistant.pending import handle_answer_pending, create_pending
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from app.database import Base, init_db, get_db
from app.auth import jwks_client
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


@pytest.fixture
def test_setup(test_db_session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Contacts Tester", preferred_language="en")
    test_db_session.add(profile)

    cat = test_db_session.query(Category).filter(Category.name == "People").first()
    if not cat:
        cat = Category(id=999, name="People", type="expense")
        test_db_session.add(cat)
    test_db_session.commit()

    return {"user_id": user_id, "category_id": cat.id}


def test_merge_contacts_service(test_db_session, test_setup):
    user_id = test_setup["user_id"]

    primary = Contact(id=uuid.uuid4(), user_id=user_id, name="Pooja", aliases=[])
    secondary = Contact(id=uuid.uuid4(), user_id=user_id, name="പൂജ", aliases=["Pooja M"])
    test_db_session.add_all([primary, secondary])
    test_db_session.commit()

    # Add transactions to secondary
    t1 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        contact_id=secondary.id,
        amount=Decimal("1000.00"),
        type="expense",
        category_id=test_setup["category_id"],
        txn_date=date.today(),
    )
    t2 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        contact_id=secondary.id,
        amount=Decimal("900.00"),
        type="expense",
        category_id=test_setup["category_id"],
        txn_date=date.today(),
    )
    test_db_session.add_all([t1, t2])
    test_db_session.commit()

    # Execute merge
    res = merge_contacts(test_db_session, user_id, primary.id, secondary.id)
    assert res["primary_id"] == str(primary.id)
    assert res["transactions_moved"] == 2
    assert "പൂജ" in res["aliases"]
    assert "Pooja M" in res["aliases"]

    # Verify secondary deleted
    assert test_db_session.query(Contact).filter(Contact.id == secondary.id).first() is None

    # Verify transactions moved to primary
    test_db_session.refresh(t1)
    test_db_session.refresh(t2)
    assert t1.contact_id == primary.id
    assert t2.contact_id == primary.id


def test_merge_contacts_cross_user_forbidden(test_db_session, test_setup):
    user_a = test_setup["user_id"]
    user_b = uuid.uuid4()
    prof_b = Profile(id=user_b, name="User B")
    test_db_session.add(prof_b)

    contact_a = Contact(id=uuid.uuid4(), user_id=user_a, name="Contact A")
    contact_b = Contact(id=uuid.uuid4(), user_id=user_b, name="Contact B")
    test_db_session.add_all([contact_a, contact_b])
    test_db_session.commit()

    with pytest.raises(ValueError, match="Secondary contact not found"):
        merge_contacts(test_db_session, user_a, contact_a.id, contact_b.id)


def test_merge_endpoint_jwt_scoped(test_db_session, test_setup):
    user_id = test_setup["user_id"]

    primary = Contact(id=uuid.uuid4(), user_id=user_id, name="Rahul", aliases=[])
    secondary = Contact(id=uuid.uuid4(), user_id=user_id, name="രാഹുൽ", aliases=[])
    test_db_session.add_all([primary, secondary])
    test_db_session.commit()

    client = TestClient(app)
    from app.auth import get_current_user_id
    app.dependency_overrides[get_current_user_id] = lambda: user_id

    try:
        response = client.post(
            "/people/merge",
            json={
                "primary_contact_id": str(primary.id),
                "secondary_contact_id": str(secondary.id),
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["primary_id"] == str(primary.id)
        assert "രാഹുൽ" in data["aliases"]

        # Check secondary deleted from DB
        assert test_db_session.query(Contact).filter(Contact.id == secondary.id).first() is None
    finally:
        app.dependency_overrides.pop(get_current_user_id, None)


def test_new_spoken_contact_confirmation_flow(test_db_session, test_setup):
    user_id = test_setup["user_id"]
    client = TestClient(app)
    from app.auth import get_current_user_id
    app.dependency_overrides[get_current_user_id] = lambda: user_id

    spoken_name = "റോണിക്ക്"

    # Verify contact does not exist
    init_res = resolve_contact(test_db_session, user_id, spoken_name)
    assert init_res.status == "new"

    # 1. First request with unconfirmed new contact triggers contact_confirm
    # Mock planner returning person add with spoken Malayalam name
    from unittest.mock import patch
    from app.assistant.schemas import PlanV2, AddOp

    mock_plan = Plan(
        actions=[
            AddAction(
                op="add",
                kind="person",
                direction="sent",
                amount=500.0,
                contact=spoken_name,
            )
        ]
    )

    try:
        with patch.object(AssistantPlanner, "plan", return_value=mock_plan):
            response = client.post(
                "/assistant/message",
                json={"text": f"{spoken_name} 500 കൊടുത്തു", "input": "typed"},
            )
            assert response.status_code == 200
            data = response.json()

            # Must ask once "New contact: റോണിക്ക്. Add them?"
            expected_question = f"New contact: {spoken_name}. Add them?"
            assert data["pending"] is not None
            assert data["pending"]["kind"] == "contact_confirm"
            assert data["pending"]["question"] == expected_question
            assert data["reply_text"] == expected_question

            # Verify contact is NOT created in DB yet
            c_check = test_db_session.query(Contact).filter(Contact.user_id == user_id, Contact.name == spoken_name).first()
            assert c_check is None

            pending_id = uuid.UUID(data["pending"]["id"])

        # 2. Answering YES confirms addition with exact spoken name without transliteration
        ans_resp = client.post(
            f"/assistant/pending/{pending_id}/answer",
            json={"answer": "yes"},
        )
        assert ans_resp.status_code == 200
        ans_data = ans_resp.json()
        assert ans_data["changed"] is True
        assert f"Created contact {spoken_name}" in ans_data["reply_text"]

        # Verify contact created with exact Malayalam script
        created = test_db_session.query(Contact).filter(Contact.user_id == user_id, Contact.name == spoken_name).first()
        assert created is not None
        assert created.name == spoken_name

        # Verify transaction recorded
        txn = test_db_session.query(Transaction).filter(Transaction.user_id == user_id, Transaction.contact_id == created.id).first()
        assert txn is not None
        assert txn.amount == Decimal("500.00")
        assert txn.type == "expense"
    finally:
        app.dependency_overrides.pop(get_current_user_id, None)


def test_new_spoken_contact_cancelled_flow(test_db_session, test_setup):
    user_id = test_setup["user_id"]
    client = TestClient(app)
    from app.auth import get_current_user_id
    app.dependency_overrides[get_current_user_id] = lambda: user_id

    spoken_name = "ഷെറിൻ"

    mock_plan = Plan(
        actions=[
            AddAction(
                op="add",
                kind="person",
                direction="sent",
                amount=250.0,
                contact=spoken_name,
            )
        ]
    )

    try:
        with patch.object(AssistantPlanner, "plan", return_value=mock_plan):
            response = client.post(
                "/assistant/message",
                json={"text": f"{spoken_name} 250", "input": "typed"},
            )
            assert response.status_code == 200
            data = response.json()
            pending_id = uuid.UUID(data["pending"]["id"])

        # User cancels / says no
        ans_resp = client.post(
            f"/assistant/pending/{pending_id}/answer",
            json={"answer": "no"},
        )
        assert ans_resp.status_code == 200
        ans_data = ans_resp.json()
        assert ans_data["reply_text"] == "Cancelled."
        assert ans_data["changed"] is False

        # Contact must NOT be created
        created = test_db_session.query(Contact).filter(Contact.user_id == user_id, Contact.name == spoken_name).first()
        assert created is None
    finally:
        app.dependency_overrides.pop(get_current_user_id, None)
