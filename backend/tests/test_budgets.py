"""
Per-category monthly budgets (Phase 9).

1. Planner output: set_budget / query budget parse from raw LLM JSON; bad amounts are rejected.
2. Service + API: GET /budgets and PUT /budgets/{category}, spent uses the spending definition,
   upsert, invalid categories, auth, two-user isolation.
3. Assistant end to end (planner mocked): English, Malayalam, Manglish (mixed) replies for
   set / change / status / over budget / none / missing and invalid category.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.auth import jwks_client
from app.database import Base, get_db, init_db
from app.models.budget import CategoryBudget
from app.models.category import Category
from app.models.contact import Contact
from app.models.profile import Profile
from app.models.transaction import Transaction
from app.assistant.context import AssistantContext
from app.assistant.planner import AssistantPlanner
from app.assistant.schemas import Plan, QueryAction, Selector, SetBudgetAction
from app.services.date_utils import IST
from tests.test_auth import create_test_es256_jwt, test_public_key, MockSigningKey

client = TestClient(app)

FROZEN_IST_NOW = datetime(2026, 11, 8, 12, 0, tzinfo=IST)
THIS_MONTH = date(2026, 11, 5)
LAST_MONTH = date(2026, 10, 30)


@pytest.fixture(autouse=True)
def frozen_ist_clock(monkeypatch):
    for target in (
        "app.services.date_utils.get_current_ist_datetime",
        "app.services.budgets.get_current_ist_datetime",
        "app.assistant.context.get_current_ist_datetime",
        "app.assistant.validation.get_current_ist_datetime",
        "app.assistant.executors.add.get_current_ist_datetime",
    ):
        monkeypatch.setattr(target, lambda: FROZEN_IST_NOW)


@pytest.fixture
def db():
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
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    session = TestingSessionLocal()
    try:
        with patch.object(jwks_client, "get_signing_key_from_jwt", return_value=MockSigningKey(test_public_key)):
            yield session
    finally:
        session.close()
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(bind=engine)


def _auth(user_id: uuid.UUID) -> dict:
    return {"Authorization": f"Bearer {create_test_es256_jwt(user_id=str(user_id))}"}


def _user(db, preferred_language: str = "en") -> uuid.UUID:
    user_id = uuid.uuid4()
    db.add(Profile(id=user_id, name="Budget User", preferred_language=preferred_language))
    db.commit()
    return user_id


def _cat(db, name: str) -> Category:
    return db.query(Category).filter(Category.name == name).first()


def _txn(db, user_id, category, amount, txn_date=THIS_MONTH, type_="expense", contact_id=None):
    db.add(Transaction(
        id=uuid.uuid4(), user_id=user_id, category_id=_cat(db, category).id,
        amount=Decimal(str(amount)), type=type_, txn_date=txn_date, contact_id=contact_id,
    ))
    db.commit()


def _send(user_id, text, plan):
    with patch.object(AssistantPlanner, "plan", return_value=plan):
        return client.post("/assistant/message", json={"text": text}, headers=_auth(user_id))


def _set_plan(category, amount, language="en"):
    return Plan(actions=[SetBudgetAction(category=category, amount=amount)], language=language)


def _status_plan(category=None, language="en"):
    selector = Selector(category=category) if category else Selector()
    return Plan(actions=[QueryAction(query_kind="budget", selector=selector)], language=language)


# ==============================================================================
# 1. Planner output
# ==============================================================================

def _planner_returning(raw: str) -> Plan:
    mock_client = MagicMock()
    mock_client._make_request.return_value = raw
    planner = AssistantPlanner(llm_client=mock_client)
    return planner.plan("text", AssistantContext(today="2026-11-08", weekday="Sunday"))


def test_planner_parses_set_budget_clean_english():
    plan = _planner_returning('{"ops": [{"op": "set_budget", "category": "Food", "amount": 5000}], "language": "en"}')
    action = plan.actions[0]
    assert action.op == "set_budget"
    assert action.category == "Food"
    assert action.amount == 5000
    assert plan.language == "en"


def test_planner_parses_budget_query_code_mixed():
    plan = _planner_returning(
        '{"ops": [{"op": "query", "query_kind": "budget", "selector": {"category": "Food"}}], "language": "mixed"}'
    )
    action = plan.actions[0]
    assert action.op == "query"
    assert action.query_kind == "budget"
    assert action.selector.category == "Food"
    assert plan.language == "mixed"


def test_planner_budget_with_missing_amount_is_a_clarify():
    plan = _planner_returning(
        '{"ops": [{"op": "clarify", "question": "How much?", "missing": ["amount"]}], "language": "en"}'
    )
    assert plan.actions[0].op == "clarify"
    assert plan.actions[0].missing_fields == ["amount"]


@pytest.mark.parametrize("payload", [
    {"op": "set_budget", "category": "Food"},
    {"op": "set_budget", "category": "Food", "amount": 0},
    {"op": "set_budget", "category": "Food", "amount": -50},
])
def test_set_budget_without_a_positive_amount_fails_validation(payload):
    with pytest.raises(ValidationError):
        Plan.model_validate({"ops": [payload]})


# ==============================================================================
# 2. Service and API
# ==============================================================================

def test_put_then_get_budget_counts_only_this_months_spending(db):
    user_id = _user(db)
    contact = Contact(id=uuid.uuid4(), user_id=user_id, name="Rahul")
    db.add(contact)
    db.commit()
    _txn(db, user_id, "Food", 1000)
    _txn(db, user_id, "Food", 200)
    _txn(db, user_id, "Food", 900, txn_date=LAST_MONTH)        # other month
    _txn(db, user_id, "Food", 300, contact_id=contact.id)      # person transfer, not spending
    _txn(db, user_id, "Food", 5000, type_="income")            # income
    _txn(db, user_id, "Transport", 400)                        # other category

    res = client.put("/budgets/Food", json={"amount": 5000}, headers=_auth(user_id))
    assert res.status_code == 200
    body = res.json()
    assert body["category"] == "Food"
    assert body["budget"] == 5000
    assert body["spent"] == 1200
    assert body["remaining"] == 3800
    assert body["percent"] == 24
    assert body["state"] == "ok"
    assert body["previous_budget"] is None

    listing = client.get("/budgets", headers=_auth(user_id)).json()
    assert listing["month"] == "2026-11"
    assert listing["categories"] == ["Food", "Transport", "Shopping", "Bills", "Entertainment", "Other"]
    assert [b["category"] for b in listing["budgets"]] == ["Food"]
    assert listing["budgets"][0]["spent"] == 1200


def test_put_replaces_the_existing_budget(db):
    user_id = _user(db)
    client.put("/budgets/food", json={"amount": 5000}, headers=_auth(user_id))
    res = client.put("/budgets/Food", json={"amount": 6000}, headers=_auth(user_id))
    assert res.status_code == 200
    assert res.json()["budget"] == 6000
    assert res.json()["previous_budget"] == 5000
    assert db.query(CategoryBudget).filter(CategoryBudget.user_id == user_id).count() == 1


@pytest.mark.parametrize("category", ["Salary", "People", "Travel", "food2"])
def test_put_rejects_categories_that_cannot_have_a_budget(db, category):
    user_id = _user(db)
    res = client.put(f"/budgets/{category}", json={"amount": 5000}, headers=_auth(user_id))
    assert res.status_code == 422
    assert db.query(CategoryBudget).count() == 0


@pytest.mark.parametrize("amount", [0, -10, "abc"])
def test_put_rejects_non_positive_amounts(db, amount):
    user_id = _user(db)
    res = client.put("/budgets/Food", json={"amount": amount}, headers=_auth(user_id))
    assert res.status_code == 422


def test_budget_endpoints_require_a_valid_token(db):
    assert client.get("/budgets").status_code == 401
    assert client.put("/budgets/Food", json={"amount": 100}).status_code == 401


def test_budgets_are_isolated_between_users(db):
    user_a = _user(db)
    user_b = _user(db)
    _txn(db, user_a, "Food", 1000)
    _txn(db, user_b, "Food", 70)

    client.put("/budgets/Food", json={"amount": 5000}, headers=_auth(user_a))
    assert client.get("/budgets", headers=_auth(user_b)).json()["budgets"] == []

    b_item = client.put("/budgets/Food", json={"amount": 100}, headers=_auth(user_b)).json()
    assert b_item["spent"] == 70
    assert b_item["previous_budget"] is None

    a_list = client.get("/budgets", headers=_auth(user_a)).json()["budgets"]
    assert a_list[0]["budget"] == 5000
    assert a_list[0]["spent"] == 1000

    # B's assistant can't read A's budget either.
    res = _send(user_b, "how much budget left for transport", _status_plan("Transport"))
    assert res.json()["reply_text"] == "You have no Transport budget yet."


@pytest.mark.parametrize("spent,state,percent", [
    (3999, "ok", 79),
    (4000, "near", 80),
    (5000, "near", 100),
    (5001, "over", 100),
])
def test_budget_state_thresholds(db, spent, state, percent):
    user_id = _user(db)
    _txn(db, user_id, "Shopping", spent)
    item = client.put("/budgets/Shopping", json={"amount": 5000}, headers=_auth(user_id)).json()
    assert item["state"] == state
    assert item["percent"] == percent


# ==============================================================================
# 3. Assistant end to end
# ==============================================================================

def test_assistant_sets_a_budget_in_english(db):
    user_id = _user(db)
    res = _send(user_id, "set food budget 5000", _set_plan("Food", 5000))
    assert res.status_code == 200
    data = res.json()
    assert data["reply_text"] == "Set your Food budget to ₹5,000 a month."
    assert data["changed"] is True
    row = db.query(CategoryBudget).filter(CategoryBudget.user_id == user_id).one()
    assert row.amount == Decimal("5000.00")


def test_assistant_changes_an_existing_budget(db):
    user_id = _user(db)
    _send(user_id, "set food budget 5000", _set_plan("Food", 5000))
    data = _send(user_id, "make food budget 6000", _set_plan("Food", 6000)).json()
    assert data["reply_text"] == "Changed your Food budget from ₹5,000 to ₹6,000 a month."


def test_assistant_budget_left_for_food_in_english(db):
    user_id = _user(db)
    _txn(db, user_id, "Food", 1200)
    _send(user_id, "set food budget 5000", _set_plan("Food", 5000))
    data = _send(user_id, "how much budget left for food", _status_plan("Food")).json()
    assert data["reply_text"] == "Food: ₹1,200 of ₹5,000 spent this month, ₹3,800 left."
    assert data["changed"] is False


def test_assistant_budget_left_in_malayalam(db):
    user_id = _user(db)
    _txn(db, user_id, "Food", 1200)
    _send(user_id, "set food budget 5000", _set_plan("Food", 5000))
    data = _send(user_id, "ഭക്ഷണത്തിന്റെ ബജറ്റിൽ എത്ര ബാക്കിയുണ്ട്", _status_plan("Food", "ml")).json()
    assert data["reply_text"] == "ഭക്ഷണം: ഈ മാസം ₹5,000 ബജറ്റിൽ ₹1,200 ചെലവായി, ₹3,800 ബാക്കിയുണ്ട്."
    assert data["spoken_text"] == "ഭക്ഷണം: ഈ മാസം 5000 രൂപ ബജറ്റിൽ 1200 രൂപ ചെലവായി, 3800 രൂപ ബാക്കിയുണ്ട്."
    assert data["language_code"] == "ml-IN"


@pytest.mark.parametrize("profile_lang,expected", [
    ("ml", "യാത്ര ബജറ്റ് മാസം ₹3,000 ആയി സെറ്റ് ചെയ്തു."),
    ("en", "Set your Transport budget to ₹3,000 a month."),
])
def test_assistant_manglish_set_budget_follows_profile_language(db, profile_lang, expected):
    user_id = _user(db, profile_lang)
    data = _send(user_id, "transport budget 3000 aakku", _set_plan("Transport", 3000, "mixed")).json()
    assert data["reply_text"] == expected


def test_assistant_over_budget_status(db):
    user_id = _user(db)
    _txn(db, user_id, "Bills", 2500)
    _send(user_id, "set bills budget 2000", _set_plan("Bills", 2000))
    data = _send(user_id, "bills budget left", _status_plan("Bills")).json()
    assert data["reply_text"] == "Bills: ₹2,500 of ₹2,000 spent this month, ₹500 over budget."


def test_assistant_lists_every_budget(db):
    user_id = _user(db)
    _txn(db, user_id, "Transport", 100)
    _send(user_id, "set transport budget 1000", _set_plan("Transport", 1000))
    _send(user_id, "set food budget 5000", _set_plan("Food", 5000))
    data = _send(user_id, "show my budgets", _status_plan()).json()
    assert data["reply_text"] == (
        "Food: ₹0 of ₹5,000 spent this month, ₹5,000 left. "
        "Transport: ₹100 of ₹1,000 spent this month, ₹900 left."
    )


def test_assistant_no_budgets_yet(db):
    user_id = _user(db)
    assert _send(user_id, "show my budgets", _status_plan()).json()["reply_text"] == "You have not set any budgets yet."
    assert _send(user_id, "food budget left", _status_plan("Food")).json()["reply_text"] == "You have no Food budget yet."


def test_assistant_set_budget_without_category_asks_for_it(db):
    user_id = _user(db)
    data = _send(user_id, "set budget 5000", _set_plan(None, 5000)).json()
    assert data["reply_text"] == "Which category is the budget for?"
    assert data["changed"] is False
    assert db.query(CategoryBudget).count() == 0


@pytest.mark.parametrize("text,lang,expected", [
    ("set salary budget 5000", "en",
     "Budgets can be set for Food, Transport, Shopping, Bills, Entertainment and Other."),
    ("ശമ്പളത്തിന് 5000 ബജറ്റ് വെക്കൂ", "ml",
     "ഭക്ഷണം, യാത്ര, ഷോപ്പിംഗ്, ബില്ലുകൾ, വിനോദം, മറ്റുള്ളവ എന്നീ വിഭാഗങ്ങൾക്കാണ് ബജറ്റ് സെറ്റ് ചെയ്യാൻ കഴിയുക."),
])
def test_assistant_set_budget_for_salary_is_refused(db, text, lang, expected):
    user_id = _user(db)
    data = _send(user_id, text, _set_plan("Salary", 5000, lang)).json()
    assert data["reply_text"] == expected
    assert db.query(CategoryBudget).count() == 0
