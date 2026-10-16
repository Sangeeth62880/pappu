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

def test_patch_transaction_and_category_name_lookup(test_db_session):
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)
    food_cat = test_db_session.query(Category).filter_by(name="Food").first()

    create_res = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 100.00, "category_id": food_cat.id, "txn_date": "2026-08-15"},
    )
    txn_id = create_res.json()["id"]

    # PATCH using category_name
    patch_res = client.patch(
        f"/transactions/{txn_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"amount": 250.00, "category_name": "Shopping", "description": "New shoes"},
    )
    assert patch_res.status_code == 200
    data = patch_res.json()
    assert float(data["amount"]) == 250.00
    assert data["category_name"] == "Shopping"
    assert data["description"] == "New shoes"

def test_user_isolation_patch_and_delete_returns_404_never_403(test_db_session):
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())
    token_a = create_test_es256_jwt(user_a)
    token_b = create_test_es256_jwt(user_b)
    food_cat = test_db_session.query(Category).filter_by(name="Food").first()

    # User A creates transaction
    create_res = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"type": "expense", "amount": 100.00, "category_id": food_cat.id, "txn_date": "2026-08-15"},
    )
    txn_id = create_res.json()["id"]

    # User B tries to PATCH User A's transaction -> MUST return 404
    patch_res = client.patch(
        f"/transactions/{txn_id}",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"amount": 999.00},
    )
    assert patch_res.status_code == 404
    assert patch_res.status_code != 403

    # User B tries to DELETE User A's transaction -> MUST return 404
    del_res = client.delete(
        f"/transactions/{txn_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert del_res.status_code == 404
    assert del_res.status_code != 403

def test_non_destructive_undo_for_edit_and_delete(test_db_session):
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id)
    food_cat = test_db_session.query(Category).filter_by(name="Food").first()

    # 1. Create transaction (amount 100)
    create_res = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={"type": "expense", "amount": 100.00, "category_id": food_cat.id, "description": "Lunch", "txn_date": "2026-08-15"},
    )
    txn_id = create_res.json()["id"]

    # 2. Edit transaction (amount 300, new description)
    patch_res = client.patch(
        f"/transactions/{txn_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"amount": 300.00, "description": "Buffet lunch"},
    )
    assert patch_res.status_code == 200
    assert float(patch_res.json()["amount"]) == 300.00

    # 3. Call undo -> should restore amount 100 and description "Lunch" without deleting the transaction!
    undo_res = client.post(
        "/transactions/undo",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert undo_res.status_code == 200
    undo_data = undo_res.json()
    assert undo_data["status"] == "undone"
    assert undo_data["transaction"]["action_undone"] == "edit"

    # Verify transaction still exists and has original amount 100
    get_res = client.get("/transactions", headers={"Authorization": f"Bearer {token}"})
    assert len(get_res.json()) == 1
    assert float(get_res.json()[0]["amount"]) == 100.00
    assert get_res.json()[0]["description"] == "Lunch"

    # 4. Now delete the transaction
    del_res = client.delete(f"/transactions/{txn_id}", headers={"Authorization": f"Bearer {token}"})
    assert del_res.status_code == 200

    # Verify empty
    assert len(client.get("/transactions", headers={"Authorization": f"Bearer {token}"}).json()) == 0

    # 5. Call undo -> should restore the deleted transaction
    undo_del_res = client.post(
        "/transactions/undo",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert undo_del_res.status_code == 200
    assert undo_del_res.json()["transaction"]["action_undone"] == "delete"

    # Verify restored transaction exists
    restored_txns = client.get("/transactions", headers={"Authorization": f"Bearer {token}"}).json()
    assert len(restored_txns) == 1
    assert float(restored_txns[0]["amount"]) == 100.00

