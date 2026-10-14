import time
import uuid
from decimal import Decimal
from datetime import date, datetime
from unittest.mock import patch
import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db, init_db
from app.models import Category, Contact, Transaction, Profile
from app.auth import jwks_client
from tests.test_auth import create_test_es256_jwt, test_public_key, test_private_key, MockSigningKey
from app.assistant.composer import derive_mood

client = TestClient(app)


def make_jwt(user_id: str, email: str = None) -> str:
    payload = {
        "aud": "authenticated",
        "role": "authenticated",
        "exp": int(time.time()) + 3600,
        "sub": user_id,
    }
    if email:
        payload["email"] = email
    return jwt.encode(payload, test_private_key, algorithm="ES256", headers={"kid": "test-key-id"})


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


# ─── 1. Net Sign & Salary Row Type ───

def test_net_sign_calculation_and_salary_row(db_session):
    """
    Verifies that backend computes net = income minus expense:
    Income 65,000, Expense 5,109 results in Net +59,891.
    Also verifies that a salary row returns type 'income'.
    """
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)

    salary_cat = db_session.query(Category).filter_by(name="Salary").first()
    food_cat = db_session.query(Category).filter_by(name="Food").first()

    # Add Salary row: 65,000
    res_sal = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "type": "income",
            "amount": 65000.0,
            "category_id": salary_cat.id,
            "txn_date": "2026-10-14",
            "description": "October Monthly Salary",
        },
    )
    assert res_sal.status_code == 201
    sal_data = res_sal.json()
    assert sal_data["type"] == "income"
    assert float(sal_data["amount"]) == 65000.0

    # Add Expense row: 5,109
    res_exp = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "type": "expense",
            "amount": 5109.0,
            "category_id": food_cat.id,
            "txn_date": "2026-10-14",
            "description": "Groceries",
        },
    )
    assert res_exp.status_code == 201
    assert res_exp.json()["type"] == "expense"

    # Query summary
    res_sum = client.get("/summary?period=week&ref_date=2026-10-14", headers={"Authorization": f"Bearer {token}"})
    assert res_sum.status_code == 200
    sum_data = res_sum.json()

    assert float(sum_data["total_income"]) == 65000.0
    assert float(sum_data["total_spent"]) == 5109.0
    assert float(sum_data["net"]) == 59891.0
    assert float(sum_data["balance"]) == 59891.0


# ─── 2. Null Percent Threshold & Delta Abs ───

def test_null_percent_when_previous_below_500_and_delta_abs(db_session):
    """
    delta_abs is always present.
    spent_delta_percentage / delta_pct is null when previous_total < 500 rupees.
    When previous_total >= 500 rupees, delta_pct is computed.
    """
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)
    food_cat = db_session.query(Category).filter_by(name="Food").first()

    # Case A: Previous week has 400 (< 500), Current week has 1200
    # Current week: 2026-10-12 to 2026-10-18 (Ref: 2026-10-14)
    # Previous week: 2026-10-05 to 2026-10-11
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 400.0, "category_id": food_cat.id, "txn_date": "2026-10-08"},
    )
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 1200.0, "category_id": food_cat.id, "txn_date": "2026-10-14"},
    )

    res_a = client.get("/summary?period=week&ref_date=2026-10-14", headers={"Authorization": f"Bearer {token}"})
    assert res_a.status_code == 200
    data_a = res_a.json()

    assert float(data_a["previous_period_spent"]) == 400.0
    assert float(data_a["total_spent"]) == 1200.0
    assert float(data_a["delta_abs"]) == 800.0
    # Must be null because previous_spent (400) is below 500 rupees
    assert data_a["spent_delta_percentage"] is None
    assert data_a["delta_pct"] is None

    # Case B: Add 150 to previous week so previous_spent is 550 (>= 500)
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 150.0, "category_id": food_cat.id, "txn_date": "2026-10-09"},
    )

    res_b = client.get("/summary?period=week&ref_date=2026-10-14", headers={"Authorization": f"Bearer {token}"})
    assert res_b.status_code == 200
    data_b = res_b.json()

    assert float(data_b["previous_period_spent"]) == 550.0
    assert float(data_b["total_spent"]) == 1200.0
    assert float(data_b["delta_abs"]) == 650.0
    # ((1200 - 550) / 550) * 100 = 118.18%
    assert data_b["spent_delta_percentage"] is not None
    assert round(data_b["spent_delta_percentage"], 2) == 118.18
    assert data_b["delta_pct"] == data_b["spent_delta_percentage"]


# ─── 3. Avg Per Day & Max Day & Zero Fill ───

def test_avg_per_day_max_day_and_zero_fill(db_session):
    """
    Verifies avg_per_day, max_day peak day detection, and Mon-Sun 7 daily zero-filled buckets for week.
    """
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)
    food_cat = db_session.query(Category).filter_by(name="Food").first()
    transport_cat = db_session.query(Category).filter_by(name="Transport").first()

    # Week 2026-10-12 (Mon) to 2026-10-18 (Sun)
    # Mon: 200, Thu: 1200, Fri: 300
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 200.0, "category_id": food_cat.id, "txn_date": "2026-10-12"},
    )
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 1200.0, "category_id": transport_cat.id, "txn_date": "2026-10-15"},
    )
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 300.0, "category_id": food_cat.id, "txn_date": "2026-10-16"},
    )

    res = client.get("/summary?period=week&ref_date=2026-10-14", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()

    assert float(data["total_spent"]) == 1700.0
    # 7 days in a week: 1700 / 7 = 242.86
    assert float(data["avg_per_day"]) == 242.86

    # 7 zero-filled buckets from Mon to Sun
    assert len(data["daily_buckets"]) == 7
    bucket_labels = [b["label"] for b in data["daily_buckets"]]
    assert bucket_labels == ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    # Max day must be Thu with 1200
    assert data["max_day"] is not None
    assert data["max_day"]["label"] == "Thu"
    assert data["max_day"]["date"] == "2026-10-15"
    assert float(data["max_day"]["amount"]) == 1200.0


# ─── 4. IST Boundaries on Sunday and Monday & Month Rollover ───

def test_ist_sunday_monday_boundary_and_month_rollover(db_session):
    """
    Verifies that a Sunday in IST belongs to the week starting Monday 6 days prior,
    and the following Monday starts a new week.
    Also verifies month rollover across month boundaries.
    """
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)
    food_cat = db_session.query(Category).filter_by(name="Food").first()

    # Sunday: 2026-11-01 -> Week: 2026-10-26 (Mon) to 2026-11-01 (Sun)
    # Monday: 2026-11-02 -> Week: 2026-11-02 (Mon) to 2026-11-08 (Sun)
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 450.0, "category_id": food_cat.id, "txn_date": "2026-11-01"},
    )
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 800.0, "category_id": food_cat.id, "txn_date": "2026-11-02"},
    )

    # Query with ref_date on Sunday 2026-11-01
    res_sun = client.get("/summary?period=week&ref_date=2026-11-01", headers={"Authorization": f"Bearer {token}"})
    assert res_sun.status_code == 200
    data_sun = res_sun.json()
    assert data_sun["period_start"] == "2026-10-26"
    assert data_sun["period_end"] == "2026-11-01"
    assert float(data_sun["total_spent"]) == 450.0

    # Query with ref_date on Monday 2026-11-02
    res_mon = client.get("/summary?period=week&ref_date=2026-11-02", headers={"Authorization": f"Bearer {token}"})
    assert res_mon.status_code == 200
    data_mon = res_mon.json()
    assert data_mon["period_start"] == "2026-11-02"
    assert data_mon["period_end"] == "2026-11-08"
    assert float(data_mon["total_spent"]) == 800.0

    # Month summary for November 2026 (ref_date 2026-11-02)
    # Previous period is October 2026 (2026-10-01 to 2026-10-31)
    res_month = client.get("/summary?period=month&ref_date=2026-11-02", headers={"Authorization": f"Bearer {token}"})
    assert res_month.status_code == 200
    data_month = res_month.json()
    assert data_month["period_start"] == "2026-11-01"
    assert data_month["period_end"] == "2026-11-30"
    assert len(data_month["daily_buckets"]) == 30  # Nov has 30 days


# ─── 5. Summary Mood Mapping ───

def test_summary_mood_mapping(db_session):
    """
    Summary mood is 'worried' when total_spent > 1.5 * prev_spent AND total_spent > 500 rupees.
    Otherwise 'neutral'.
    """
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)
    food_cat = db_session.query(Category).filter_by(name="Food").first()

    # Previous week: 600
    # Current week: 700 (< 1.5 * 600 = 900) -> neutral
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 600.0, "category_id": food_cat.id, "txn_date": "2026-10-07"},
    )
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 700.0, "category_id": food_cat.id, "txn_date": "2026-10-14"},
    )

    res1 = client.get("/summary?period=week&ref_date=2026-10-14", headers={"Authorization": f"Bearer {token}"})
    assert res1.status_code == 200
    assert res1.json()["mood"] == "neutral"

    # Add 400 more to current week so total_spent = 1100 (> 1.5 * 600 and > 500) -> worried
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 400.0, "category_id": food_cat.id, "txn_date": "2026-10-14"},
    )

    res2 = client.get("/summary?period=week&ref_date=2026-10-14", headers={"Authorization": f"Bearer {token}"})
    assert res2.status_code == 200
    assert res2.json()["mood"] == "worried"


# ─── 6. People Block Correctness ───

def test_people_block_counts_and_balances(db_session):
    """
    Verifies that the summary people block uses the shared balances service:
    owed_to_you, you_owe, counts (owed_to_you, you_owe, settled, total), and top 3 by absolute net balance.
    """
    user_id = uuid.uuid4()
    prof = Profile(id=user_id, name="Test User")
    db_session.add(prof)
    db_session.commit()

    token = create_test_es256_jwt(str(user_id))

    # Contacts: Pooja (+500), Rahul (+2000), Anu (-400), Bob (0, settled)
    pooja = Contact(id=uuid.uuid4(), user_id=user_id, name="Pooja")
    rahul = Contact(id=uuid.uuid4(), user_id=user_id, name="Rahul")
    anu = Contact(id=uuid.uuid4(), user_id=user_id, name="Anu")
    bob = Contact(id=uuid.uuid4(), user_id=user_id, name="Bob")
    db_session.add_all([pooja, rahul, anu, bob])
    db_session.commit()

    people_cat = db_session.query(Category).filter_by(name="People").first()

    # Pooja: you sent 500 (expense) -> net +500 (owes you)
    client.post("/transactions", headers={"Authorization": f"Bearer {token}"},
                json={"type": "expense", "amount": 500.0, "category_id": people_cat.id, "contact_id": str(pooja.id), "txn_date": "2026-10-14"})
    # Rahul: you sent 2000 (expense) -> net +2000 (owes you)
    client.post("/transactions", headers={"Authorization": f"Bearer {token}"},
                json={"type": "expense", "amount": 2000.0, "category_id": people_cat.id, "contact_id": str(rahul.id), "txn_date": "2026-10-14"})
    # Anu: you received 400 (income) -> net -400 (you owe)
    client.post("/transactions", headers={"Authorization": f"Bearer {token}"},
                json={"type": "income", "amount": 400.0, "category_id": people_cat.id, "contact_id": str(anu.id), "txn_date": "2026-10-14"})
    # Bob: sent 100, received 100 -> net 0 (settled)
    client.post("/transactions", headers={"Authorization": f"Bearer {token}"},
                json={"type": "expense", "amount": 100.0, "category_id": people_cat.id, "contact_id": str(bob.id), "txn_date": "2026-10-14"})
    client.post("/transactions", headers={"Authorization": f"Bearer {token}"},
                json={"type": "income", "amount": 100.0, "category_id": people_cat.id, "contact_id": str(bob.id), "txn_date": "2026-10-14"})

    res = client.get("/summary?period=week&ref_date=2026-10-14", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    people = res.json()["people"]

    assert float(people["owed_to_you"]) == 2500.0
    assert float(people["total_owed_to_user"]) == 2500.0
    assert float(people["you_owe"]) == 400.0
    assert float(people["total_user_owes"]) == 400.0

    counts = people["counts"]
    assert counts["owed_to_you"] == 2  # Pooja, Rahul
    assert counts["you_owe"] == 1      # Anu
    assert counts["settled"] == 1      # Bob
    assert counts["total"] == 4

    top_contacts = people["top_contacts"]
    assert len(top_contacts) == 3
    # Top by absolute net: Rahul (2000), Pooja (500), Anu (400)
    assert top_contacts[0]["name"] == "Rahul"
    assert float(top_contacts[0]["net_balance"]) == 2000.0
    assert top_contacts[0]["status"] == "owes_you"

    assert top_contacts[1]["name"] == "Pooja"
    assert float(top_contacts[1]["net_balance"]) == 500.0
    assert top_contacts[1]["status"] == "owes_you"

    assert top_contacts[2]["name"] == "Anu"
    assert float(top_contacts[2]["net_balance"]) == -400.0
    assert top_contacts[2]["status"] == "you_owe"


# ─── 7. Read-Only Profile & User Isolation ───

def test_profile_get_and_user_isolation(db_session):
    """
    Verifies read-only GET /profile endpoint and user isolation.
    Returns name and email, plus language.
    User B cannot access User A's data or profile.
    """
    user_a_id = uuid.uuid4()
    user_b_id = uuid.uuid4()

    prof_a = Profile(id=user_a_id, name="Sangeeth PS", preferred_language="ml")
    db_session.add(prof_a)
    db_session.commit()

    token_a = make_jwt(str(user_a_id), email="sangeeth@example.com")
    token_b = make_jwt(str(user_b_id), email="other@example.com")

    # User A accesses profile
    res_a = client.get("/profile", headers={"Authorization": f"Bearer {token_a}"})
    assert res_a.status_code == 200
    data_a = res_a.json()
    assert data_a["name"] == "Sangeeth PS"
    assert data_a["email"] == "sangeeth@example.com"
    assert data_a["language"] == "ml"
    assert data_a["voice_replies"] is None

    # User B has no profile created -> returns 404
    res_b = client.get("/profile", headers={"Authorization": f"Bearer {token_b}"})
    assert res_b.status_code == 404

    # Summary isolation: transactions created by User A are invisible to User B
    food_cat = db_session.query(Category).filter_by(name="Food").first()
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"type": "expense", "amount": 1000.0, "category_id": food_cat.id, "txn_date": "2026-10-14"},
    )

    sum_b = client.get("/summary?period=week&ref_date=2026-10-14", headers={"Authorization": f"Bearer {token_b}"})
    assert sum_b.status_code == 200
    assert float(sum_b.json()["total_spent"]) == 0.0


# ─── 8. Assistant Composer Mood Mapping ───

def test_composer_derive_mood_mapping():
    """
    Verifies mascot mood derivation from result kinds only:
    - Expense added: happy
    - Income added: excited
    - Pending delete or edit: concerned
    - Unsupported or clarify: confused
    - Everything else: neutral
    """
    # Expense added -> happy
    results_expense = [{"ok": True, "action": "add", "data": {"type": "expense", "amount": 250}}]
    assert derive_mood(results=results_expense) == "happy"

    # Income added -> excited
    results_income = [{"ok": True, "action": "add", "data": {"type": "income", "amount": 50000}}]
    assert derive_mood(results=results_income) == "excited"

    # Pending delete -> concerned
    pending_delete = {"kind": "confirm", "plan_json": {"action": {"op": "delete"}}, "question": "Delete Food ₹250 on 14 Oct?"}
    assert derive_mood(pending=pending_delete) == "concerned"

    # Pending edit -> concerned
    pending_edit = {"kind": "confirm", "plan_json": {"action": {"op": "edit"}}, "question": "Change Food ₹250 to ₹300?"}
    assert derive_mood(pending=pending_edit) == "concerned"

    # Clarify action -> confused
    class MockAction:
        def __init__(self, op, kind=None):
            self.op = op
            self.kind = kind

    class MockPlan:
        def __init__(self, actions):
            self.actions = actions

    plan_clarify = MockPlan([MockAction("clarify")])
    assert derive_mood(plan=plan_clarify) == "confused"

    # Unsupported action -> confused
    plan_unsupported = MockPlan([MockAction("chat", kind="unsupported")])
    assert derive_mood(plan=plan_unsupported) == "confused"

    # Query result -> neutral
    results_query = [{"ok": True, "action": "query", "data": {"rows": []}}]
    assert derive_mood(results=results_query) == "neutral"

    # Undo result -> neutral
    results_undo = [{"ok": True, "action": "undo"}]
    assert derive_mood(results=results_undo) == "neutral"
