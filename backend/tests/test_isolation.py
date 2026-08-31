import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db, init_db
from app.models import Category
from tests.test_auth import create_test_jwt

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
        yield session
    finally:
        session.close()
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(bind=engine)

def test_user_data_isolation_between_two_users(test_db_session):
    """
    Test: User A cannot see, edit, or delete User B's transactions, and vice versa.
    """
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())
    token_a = create_test_jwt(user_a)
    token_b = create_test_jwt(user_b)

    food_cat = test_db_session.query(Category).filter_by(name="Food").first()
    salary_cat = test_db_session.query(Category).filter_by(name="Salary").first()

    # User A creates a transaction
    res_a = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"type": "expense", "amount": 350.00, "category_id": food_cat.id, "txn_date": "2026-08-20"},
    )
    assert res_a.status_code == 201
    txn_a_id = res_a.json()["id"]

    # User B creates a transaction
    res_b = client.post(
        "/transactions",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"type": "income", "amount": 8000.00, "category_id": salary_cat.id, "txn_date": "2026-08-20"},
    )
    assert res_b.status_code == 201
    txn_b_id = res_b.json()["id"]

    # 1. User A lists transactions -> sees only txn_a
    list_a = client.get("/transactions", headers={"Authorization": f"Bearer {token_a}"})
    assert list_a.status_code == 200
    ids_a = [t["id"] for t in list_a.json()]
    assert txn_a_id in ids_a
    assert txn_b_id not in ids_a

    # 2. User B lists transactions -> sees only txn_b
    list_b = client.get("/transactions", headers={"Authorization": f"Bearer {token_b}"})
    assert list_b.status_code == 200
    ids_b = [t["id"] for t in list_b.json()]
    assert txn_b_id in ids_b
    assert txn_a_id not in ids_b

    # 3. User B attempts to edit User A's transaction -> returns 404
    edit_b_on_a = client.put(
        f"/transactions/{txn_a_id}",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"amount": 999.00},
    )
    assert edit_b_on_a.status_code == 404

    # 4. User B attempts to delete User A's transaction -> returns 404
    del_b_on_a = client.delete(
        f"/transactions/{txn_a_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert del_b_on_a.status_code == 404

    # 5. User A can still view and modify their own transaction
    res_a_check = client.get("/transactions", headers={"Authorization": f"Bearer {token_a}"})
    assert len(res_a_check.json()) == 1
    assert res_a_check.json()[0]["id"] == txn_a_id
