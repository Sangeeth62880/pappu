import uuid
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db, init_db
from app.models import Category, Contact, Transaction
from app.auth import jwks_client
from tests.test_auth import create_test_es256_jwt, test_public_key, MockSigningKey

client = TestClient(app)

@pytest.fixture
def test_db():
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


def test_empty_user_returns_zeros_not_errors(test_db):
    """Empty data user returns zeros and empty buckets, no errors."""
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)

    res = client.get("/summary?period=week", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()

    assert data["period"] == "week"
    assert float(data["total_spent"]) == 0.0
    assert float(data["total_income"]) == 0.0
    assert float(data["net"]) == 0.0
    assert float(data["previous_period_spent"]) == 0.0
    assert data["spent_delta_percentage"] is None
    assert len(data["daily_buckets"]) == 7
    # Zero-filled check
    for bucket in data["daily_buckets"]:
        assert float(bucket["amount"]) == 0.0
    assert data["categories"] == []
    assert data["top_expenses"] == []
    assert data["people"]["top_contacts"] == []
    assert float(data["people"]["total_owed_to_user"]) == 0.0
    assert float(data["people"]["total_user_owes"]) == 0.0


def test_multi_week_dataset_and_previous_period_delta(test_db):
    """Verifies totals against a multi-week dataset and delta calculation."""
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)

    food_cat = test_db.query(Category).filter_by(name="Food").first()
    fuel_cat = test_db.query(Category).filter_by(name="Transport").first()
    salary_cat = test_db.query(Category).filter_by(name="Salary").first()

    # Reference date: Wednesday 2026-10-14
    # Current week: Mon 2026-10-12 to Sun 2026-10-18
    # Previous week: Mon 2026-10-05 to Sun 2026-10-11

    # Current week txns:
    # 2026-10-12 (Mon): Food expense 400
    # 2026-10-13 (Tue): Transport expense 600
    # 2026-10-14 (Wed): Salary income 5000
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 400.0, "category_id": food_cat.id, "txn_date": "2026-10-12"},
    )
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 600.0, "category_id": fuel_cat.id, "txn_date": "2026-10-13"},
    )
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "income", "amount": 5000.0, "category_id": salary_cat.id, "txn_date": "2026-10-14"},
    )

    # Previous week txn:
    # 2026-10-07 (Wed): Food expense 500
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 500.0, "category_id": food_cat.id, "txn_date": "2026-10-07"},
    )

    res = client.get(
        "/summary?period=week&ref_date=2026-10-14",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()

    assert data["period_start"] == "2026-10-12"
    assert data["period_end"] == "2026-10-18"
    assert float(data["total_spent"]) == 1000.0
    assert float(data["total_income"]) == 5000.0
    assert float(data["net"]) == 4000.0
    assert float(data["previous_period_spent"]) == 500.0
    # Delta: ((1000 - 500) / 500) * 100 = +100.0%
    assert float(data["spent_delta_percentage"]) == 100.0

    # Buckets: Monday (400), Tuesday (600), other days 0
    buckets = {b["label"]: float(b["amount"]) for b in data["daily_buckets"]}
    assert buckets["Mon"] == 400.0
    assert buckets["Tue"] == 600.0
    assert buckets["Wed"] == 0.0
    assert buckets["Thu"] == 0.0
    assert buckets["Fri"] == 0.0
    assert buckets["Sat"] == 0.0
    assert buckets["Sun"] == 0.0

    # Categories breakdown (top categories)
    cat_map = {c["category"]: float(c["amount"]) for c in data["categories"]}
    assert cat_map["Transport"] == 600.0
    assert cat_map["Food"] == 400.0

    # Top expenses
    assert len(data["top_expenses"]) == 2
    assert float(data["top_expenses"][0]["amount"]) == 600.0
    assert float(data["top_expenses"][1]["amount"]) == 400.0


def test_ist_boundaries_and_month_rollover(test_db):
    """Verifies Sunday/Monday boundary and month rollover in IST dates."""
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)
    food_cat = test_db.query(Category).filter_by(name="Food").first()

    # Sunday 2026-11-01: Belongs to week Mon 2026-10-26 .. Sun 2026-11-01
    # Monday 2026-11-02: Belongs to week Mon 2026-11-02 .. Sun 2026-11-08
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 350.0, "category_id": food_cat.id, "txn_date": "2026-11-01"},
    )
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 750.0, "category_id": food_cat.id, "txn_date": "2026-11-02"},
    )

    # Query week on Sunday 2026-11-01
    res_sun = client.get(
        "/summary?period=week&ref_date=2026-11-01",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_sun.status_code == 200
    data_sun = res_sun.json()
    assert data_sun["period_start"] == "2026-10-26"
    assert data_sun["period_end"] == "2026-11-01"
    assert float(data_sun["total_spent"]) == 350.0

    # Query week on Monday 2026-11-02 (new week starts)
    res_mon = client.get(
        "/summary?period=week&ref_date=2026-11-02",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_mon.status_code == 200
    data_mon = res_mon.json()
    assert data_mon["period_start"] == "2026-11-02"
    assert data_mon["period_end"] == "2026-11-08"
    assert float(data_mon["total_spent"]) == 750.0
    assert float(data_mon["previous_period_spent"]) == 350.0

    # Month boundary test for November 2026 (30 days)
    res_month = client.get(
        "/summary?period=month&ref_date=2026-11-15",
        headers={"Authorization": f"Bearer {token}"},
    )
    data_month = res_month.json()
    assert data_month["period_start"] == "2026-11-01"
    assert data_month["period_end"] == "2026-11-30"
    assert len(data_month["daily_buckets"]) == 30
    assert float(data_month["total_spent"]) == 1100.0  # 350 + 750 both in Nov


def test_two_user_isolation(test_db):
    """Verifies that User A's transactions and contacts never appear in User B's summary."""
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())
    token_a = create_test_es256_jwt(user_a)
    token_b = create_test_es256_jwt(user_b)
    food_cat = test_db.query(Category).filter_by(name="Food").first()

    # User A adds 1500 expense
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"type": "expense", "amount": 1500.0, "category_id": food_cat.id, "txn_date": "2026-10-14"},
    )

    # User B adds 200 expense
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"type": "expense", "amount": 200.0, "category_id": food_cat.id, "txn_date": "2026-10-14"},
    )

    # Check User A
    res_a = client.get("/summary?period=week&ref_date=2026-10-14", headers={"Authorization": f"Bearer {token_a}"})
    assert float(res_a.json()["total_spent"]) == 1500.0

    # Check User B
    res_b = client.get("/summary?period=week&ref_date=2026-10-14", headers={"Authorization": f"Bearer {token_b}"})
    assert float(res_b.json()["total_spent"]) == 200.0


def test_people_transactions_excluded_from_spent(test_db):
    """People transactions must be excluded from total_spent and shown in people block."""
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)
    food_cat = test_db.query(Category).filter_by(name="Food").first()
    people_cat = test_db.query(Category).filter_by(name="People").first()

    # Normal food expense 500 (this also creates profile)
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 500.0, "category_id": food_cat.id, "txn_date": "2026-10-14"},
    )

    # Create a contact
    contact = Contact(user_id=uuid.UUID(user_id), name="Sanjay")
    test_db.add(contact)
    test_db.commit()
    test_db.refresh(contact)

    # Sent 1000 to Sanjay (expense, category People)
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "type": "expense",
            "amount": 1000.0,
            "category_id": people_cat.id,
            "contact_id": str(contact.id),
            "txn_date": "2026-10-14",
        },
    )

    res = client.get("/summary?period=week&ref_date=2026-10-14", headers={"Authorization": f"Bearer {token}"})
    data = res.json()

    # total_spent should ONLY be 500 (Food), NOT 1500
    assert float(data["total_spent"]) == 500.0

    # People block should show Sanjay owes 1000
    assert float(data["people"]["total_owed_to_user"]) == 1000.0
    assert len(data["people"]["top_contacts"]) == 1
    assert data["people"]["top_contacts"][0]["name"] == "Sanjay"
    assert float(data["people"]["top_contacts"][0]["net_balance"]) == 1000.0
