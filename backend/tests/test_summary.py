import uuid
from decimal import Decimal
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db, init_db
from app.models import Category
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

def test_summary_empty_state(test_db_session):
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)

    response = client.get("/summary", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert float(data["balance"]) == 0.00
    assert float(data["total_income"]) == 0.00
    assert float(data["total_expense"]) == 0.00
    assert data["transaction_count"] == 0
    assert data["category_breakdown"] == []

def test_summary_calculation_with_income_and_expenses(test_db_session):
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)

    salary_cat = test_db_session.query(Category).filter_by(name="Salary").first()
    food_cat = test_db_session.query(Category).filter_by(name="Food").first()
    transport_cat = test_db_session.query(Category).filter_by(name="Transport").first()

    # Add 1 Income: 50,000
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "income", "amount": 50000.00, "category_id": salary_cat.id, "txn_date": "2026-08-01"},
    )

    # Add 2 Expenses: Food (2,500), Transport (1,500)
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 2500.00, "category_id": food_cat.id, "txn_date": "2026-08-05"},
    )
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 1500.00, "category_id": transport_cat.id, "txn_date": "2026-08-10"},
    )

    response = client.get("/summary", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert float(data["total_income"]) == 50000.00
    assert float(data["total_expense"]) == 4000.00
    assert float(data["balance"]) == 46000.00
    assert data["transaction_count"] == 3

    breakdown_map = {item["category_name"]: item for item in data["category_breakdown"]}
    assert float(breakdown_map["Salary"]["total_amount"]) == 50000.00
    assert breakdown_map["Salary"]["count"] == 1
    assert float(breakdown_map["Food"]["total_amount"]) == 2500.00
    assert breakdown_map["Food"]["count"] == 1
    assert float(breakdown_map["Transport"]["total_amount"]) == 1500.00
    assert breakdown_map["Transport"]["count"] == 1
