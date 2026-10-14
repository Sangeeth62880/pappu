"""
Tests for Person-to-Person Transaction Tracking ('People' category).
Per PROJECT_SPEC.md §4, §5, §7, §8 and Step 5 of the specification.
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
from app.models import Category, Transaction, Profile, Contact
from app.auth import jwks_client
from tests.test_auth import create_test_es256_jwt, test_public_key, MockSigningKey
from app.assistant.resolver import resolve
from app.assistant.schemas import Selector, Plan, DeleteAction, AddAction, QueryAction

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


def _add_person_txn(client, token, amount, contact_name, description="test", direction="sent"):
    plan = Plan(ops=[AddAction(op="add", kind="person", direction=direction, amount=amount, contact=contact_name, description=description)])
    with patch("app.assistant.planner.AssistantPlanner.plan", return_value=plan):
        res = client.post("/assistant/message", headers={"Authorization": f"Bearer {token}"}, json={"text": f"{direction} {amount} to {contact_name}"})
        if res.status_code == 200:
            data = res.json()
            if data.get("pending") and data["pending"].get("kind") == "contact_confirm":
                pending_id = data["pending"]["id"]
                return client.post(
                    f"/assistant/pending/{pending_id}/answer",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"answer": "yes"},
                )
        return res


def test_contact_creation_and_case_insensitive_reuse(test_db_session):
    """
    Test 1: Creating a transaction with contact_name creates a new Contact if none exists,
    and reuses the existing Contact on repeat mentions (case-insensitive 'John' vs 'john').
    """
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)

    # 1. Add transaction with contact_name "John"
    res1 = _add_person_txn(client, token, 500.0, "John", "lent money to John", direction="sent")
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["changed"] is True
    txn1 = data1["results"][0]["data"]
    assert txn1["contact_name"] == "John"
    contact1_id = txn1["contact_id"]
    assert contact1_id is not None

    # Verify only 1 contact in DB
    contacts = test_db_session.query(Contact).filter(Contact.user_id == uuid.UUID(user_id)).all()
    assert len(contacts) == 1
    assert contacts[0].name == "John"

    # 2. Add second transaction with lowercase "john"
    res2 = _add_person_txn(client, token, 200.0, "john", "more money to john", direction="sent")
    assert res2.status_code == 200
    data2 = res2.json()
    txn2 = data2["results"][0]["data"]
    # Reuses the exact same contact_id
    assert txn2["contact_id"] == contact1_id

    # Contacts table still has exactly 1 contact
    contacts_after = test_db_session.query(Contact).filter(Contact.user_id == uuid.UUID(user_id)).all()
    assert len(contacts_after) == 1


def test_contact_user_isolation(test_db_session):
    """
    Test 2: Two users with contacts of the same name ('John') remain isolated.
    User A's John balance never leaks into User B's query or contacts.
    """
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())
    token_a = create_test_es256_jwt(user_a)
    token_b = create_test_es256_jwt(user_b)

    # User A creates a transaction for "John" (lent ₹1000)
    _add_person_txn(client, token_a, 1000.0, "John", "lent 1000 to John", direction="sent")

    # User B creates a transaction for their own "John" (lent ₹300)
    _add_person_txn(client, token_b, 300.0, "John", "lent 300 to John", direction="sent")

    # User A queries John via /summary/people
    summary_a = client.get("/summary/people", headers={"Authorization": f"Bearer {token_a}"}).json()
    assert len(summary_a["contacts"]) == 1
    assert float(summary_a["contacts"][0]["total_sent"]) == 1000.0
    assert float(summary_a["contacts"][0]["net_balance"]) == 1000.0

    # User B queries John via /summary/people
    summary_b = client.get("/summary/people", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert len(summary_b["contacts"]) == 1
    assert float(summary_b["contacts"][0]["total_sent"]) == 300.0
    assert float(summary_b["contacts"][0]["net_balance"]) == 300.0


def test_net_balance_calculation_seeded_mix(test_db_session):
    """
    Test 3: Net balance calculation is correct for a seeded mix of sent/received transactions.
    Formula: net_balance = sum(sent [expense]) - sum(received [income]).
    If > 0: "X owes you ₹X".
    If < 0: "You owe X ₹X".
    """
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)

    # 1. Sent ₹1500 to Rahul (expense)
    _add_person_txn(client, token, 1500.0, "Rahul", "sent to Rahul", direction="sent")

    # 2. Received ₹500 from Rahul (income)
    _add_person_txn(client, token, 500.0, "Rahul", "Rahul paid back", direction="received")

    # Check /summary/people
    summary_res = client.get("/summary/people", headers={"Authorization": f"Bearer {token}"})
    assert summary_res.status_code == 200
    summary = summary_res.json()
    assert len(summary["contacts"]) == 1
    rahul_summary = summary["contacts"][0]
    assert float(rahul_summary["total_sent"]) == 1500.0
    assert float(rahul_summary["total_received"]) == 500.0
    assert float(rahul_summary["net_balance"]) == 1000.0
    assert rahul_summary["status"] == "owes_you"
    assert "Rahul owes you ₹1000.00" in rahul_summary["display_text"]

    # 3. Add ₹1500 received from Rahul (now total received = 2000 > total sent 1500 -> net = -500)
    _add_person_txn(client, token, 1500.0, "Rahul", "Rahul sent extra advance", direction="received")

    summary_res2 = client.get("/summary/people", headers={"Authorization": f"Bearer {token}"})
    rahul_summary2 = summary_res2.json()["contacts"][0]
    assert float(rahul_summary2["total_sent"]) == 1500.0
    assert float(rahul_summary2["total_received"]) == 2000.0
    assert float(rahul_summary2["net_balance"]) == -500.0
    assert rahul_summary2["status"] == "you_owe"
    assert "You owe Rahul ₹500.00" in rahul_summary2["display_text"]


def test_query_intent_routes_to_people_summary(test_db_session):
    """
    Test 4: Query intent with contact_name routes to the people summary and returns correct figures.
    """
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)

    # Seed transaction for John: ₹750 sent
    _add_person_txn(client, token, 750.0, "John", "paid for dinner with John", direction="sent")

    # User asks "how much does John owe me"
    query_plan = Plan(ops=[QueryAction(op="query", query_kind="balances", selector=Selector(contact="John"))])
    with patch("app.assistant.planner.AssistantPlanner.plan", return_value=query_plan):
        res = client.post(
            "/assistant/message",
            headers={"Authorization": f"Bearer {token}"},
            json={"text": "how much does John owe me"},
        )
    assert res.status_code == 200
    res_data = res.json()
    balances = res_data["results"][0]["data"]["balances"]
    assert len(balances) == 1
    assert balances[0]["contact_name"] == "John"
    assert float(balances[0]["net_balance"]) == 750.0
    assert balances[0]["status"] == "owes_you"



def test_matcher_filters_by_contact_name_for_edit_and_delete(test_db_session):
    """
    Test 5: edit/delete with contact_name correctly narrows matcher results to that contact's transactions only.
    """
    user_uuid = uuid.uuid4()
    user_id = str(user_uuid)
    token = create_test_es256_jwt(user_id)

    # Seed contact John and contact Sarah
    profile = Profile(id=user_uuid, name="User", preferred_language="en")
    test_db_session.add(profile)
    contact_john = Contact(user_id=user_uuid, name="John")
    contact_sarah = Contact(user_id=user_uuid, name="Sarah")
    cat_people = test_db_session.query(Category).filter_by(name="People").first()
    test_db_session.add_all([contact_john, contact_sarah])
    test_db_session.commit()

    # Add 1 txn for John (₹500), 1 txn for Sarah (₹500)
    txn_john = Transaction(
        user_id=user_uuid,
        type="expense",
        amount=Decimal("500.00"),
        category_id=cat_people.id,
        contact_id=contact_john.id,
        description="lunch money",
        txn_date=date(2026, 8, 30),
    )
    txn_sarah = Transaction(
        user_id=user_uuid,
        type="expense",
        amount=Decimal("500.00"),
        category_id=cat_people.id,
        contact_id=contact_sarah.id,
        description="lunch money",
        txn_date=date(2026, 8, 30),
    )
    test_db_session.add_all([txn_john, txn_sarah])
    test_db_session.commit()

    # Match with contact_name="John"
    sel_john = Selector(
        amount=500.0,
        category="People",
        contact="John",
        text="lunch money",
    )
    matched_john = resolve(test_db_session, user_uuid, sel_john)
    assert matched_john.outcome == "one"
    assert matched_john.rows[0].id == txn_john.id

    # Match with contact_name="Sarah"
    sel_sarah = Selector(
        amount=500.0,
        category="People",
        contact="Sarah",
        text="lunch money",
    )
    matched_sarah = resolve(test_db_session, user_uuid, sel_sarah)
    assert matched_sarah.outcome == "one"
    assert matched_sarah.rows[0].id == txn_sarah.id

    # Test via /assistant/message: delete with contact_name="John" should match exactly 1 txn (ASK_CONFIRMATION / confirm)
    delete_plan = Plan(
        ops=[DeleteAction(op="delete", selector=Selector(contact="John", amount=500.0))]
    )
    with patch("app.assistant.planner.AssistantPlanner.plan", return_value=delete_plan):
        res_del = client.post(
            "/assistant/message",
            headers={"Authorization": f"Bearer {token}"},
            json={"text": "delete 500 from John"},
        )
    assert res_del.status_code == 200
    del_data = res_del.json()
    assert del_data["pending"] is not None
    assert del_data["pending"]["kind"] == "confirm"
    assert del_data["pending"]["id"] is not None


def test_summary_people_endpoints_direct(test_db_session):
    """
    Test 6: Direct API tests for GET /summary/people and GET /summary/people/{contact_id}.
    """
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)

    # Empty state
    empty_res = client.get("/summary/people", headers={"Authorization": f"Bearer {token}"})
    assert empty_res.status_code == 200
    assert empty_res.json()["contacts"] == []
    assert float(empty_res.json()["total_owed_to_user"]) == 0.0

    # 404 for random contact_id
    not_found = client.get(f"/summary/people/{uuid.uuid4()}", headers={"Authorization": f"Bearer {token}"})
    assert not_found.status_code == 404

    # Create profile, contact and transaction directly in DB
    prof = Profile(id=uuid.UUID(user_id), name="User", preferred_language="en")
    test_db_session.add(prof)
    contact_bob = Contact(user_id=uuid.UUID(user_id), name="Bob")
    test_db_session.add(contact_bob)
    cat_people = test_db_session.query(Category).filter_by(name="People").first()
    test_db_session.commit()

    txn_bob = Transaction(
        user_id=uuid.UUID(user_id),
        type="expense",
        amount=Decimal("800.00"),
        category_id=cat_people.id,
        contact_id=contact_bob.id,
        description="movie ticket for Bob",
        txn_date=date.today(),
    )
    test_db_session.add(txn_bob)
    test_db_session.commit()
    contact_id = str(contact_bob.id)

    # Test /summary/people/{contact_id}
    detail_res = client.get(f"/summary/people/{contact_id}", headers={"Authorization": f"Bearer {token}"})
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["contact_name"] == "Bob"
    assert float(detail["total_sent"]) == 800.0
    assert float(detail["net_balance"]) == 800.0
    assert len(detail["transactions"]) == 1
    assert detail["transactions"][0]["contact_name"] == "Bob"
