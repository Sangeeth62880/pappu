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
from app.services.matcher import match_transactions
from app.schemas.intent import IntentFields

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


def test_contact_creation_and_case_insensitive_reuse(test_db_session):
    """
    Test 1: Creating a transaction with contact_name creates a new Contact if none exists,
    and reuses the existing Contact on repeat mentions (case-insensitive 'John' vs 'john').
    """
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)

    # 1. Add transaction with contact_name "John"
    add_payload_1 = {
        "intent": {
            "action": "add",
            "language": "en",
            "fields": {
                "amount": 500.0,
                "category": "People",
                "contact_name": "John",
                "description": "lent money to John",
            },
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": [],
        }
    }
    res1 = client.post(
        "/intent/route",
        headers={"Authorization": f"Bearer {token}"},
        json=add_payload_1,
    )
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["decision"] == "EXECUTE"
    assert data1["execution_result"]["status"] == "created"
    txn1 = data1["execution_result"]["transaction"]
    assert txn1["contact_name"] == "John"
    contact1_id = txn1["contact_id"]
    assert contact1_id is not None

    # Verify only 1 contact in DB
    contacts = test_db_session.query(Contact).filter(Contact.user_id == uuid.UUID(user_id)).all()
    assert len(contacts) == 1
    assert contacts[0].name == "John"

    # 2. Add second transaction with lowercase "john"
    add_payload_2 = {
        "intent": {
            "action": "add",
            "language": "en",
            "fields": {
                "amount": 200.0,
                "category": "People",
                "contact_name": "john",
                "description": "more money to john",
            },
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": [],
        }
    }
    res2 = client.post(
        "/intent/route",
        headers={"Authorization": f"Bearer {token}"},
        json=add_payload_2,
    )
    assert res2.status_code == 200
    data2 = res2.json()
    txn2 = data2["execution_result"]["transaction"]
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
    client.post(
        "/intent/route",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "intent": {
                "action": "add",
                "language": "en",
                "fields": {
                    "amount": 1000.0,
                    "category": "People",
                    "contact_name": "John",
                    "description": "lent 1000 to John",
                },
                "matched_transactions": [],
                "confidence": "high",
                "requires_confirmation": False,
                "missing_fields": [],
            }
        },
    )

    # User B creates a transaction for their own "John" (lent ₹300)
    client.post(
        "/intent/route",
        headers={"Authorization": f"Bearer {token_b}"},
        json={
            "intent": {
                "action": "add",
                "language": "en",
                "fields": {
                    "amount": 300.0,
                    "category": "People",
                    "contact_name": "John",
                    "description": "lent 300 to John",
                },
                "matched_transactions": [],
                "confidence": "high",
                "requires_confirmation": False,
                "missing_fields": [],
            }
        },
    )

    # User A queries John
    query_a = client.post(
        "/intent/route",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "intent": {
                "action": "query",
                "language": "en",
                "fields": {
                    "amount": None,
                    "category": "People",
                    "contact_name": "John",
                    "description": None,
                },
                "matched_transactions": [],
                "confidence": "high",
                "requires_confirmation": False,
                "missing_fields": [],
            }
        },
    )
    data_a = query_a.json()["execution_result"]
    assert data_a["total_sent"] == 1000.0
    assert data_a["net_balance"] == 1000.0
    assert data_a["count"] == 1

    # User B queries John
    query_b = client.post(
        "/intent/route",
        headers={"Authorization": f"Bearer {token_b}"},
        json={
            "intent": {
                "action": "query",
                "language": "en",
                "fields": {
                    "amount": None,
                    "category": "People",
                    "contact_name": "John",
                    "description": None,
                },
                "matched_transactions": [],
                "confidence": "high",
                "requires_confirmation": False,
                "missing_fields": [],
            }
        },
    )
    data_b = query_b.json()["execution_result"]
    assert data_b["total_sent"] == 300.0
    assert data_b["net_balance"] == 300.0
    assert data_b["count"] == 1

    # User A's people summary should not show User B's transactions or contact
    summary_a = client.get("/summary/people", headers={"Authorization": f"Bearer {token_a}"}).json()
    assert len(summary_a["contacts"]) == 1
    assert float(summary_a["contacts"][0]["total_sent"]) == 1000.0


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
    client.post(
        "/intent/route",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "intent": {
                "action": "add",
                "language": "en",
                "fields": {
                    "amount": 1500.0,
                    "category": "People",
                    "contact_name": "Rahul",
                    "description": "sent to Rahul",
                    "type": "expense",
                },
                "matched_transactions": [],
                "confidence": "high",
                "requires_confirmation": False,
                "missing_fields": [],
            }
        },
    )

    # 2. Received ₹500 from Rahul (income)
    client.post(
        "/intent/route",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "intent": {
                "action": "add",
                "language": "en",
                "fields": {
                    "amount": 500.0,
                    "category": "People",
                    "contact_name": "Rahul",
                    "description": "Rahul paid back",
                    "type": "income",
                },
                "matched_transactions": [],
                "confidence": "high",
                "requires_confirmation": False,
                "missing_fields": [],
            }
        },
    )

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
    client.post(
        "/intent/route",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "intent": {
                "action": "add",
                "language": "en",
                "fields": {
                    "amount": 1500.0,
                    "category": "People",
                    "contact_name": "Rahul",
                    "description": "Rahul sent extra advance",
                    "type": "income",
                },
                "matched_transactions": [],
                "confidence": "high",
                "requires_confirmation": False,
                "missing_fields": [],
            }
        },
    )

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
    client.post(
        "/intent/route",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "intent": {
                "action": "add",
                "language": "en",
                "fields": {
                    "amount": 750.0,
                    "category": "People",
                    "contact_name": "John",
                    "description": "paid for dinner with John",
                    "type": "expense",
                },
                "matched_transactions": [],
                "confidence": "high",
                "requires_confirmation": False,
                "missing_fields": [],
            }
        },
    )

    # User asks "how much does John owe me"
    res = client.post(
        "/intent/route",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "intent": {
                "action": "query",
                "language": "en",
                "fields": {
                    "amount": None,
                    "category": "People",
                    "contact_name": "John",
                    "description": None,
                },
                "matched_transactions": [],
                "confidence": "high",
                "requires_confirmation": False,
                "missing_fields": [],
            }
        },
    )
    assert res.status_code == 200
    res_data = res.json()
    assert res_data["decision"] == "EXECUTE"
    result = res_data["execution_result"]
    assert result["status"] == "queried_contact"
    assert result["contact_name"] == "John"
    assert result["total_sent"] == 750.0
    assert result["net_balance"] == 750.0
    assert result["contact_status"] == "owes_you"
    assert "John owes you ₹750.00" in result["display_text"]


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
    fields_john = IntentFields(
        amount=500.0,
        category="People",
        contact_name="John",
        description="lunch money",
    )
    matched_john = match_transactions(test_db_session, user_uuid, fields_john)
    assert len(matched_john) == 1
    assert matched_john[0].id == txn_john.id

    # Match with contact_name="Sarah"
    fields_sarah = IntentFields(
        amount=500.0,
        category="People",
        contact_name="Sarah",
        description="lunch money",
    )
    matched_sarah = match_transactions(test_db_session, user_uuid, fields_sarah)
    assert len(matched_sarah) == 1
    assert matched_sarah[0].id == txn_sarah.id

    # Test via /intent/route: delete with contact_name="John" should match exactly 1 txn (ASK_CONFIRMATION)
    res_del = client.post(
        "/intent/route",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "intent": {
                "action": "delete",
                "language": "en",
                "fields": {
                    "amount": 500.0,
                    "category": "People",
                    "contact_name": "John",
                    "description": "lunch money",
                },
                "matched_transactions": [],
                "confidence": "high",
                "requires_confirmation": True,
                "missing_fields": [],
            }
        },
    )
    assert res_del.status_code == 200
    del_data = res_del.json()
    assert del_data["decision"] == "ASK_CONFIRMATION"
    assert len(del_data["matched_transactions"]) == 1
    assert del_data["matched_transactions"][0] == str(txn_john.id)


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

    # Create transaction via API
    add_res = client.post(
        "/intent/route",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "intent": {
                "action": "add",
                "language": "en",
                "fields": {
                    "amount": 800.0,
                    "category": "People",
                    "contact_name": "Bob",
                    "description": "movie ticket for Bob",
                    "type": "expense",
                },
                "matched_transactions": [],
                "confidence": "high",
                "requires_confirmation": False,
                "missing_fields": [],
            }
        },
    )
    contact_id = add_res.json()["execution_result"]["transaction"]["contact_id"]

    # Test /summary/people/{contact_id}
    detail_res = client.get(f"/summary/people/{contact_id}", headers={"Authorization": f"Bearer {token}"})
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["contact_name"] == "Bob"
    assert float(detail["total_sent"]) == 800.0
    assert float(detail["net_balance"]) == 800.0
    assert len(detail["transactions"]) == 1
    assert detail["transactions"][0]["contact_name"] == "Bob"
