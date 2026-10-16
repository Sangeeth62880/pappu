import uuid
from decimal import Decimal
from datetime import date
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db, init_db
from app.models.profile import Profile
from app.models.category import Category
from app.models.contact import Contact
from app.models.transaction import Transaction
from app.assistant.schemas import Plan, QueryAction, Selector
from app.assistant.planner import AssistantPlanner
from app.auth import jwks_client
from tests.test_auth import create_test_es256_jwt, test_public_key, MockSigningKey

client = TestClient(app)


@pytest.fixture
def test_shapes_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    init_db(bind_engine=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSession()

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with patch.object(
        jwks_client,
        "get_signing_key_from_jwt",
        return_value=MockSigningKey(test_public_key),
    ):
        yield db
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    db.close()


def test_category_breakdown_query(test_shapes_db):
    db = test_shapes_db
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Breakdown User")
    contact = Contact(id=uuid.uuid4(), user_id=user_id, name="Pooja")
    db.add_all([profile, contact])
    db.commit()

    food = db.query(Category).filter(Category.name == "Food").first()
    shopping = db.query(Category).filter(Category.name == "Shopping").first()
    transport = db.query(Category).filter(Category.name == "Transport").first()
    bills = db.query(Category).filter(Category.name == "Bills").first()
    people = db.query(Category).filter(Category.name == "People").first()

    t_food = Transaction(user_id=user_id, amount=Decimal("1200.00"), type="expense", category_id=food.id, txn_date=date(2026, 10, 10))
    t_shop = Transaction(user_id=user_id, amount=Decimal("800.00"), type="expense", category_id=shopping.id, txn_date=date(2026, 10, 11))
    t_trans = Transaction(user_id=user_id, amount=Decimal("400.00"), type="expense", category_id=transport.id, txn_date=date(2026, 10, 12))
    t_bills = Transaction(user_id=user_id, amount=Decimal("200.00"), type="expense", category_id=bills.id, txn_date=date(2026, 10, 13))
    # People transfer of 4000: must be excluded from spending category breakdown
    t_pooja = Transaction(user_id=user_id, amount=Decimal("4000.00"), type="expense", category_id=people.id, contact_id=contact.id, txn_date=date(2026, 10, 14))

    db.add_all([t_food, t_shop, t_trans, t_bills, t_pooja])
    db.commit()

    token = create_test_es256_jwt(user_id=str(user_id))
    headers = {"Authorization": f"Bearer {token}"}

    plan = Plan(
        actions=[QueryAction(op="query", query_kind="category_breakdown")],
        language="en",
    )
    with patch.object(AssistantPlanner, "plan", return_value=plan):
        res = client.post("/assistant/message", json={"text": "Where am I spending the most?"}, headers=headers)

    assert res.status_code == 200
    data = res.json()

    # People must NOT be in the breakdown
    categories_found = [c["category"] for c in data["results"][0]["data"]["categories"]]
    assert "People" not in categories_found
    assert categories_found == ["Food", "Shopping", "Transport", "Bills"]

    # Top 3 spoken (Item 5: states the range)
    assert "Top spending from 1 to 31 Oct: Food ₹1,200, Shopping ₹800, Transport ₹400." in data["spoken_text"]
    assert "Bills" not in data["spoken_text"]

    # Full list in reply card (Item 5: states the range)
    assert "Spending by category from 1 to 31 Oct: Food ₹1,200, Shopping ₹800, Transport ₹400, Bills ₹200." in data["reply_text"]


def test_balances_balance_side_and_empty_replies(test_shapes_db):
    db = test_shapes_db
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Empty Balances User")
    db.add(profile)
    db.commit()

    token = create_test_es256_jwt(user_id=str(user_id))
    headers = {"Authorization": f"Bearer {token}"}

    # Empty owed_to_me
    plan_owed = Plan(
        actions=[QueryAction(op="query", query_kind="balances", balance_side="owed_to_me")],
        language="en",
    )
    with patch.object(AssistantPlanner, "plan", return_value=plan_owed):
        res1 = client.post("/assistant/message", json={"text": "Who owes me money"}, headers=headers)
    assert res1.status_code == 200
    assert "Nobody owes you anything right now." in res1.json()["reply_text"]

    # Empty i_owe
    plan_i_owe = Plan(
        actions=[QueryAction(op="query", query_kind="balances", balance_side="i_owe")],
        language="en",
    )
    with patch.object(AssistantPlanner, "plan", return_value=plan_i_owe):
        res2 = client.post("/assistant/message", json={"text": "Do I owe anyone"}, headers=headers)
    assert res2.status_code == 200
    assert "You do not owe anyone anything right now." in res2.json()["reply_text"]
