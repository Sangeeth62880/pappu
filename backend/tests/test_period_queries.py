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
from app.models.transaction import Transaction
from app.assistant.schemas import Plan, QueryAction, Selector
from app.assistant.planner import AssistantPlanner
from app.services.date_utils import resolve_period_to_dates
from app.auth import jwks_client
from tests.test_auth import create_test_es256_jwt, test_public_key, MockSigningKey

client = TestClient(app)


def test_resolve_period_to_dates_ist():
    ref = date(2026, 10, 14)  # Wednesday

    # last_week must be Monday 2026-10-05 to Sunday 2026-10-11
    d_from, d_to = resolve_period_to_dates("last_week", ref_date=ref)
    assert d_from == date(2026, 10, 5)
    assert d_to == date(2026, 10, 11)

    # this_week must be Monday 2026-10-12 to Sunday 2026-10-18
    d_from, d_to = resolve_period_to_dates("this_week", ref_date=ref)
    assert d_from == date(2026, 10, 12)
    assert d_to == date(2026, 10, 18)

    # today
    d_from, d_to = resolve_period_to_dates("today", ref_date=ref)
    assert d_from == date(2026, 10, 14)
    assert d_to == date(2026, 10, 14)

    # yesterday
    d_from, d_to = resolve_period_to_dates("yesterday", ref_date=ref)
    assert d_from == date(2026, 10, 13)
    assert d_to == date(2026, 10, 13)

    # this_month
    d_from, d_to = resolve_period_to_dates("this_month", ref_date=ref)
    assert d_from == date(2026, 10, 1)
    assert d_to == date(2026, 10, 31)

    # last_month
    d_from, d_to = resolve_period_to_dates("last_month", ref_date=ref)
    assert d_from == date(2026, 9, 1)
    assert d_to == date(2026, 9, 30)

    # last_7_days
    d_from, d_to = resolve_period_to_dates("last_7_days", ref_date=ref)
    assert d_from == date(2026, 10, 8)
    assert d_to == date(2026, 10, 14)

    # last_30_days
    d_from, d_to = resolve_period_to_dates("last_30_days", ref_date=ref)
    assert d_from == date(2026, 9, 15)
    assert d_to == date(2026, 10, 14)

    # this_year
    d_from, d_to = resolve_period_to_dates("this_year", ref_date=ref)
    assert d_from == date(2026, 1, 1)
    assert d_to == date(2026, 12, 31)


@pytest.fixture
def session_with_data():
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


def test_last_week_spend_states_range_and_amount(session_with_data):
    db = session_with_data
    food = db.query(Category).filter(Category.name == "Food").first()
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Test User")
    db.add(profile)
    db.commit()

    # Add transaction in last week (2026-10-08 is Thursday of last week 2026-10-05 to 2026-10-11)
    t = Transaction(
        user_id=user_id,
        amount=Decimal("350.00"),
        type="expense",
        category_id=food.id,
        txn_date=date(2026, 10, 8),
        description="Shopping",
    )
    db.add(t)
    db.commit()

    token = create_test_es256_jwt(user_id=str(user_id))
    headers = {"Authorization": f"Bearer {token}"}

    mock_plan = Plan(
        actions=[
            QueryAction(
                op="query",
                query_kind="sum",
                selector=Selector(period="last_week"),
            )
        ],
        language="en",
    )

    with patch.object(AssistantPlanner, "plan", return_value=mock_plan):
        res = client.post(
            "/assistant/message",
            json={"text": "How much did I spend last week?", "input": "voice"},
            headers=headers,
        )

    assert res.status_code == 200
    data = res.json()
    assert "Spent ₹350 from 5 to 11 Oct." in data["reply_text"]
    assert data["results"][0]["data"]["filters_used"]["resolved_date_from"] == "2026-10-05"
    assert data["results"][0]["data"]["filters_used"]["resolved_date_to"] == "2026-10-11"


def test_last_week_zero_spend_never_hides_range(session_with_data):
    db = session_with_data
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Zero User")
    db.add(profile)
    db.commit()

    token = create_test_es256_jwt(user_id=str(user_id))
    headers = {"Authorization": f"Bearer {token}"}

    mock_plan = Plan(
        actions=[
            QueryAction(
                op="query",
                query_kind="sum",
                selector=Selector(period="last_week"),
            )
        ],
        language="en",
    )

    with patch.object(AssistantPlanner, "plan", return_value=mock_plan):
        res = client.post(
            "/assistant/message",
            json={"text": "How much did I spend last week?", "input": "voice"},
            headers=headers,
        )

    assert res.status_code == 200
    data = res.json()
    # Must NOT just say "Total is ₹0."
    assert data["reply_text"] != "Total is ₹0."
    assert "Spent ₹0 from 5 to 11 Oct." in data["reply_text"]


def test_count_and_list_period_queries(session_with_data):
    db = session_with_data
    food = db.query(Category).filter(Category.name == "Food").first()
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="List User")
    db.add(profile)
    db.commit()

    t = Transaction(
        user_id=user_id,
        amount=Decimal("450.00"),
        type="expense",
        category_id=food.id,
        txn_date=date(2026, 10, 8),
        description="Dinner",
    )
    db.add(t)
    db.commit()

    token = create_test_es256_jwt(user_id=str(user_id))
    headers = {"Authorization": f"Bearer {token}"}

    # Count query
    plan_count = Plan(
        actions=[QueryAction(op="query", query_kind="count", selector=Selector(period="last_week"))],
        language="en",
    )
    with patch.object(AssistantPlanner, "plan", return_value=plan_count):
        res = client.post("/assistant/message", json={"text": "How many times did I spend last week?"}, headers=headers)
    assert res.status_code == 200
    assert "Found 1 transaction from 5 to 11 Oct." in res.json()["reply_text"]

    # List query
    plan_list = Plan(
        actions=[QueryAction(op="query", query_kind="list", selector=Selector(period="last_week"))],
        language="en",
    )
    with patch.object(AssistantPlanner, "plan", return_value=plan_list):
        res = client.post("/assistant/message", json={"text": "Show transactions last week"}, headers=headers)
    assert res.status_code == 200
    assert "Found 1 transactions from 5 to 11 Oct: ₹450 Food on 8 Oct." in res.json()["reply_text"]


def test_compare_period_query(session_with_data):
    db = session_with_data
    food = db.query(Category).filter(Category.name == "Food").first()
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Compare User")
    db.add(profile)
    db.commit()

    # Oct transaction (this month)
    t1 = Transaction(
        user_id=user_id,
        amount=Decimal("800.00"),
        type="expense",
        category_id=food.id,
        txn_date=date(2026, 10, 10),
    )
    # Sep transaction (last month)
    t2 = Transaction(
        user_id=user_id,
        amount=Decimal("500.00"),
        type="expense",
        category_id=food.id,
        txn_date=date(2026, 9, 15),
    )
    db.add_all([t1, t2])
    db.commit()

    token = create_test_es256_jwt(user_id=str(user_id))
    headers = {"Authorization": f"Bearer {token}"}

    plan_cmp = Plan(
        actions=[
            QueryAction(
                op="query",
                query_kind="compare",
                selector=Selector(period="this_month"),
                compare_to=Selector(period="last_month"),
            )
        ],
        language="en",
    )
    with patch.object(AssistantPlanner, "plan", return_value=plan_cmp):
        res = client.post("/assistant/message", json={"text": "Compare this month spending to last month"}, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "This month from 1 to 31 Oct ₹800, last month from 1 to 30 Sep ₹500, up ₹300." in data["reply_text"]
