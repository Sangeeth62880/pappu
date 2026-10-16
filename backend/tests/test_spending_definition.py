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
from app.services.spending import is_spending_txn, should_allow_people
from app.auth import jwks_client
from tests.test_auth import create_test_es256_jwt, test_public_key, MockSigningKey

client = TestClient(app)


def test_is_spending_txn_unit():
    class DummyCat:
        def __init__(self, name):
            self.name = name

    class DummyTxn:
        def __init__(self, txn_type, cat_name, contact_id=None):
            self.type = txn_type
            self.category = DummyCat(cat_name) if cat_name else None
            self.contact_id = contact_id

    # Income is never spending
    salary = DummyTxn("income", "Salary")
    assert is_spending_txn(salary) is False
    assert is_spending_txn(salary, allow_people=True) is False

    # Food expense is spending
    food = DummyTxn("expense", "Food")
    assert is_spending_txn(food) is True

    # People transfer is excluded by default
    pooja_transfer = DummyTxn("expense", "People", contact_id=uuid.uuid4())
    assert is_spending_txn(pooja_transfer) is False
    # Allowed when explicitly requested
    assert is_spending_txn(pooja_transfer, allow_people=True) is True


def test_should_allow_people_unit():
    assert should_allow_people(Selector(contact="Pooja")) is True
    assert should_allow_people(Selector(category="People")) is True
    assert should_allow_people(Selector()) is False
    assert should_allow_people(Selector(category="Food")) is False
    assert should_allow_people(Selector(direction="sent")) is False


@pytest.fixture
def test_spending_db():
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


def test_biggest_expense_never_returns_income_or_person_transfer(test_spending_db):
    db = test_spending_db
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Spending User")
    contact = Contact(id=uuid.uuid4(), user_id=user_id, name="Pooja")
    db.add_all([profile, contact])
    db.commit()

    food_cat = db.query(Category).filter(Category.name == "Food").first()
    salary_cat = db.query(Category).filter(Category.name == "Salary").first()
    people_cat = db.query(Category).filter(Category.name == "People").first()

    # 1. Income row: 50,000 Salary
    t_income = Transaction(
        user_id=user_id,
        amount=Decimal("50000.00"),
        type="income",
        category_id=salary_cat.id,
        txn_date=date(2026, 10, 10),
    )
    # 2. Transfer to Pooja: 4,000 People expense
    t_pooja = Transaction(
        user_id=user_id,
        amount=Decimal("4000.00"),
        type="expense",
        category_id=people_cat.id,
        contact_id=contact.id,
        txn_date=date(2026, 10, 11),
    )
    # 3. Regular expense: 1,200 Food
    t_food = Transaction(
        user_id=user_id,
        amount=Decimal("1200.00"),
        type="expense",
        category_id=food_cat.id,
        txn_date=date(2026, 10, 12),
    )
    db.add_all([t_income, t_pooja, t_food])
    db.commit()

    token = create_test_es256_jwt(user_id=str(user_id))
    headers = {"Authorization": f"Bearer {token}"}

    # Query: What is my biggest expense?
    plan_biggest = Plan(
        actions=[QueryAction(op="query", query_kind="biggest", selector=Selector())],
        language="en",
    )
    with patch.object(AssistantPlanner, "plan", return_value=plan_biggest):
        res = client.post("/assistant/message", json={"text": "What is my biggest expense?"}, headers=headers)

    assert res.status_code == 200
    data = res.json()
    # Biggest expense MUST be Food 1,200 (not 50,000 Salary and not 4,000 Pooja)
    assert "Biggest transaction is ₹1,200 Food" in data["reply_text"]
    assert data["results"][0]["data"]["biggest"]["amount"] == 1200.0

    # Query: How much did I spend?
    plan_sum = Plan(
        actions=[QueryAction(op="query", query_kind="sum", selector=Selector())],
        language="en",
    )
    with patch.object(AssistantPlanner, "plan", return_value=plan_sum):
        res_sum = client.post("/assistant/message", json={"text": "How much did I spend?"}, headers=headers)

    assert res_sum.status_code == 200
    # Total spending must be ₹1,200
    assert "Total Food spending is ₹1,200." in res_sum.json()["reply_text"] or "Spent ₹1,200." in res_sum.json()["reply_text"] or "Total is ₹1,200." in res_sum.json()["reply_text"]
    assert res_sum.json()["results"][0]["data"]["sum"] == 1200.0

    # Home Dashboard Summary GET /summary must match the 1,200 number
    res_dash = client.get("/summary", headers=headers)
    assert res_dash.status_code == 200
    dash_data = res_dash.json()
    assert Decimal(str(dash_data["total_spent"])) == Decimal("1200.00")
