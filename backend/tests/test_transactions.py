import uuid
from datetime import date
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

def test_create_transaction_happy_path(test_db_session):
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)
    food_cat = test_db_session.query(Category).filter_by(name="Food").first()

    response = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "type": "expense",
            "amount": 450.00,
            "category_id": food_cat.id,
            "description": "Dinner at restaurant",
            "txn_date": "2026-08-30",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert float(data["amount"]) == 450.00
    assert data["type"] == "expense"
    assert data["category_name"] == "Food"
    assert data["user_id"] == user_id
    assert data["description"] == "Dinner at restaurant"

def test_create_transaction_without_auth_rejected(test_db_session):
    response = client.post(
        "/transactions",
        json={
            "type": "expense",
            "amount": 100.00,
            "category_id": 1,
            "txn_date": "2026-08-30",
        },
    )
    assert response.status_code == 401

def test_create_transaction_invalid_category(test_db_session):
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)

    response = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "type": "expense",
            "amount": 100.00,
            "category_id": 99999,
            "txn_date": "2026-08-30",
        },
    )
    assert response.status_code == 400
    assert "does not exist" in response.json()["detail"]

def test_list_transactions_and_filter(test_db_session):
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)
    food_cat = test_db_session.query(Category).filter_by(name="Food").first()
    salary_cat = test_db_session.query(Category).filter_by(name="Salary").first()

    # Create two transactions
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 200.00, "category_id": food_cat.id, "txn_date": "2026-08-15"},
    )
    client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "income", "amount": 5000.00, "category_id": salary_cat.id, "txn_date": "2026-08-20"},
    )

    # List all
    res = client.get("/transactions", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert len(res.json()) == 2

    # Filter by type=income
    res_income = client.get("/transactions?type=income", headers={"Authorization": f"Bearer {token}"})
    assert len(res_income.json()) == 1
    assert res_income.json()[0]["type"] == "income"

    # Filter by category_id
    res_food = client.get(f"/transactions?category_id={food_cat.id}", headers={"Authorization": f"Bearer {token}"})
    assert len(res_food.json()) == 1
    assert res_food.json()[0]["category_name"] == "Food"

def test_update_transaction(test_db_session):
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)
    food_cat = test_db_session.query(Category).filter_by(name="Food").first()
    transport_cat = test_db_session.query(Category).filter_by(name="Transport").first()

    create_res = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 100.00, "category_id": food_cat.id, "txn_date": "2026-08-15"},
    )
    txn_id = create_res.json()["id"]

    # Update amount and category
    update_res = client.put(
        f"/transactions/{txn_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"amount": 150.00, "category_id": transport_cat.id, "description": "Taxi ride"},
    )
    assert update_res.status_code == 200
    assert float(update_res.json()["amount"]) == 150.00
    assert update_res.json()["category_name"] == "Transport"
    assert update_res.json()["description"] == "Taxi ride"

def test_delete_transaction(test_db_session):
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)
    food_cat = test_db_session.query(Category).filter_by(name="Food").first()

    create_res = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 80.00, "category_id": food_cat.id, "txn_date": "2026-08-15"},
    )
    txn_id = create_res.json()["id"]

    # Delete
    del_res = client.delete(f"/transactions/{txn_id}", headers={"Authorization": f"Bearer {token}"})
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # Verify not in list
    list_res = client.get("/transactions", headers={"Authorization": f"Bearer {token}"})
    assert len(list_res.json()) == 0
