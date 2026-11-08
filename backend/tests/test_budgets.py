"""
Per-category monthly budgets (Phase 9).

1. Planner output: set_budget / query budget parse from raw LLM JSON; bad amounts are rejected.
2. Service + API: GET /budgets and PUT /budgets/{category}, spent uses the spending definition,
   upsert, invalid categories, auth, two-user isolation.
3. Assistant end to end (planner mocked): English, Malayalam, Manglish (mixed) replies for
   set / change / status / over budget / none / missing and invalid category.
"""

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
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
from app.assistant.sanitizer import sanitize_plan
from app.assistant.schemas import (
    AddAction, DeleteAction, EditAction, Plan, QueryAction, Selector, SetBudgetAction, UndoActionOp,
)
from app.services import budgets as budget_service
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

def _planner_returning(raw: str, text: str = "text") -> Plan:
    mock_client = MagicMock()
    mock_client._make_request.return_value = raw
    planner = AssistantPlanner(llm_client=mock_client)
    return planner.plan(text, AssistantContext(today="2026-11-08", weekday="Sunday"))


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


@pytest.mark.parametrize("text,raw,category,amount,language", [
    ("food budgetinu 5000 aakku",
     '{"ops": [{"op": "set_budget", "category": "Food", "amount": 5000}], "language": "mixed"}',
     "Food", 5000, "mixed"),
    ("എന്റെ budget എത്ര ബാക്കി",
     '{"ops": [{"op": "query", "query_kind": "budget"}], "language": "ml"}',
     None, None, "ml"),
])
def test_planner_parses_manglish_and_malayalam_budget_plans(text, raw, category, amount, language):
    plan = _planner_returning(raw, text)
    action = plan.actions[0]
    assert plan.language == language
    if amount is None:
        assert action.op == "query" and action.query_kind == "budget"
        assert action.selector.category is None
    else:
        assert action.op == "set_budget"
        assert (action.category, action.amount) == (category, amount)


def test_prompt_has_the_budget_examples():
    prompt = AssistantPlanner(llm_client=MagicMock()).prompt_template
    for phrase in ("set food budget 5000", "food budgetinu 5000 aakku",
                   "how much budget left for food", "എന്റെ budget എത്ര ബാക്കി"):
        assert phrase in prompt


@pytest.mark.parametrize("payload", [
    {"op": "set_budget", "category": "Food", "amount": 0},
    {"op": "set_budget", "category": "Food", "amount": -50},
])
def test_set_budget_without_a_positive_amount_fails_validation(payload):
    with pytest.raises(ValidationError):
        Plan.model_validate({"ops": [payload]})


@pytest.mark.parametrize("payload,missing,question", [
    ({"op": "set_budget", "category": "Food"}, ["amount"], "How much should the monthly Food budget be?"),
    ({"op": "set_budget", "amount": 5000}, ["category"], "Which category is the budget for?"),
    ({"op": "set_budget"}, ["category"], "Which category is the budget for?"),
])
def test_incomplete_set_budget_becomes_a_clarify_action(payload, missing, question):
    plan = sanitize_plan(Plan.model_validate({"ops": [payload], "language": "en"}), "set budget")
    assert len(plan.actions) == 1
    action = plan.actions[0]
    assert action.op == "clarify"
    assert action.missing_fields == missing
    assert action.question == question


# ==============================================================================
# 2a. Model: constraints and per-user rows
# ==============================================================================

def _budget_row(db, user_id, category="Food", amount="5000"):
    db.add(CategoryBudget(
        id=uuid.uuid4(), user_id=user_id, category_id=_cat(db, category).id, amount=Decimal(amount),
    ))
    db.commit()


def test_model_allows_one_budget_per_user_and_category(db):
    user_id = _user(db)
    _budget_row(db, user_id)
    row = db.query(CategoryBudget).one()
    assert row.amount == Decimal("5000.00")
    assert row.category.name == "Food"
    assert row.created_at is not None

    with pytest.raises(IntegrityError):
        _budget_row(db, user_id, amount="6000")
    db.rollback()

    # Another category for the same user, and the same category for another user, are fine.
    _budget_row(db, user_id, "Transport")
    _budget_row(db, _user(db))
    assert db.query(CategoryBudget).count() == 3


@pytest.mark.parametrize("amount", ["0", "-1"])
def test_model_rejects_a_non_positive_amount(db, amount):
    with pytest.raises(IntegrityError):
        _budget_row(db, _user(db), amount=amount)


def test_model_budgets_are_deleted_with_their_profile(db):
    user_id, other = _user(db), _user(db)
    _budget_row(db, user_id)
    _budget_row(db, other)
    db.query(Profile).filter(Profile.id == user_id).delete()
    db.commit()
    assert [r.user_id for r in db.query(CategoryBudget).all()] == [other]


def test_service_reads_and_writes_are_scoped_to_the_user(db):
    user_a, user_b = _user(db), _user(db)
    _txn(db, user_a, "Food", 1000)
    _txn(db, user_b, "Food", 70)
    budget_service.set_budget(db, user_a, "Food", 5000)

    assert budget_service.list_budgets(db, user_b)["budgets"] == []
    assert budget_service.get_budget_status(db, user_b, "Food") is None

    budget_service.set_budget(db, user_b, "Food", 100)
    assert budget_service.get_budget_status(db, user_a, "Food")["budget"] == 5000
    assert budget_service.get_budget_status(db, user_a, "Food")["spent"] == 1000
    assert budget_service.get_budget_status(db, user_b, "Food")["spent"] == 70


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


def _freeze_budget_clock(monkeypatch, utc_instant):
    """Pins the budgets service clock to the IST time of a UTC instant."""
    ist_now = utc_instant.astimezone(IST)
    monkeypatch.setattr("app.services.budgets.get_current_ist_datetime", lambda: ist_now)


def _month_edge_txns(db, user_id):
    _txn(db, user_id, "Food", 900, txn_date=date(2026, 10, 31))
    _txn(db, user_id, "Food", 200, txn_date=date(2026, 11, 1))
    _txn(db, user_id, "Food", 300, txn_date=date(2026, 11, 30))
    _txn(db, user_id, "Food", 700, txn_date=date(2026, 12, 1))


def test_last_ist_day_of_the_month_counts_the_whole_month(db, monkeypatch):
    _freeze_budget_clock(monkeypatch, datetime(2026, 11, 30, 18, 20, tzinfo=timezone.utc))  # 30 Nov 23:50 IST
    user_id = _user(db)
    _month_edge_txns(db, user_id)
    client.put("/budgets/Food", json={"amount": 5000}, headers=_auth(user_id))
    body = client.get("/budgets", headers=_auth(user_id)).json()
    assert body["month"] == "2026-11"
    assert body["budgets"][0]["spent"] == 500


def test_first_ist_day_of_the_next_month_starts_a_new_month(db, monkeypatch):
    # 1 Dec 00:10 IST is still 30 Nov in UTC; the budget month follows IST.
    _freeze_budget_clock(monkeypatch, datetime(2026, 11, 30, 18, 40, tzinfo=timezone.utc))
    user_id = _user(db)
    _month_edge_txns(db, user_id)
    client.put("/budgets/Food", json={"amount": 5000}, headers=_auth(user_id))
    body = client.get("/budgets", headers=_auth(user_id)).json()
    assert body["month"] == "2026-12"
    assert body["budgets"][0]["month"] == "2026-12"
    assert body["budgets"][0]["spent"] == 700


def test_budget_with_zero_spend(db):
    user_id = _user(db)
    client.put("/budgets/Entertainment", json={"amount": 1500}, headers=_auth(user_id))
    item = client.get("/budgets", headers=_auth(user_id)).json()["budgets"][0]
    assert item == {
        "category": "Entertainment", "budget": 1500, "spent": 0, "remaining": 1500, "over_by": 0,
        "percent": 0, "state": "ok", "month": "2026-11", "previous_budget": None,
    }


def test_budget_over_its_amount(db):
    user_id = _user(db)
    _txn(db, user_id, "Shopping", 2600)
    client.put("/budgets/Shopping", json={"amount": 2000}, headers=_auth(user_id))
    item = client.get("/budgets", headers=_auth(user_id)).json()["budgets"][0]
    assert item["spent"] == 2600
    assert item["remaining"] == 0
    assert item["over_by"] == 600
    assert item["percent"] == 130
    assert item["state"] == "over"


def test_delete_removes_only_that_budget(db):
    user_id = _user(db)
    client.put("/budgets/Food", json={"amount": 5000}, headers=_auth(user_id))
    client.put("/budgets/Bills", json={"amount": 2000}, headers=_auth(user_id))
    res = client.delete("/budgets/food", headers=_auth(user_id))
    assert res.status_code == 204
    assert [b["category"] for b in client.get("/budgets", headers=_auth(user_id)).json()["budgets"]] == ["Bills"]
    assert client.delete("/budgets/Food", headers=_auth(user_id)).status_code == 404


def test_delete_cannot_touch_another_users_budget(db):
    owner, other = _user(db), _user(db)
    client.put("/budgets/Food", json={"amount": 5000}, headers=_auth(owner))
    assert client.delete("/budgets/Food", headers=_auth(other)).status_code == 404
    assert client.get("/budgets", headers=_auth(owner)).json()["budgets"][0]["budget"] == 5000


@pytest.mark.parametrize("category", ["Salary", "People", "Travel"])
def test_delete_rejects_categories_that_cannot_have_a_budget(db, category):
    assert client.delete(f"/budgets/{category}", headers=_auth(_user(db))).status_code == 422


def test_budget_endpoints_require_a_valid_token(db):
    assert client.get("/budgets").status_code == 401
    assert client.put("/budgets/Food", json={"amount": 100}).status_code == 401
    assert client.delete("/budgets/Food").status_code == 401


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
    (4999, "near", 99),
    (5000, "over", 100),
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


def _answer(user_id, pending_id, answer):
    return client.post(
        f"/assistant/pending/{pending_id}/answer", json={"answer": answer}, headers=_auth(user_id),
    ).json()


def _food_amount(db, user_id):
    db.expire_all()
    return db.query(CategoryBudget).filter(CategoryBudget.user_id == user_id).one().amount


def test_assistant_changing_an_existing_budget_asks_first(db):
    user_id = _user(db)
    _send(user_id, "set food budget 5000", _set_plan("Food", 5000))
    data = _send(user_id, "make food budget 6000", _set_plan("food", 6000)).json()
    assert data["reply_text"] == "Change your Food budget from ₹5,000 to ₹6,000 a month?"
    assert data["pending"]["kind"] == "confirm"
    assert data["changed"] is False
    assert data["mood"] == "concerned"
    assert _food_amount(db, user_id) == Decimal("5000.00")

    done = _answer(user_id, data["pending"]["id"], "yes")
    assert done["reply_text"] == "Changed your Food budget from ₹5,000 to ₹6,000 a month."
    assert done["changed"] is True
    assert _food_amount(db, user_id) == Decimal("6000.00")


def test_assistant_budget_change_cancelled_keeps_the_old_amount(db):
    user_id = _user(db)
    _send(user_id, "set food budget 5000", _set_plan("Food", 5000))
    data = _send(user_id, "make food budget 6000", _set_plan("Food", 6000)).json()
    done = _answer(user_id, data["pending"]["id"], "no")
    assert done["reply_text"] == "Cancelled."
    assert done["changed"] is False
    assert _food_amount(db, user_id) == Decimal("5000.00")


def test_assistant_budget_change_in_malayalam(db):
    user_id = _user(db, "ml")
    _send(user_id, "ഭക്ഷണത്തിന് 5000 ബജറ്റ്", _set_plan("Food", 5000, "ml"))
    data = _send(user_id, "ഭക്ഷണ ബജറ്റ് 6000 ആക്കൂ", _set_plan("Food", 6000, "ml")).json()
    assert data["reply_text"] == "ഭക്ഷണം ബജറ്റ് ₹5,000 എന്നത് മാസം ₹6,000 ആക്കി മാറ്റട്ടെ?"
    assert data["spoken_text"] == "ഭക്ഷണം ബജറ്റ് 5000 രൂപ എന്നത് മാസം 6000 രൂപ ആക്കി മാറ്റട്ടെ?"
    done = _answer(user_id, data["pending"]["id"], "ശരി")
    assert done["reply_text"] == "ഭക്ഷണം ബജറ്റ് ₹5,000 എന്നത് മാസം ₹6,000 ആക്കി മാറ്റി."
    assert done["language_code"] == "ml-IN"
    assert _food_amount(db, user_id) == Decimal("6000.00")


def test_assistant_setting_the_same_amount_again_needs_no_confirmation(db):
    user_id = _user(db)
    _send(user_id, "set food budget 5000", _set_plan("Food", 5000))
    data = _send(user_id, "set food budget 5000", _set_plan("Food", 5000)).json()
    assert data["reply_text"] == "Set your Food budget to ₹5,000 a month."
    assert data["pending"] is None


def test_assistant_pending_budget_change_is_cancelled_by_a_new_message(db):
    user_id = _user(db)
    _send(user_id, "set food budget 5000", _set_plan("Food", 5000))
    _send(user_id, "make food budget 6000", _set_plan("Food", 6000))
    data = _send(user_id, "show my budgets", _status_plan()).json()
    assert data["reply_text"] == (
        "I cancelled the pending budget change of Food ₹6,000. "
        "Food: ₹0 of ₹5,000 spent this month, ₹5,000 left."
    )


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


def test_assistant_lists_every_budget_in_malayalam(db):
    user_id = _user(db, "ml")
    _txn(db, user_id, "Bills", 2500)
    _send(user_id, "bills budget 2000", _set_plan("Bills", 2000, "ml"))
    _send(user_id, "food budget 5000", _set_plan("Food", 5000, "ml"))
    data = _send(user_id, "എന്റെ budget എത്ര ബാക്കി", _status_plan(language="ml")).json()
    assert data["reply_text"] == (
        "ഭക്ഷണം: ഈ മാസം ₹5,000 ബജറ്റിൽ ₹0 ചെലവായി, ₹5,000 ബാക്കിയുണ്ട്. "
        "ബില്ലുകൾ: ഈ മാസം ₹2,000 ബജറ്റിൽ ₹2,500 ചെലവായി, ₹500 കൂടുതലായി."
    )


def test_assistant_no_budgets_yet(db):
    user_id = _user(db)
    assert _send(user_id, "show my budgets", _status_plan()).json()["reply_text"] == "You have not set any budgets yet."
    assert _send(user_id, "food budget left", _status_plan("Food")).json()["reply_text"] == "You have no Food budget yet."


def test_assistant_no_budgets_yet_in_malayalam(db):
    user_id = _user(db, "ml")
    data = _send(user_id, "എന്റെ budget എത്ര ബാക്കി", _status_plan(language="ml")).json()
    assert data["reply_text"] == "ഇതുവരെ ഒരു ബജറ്റും സെറ്റ് ചെയ്തിട്ടില്ല."
    data = _send(user_id, "ഭക്ഷണ ബജറ്റ് എത്ര ബാക്കി", _status_plan("Food", "ml")).json()
    assert data["reply_text"] == "ഭക്ഷണം വിഭാഗത്തിന് ഇതുവരെ ബജറ്റ് ഇല്ല."


def test_assistant_sets_a_budget_in_malayalam(db):
    user_id = _user(db, "ml")
    data = _send(user_id, "ഭക്ഷണത്തിന് 5000 ബജറ്റ് വെക്കൂ", _set_plan("Food", 5000, "ml")).json()
    assert data["reply_text"] == "ഭക്ഷണം ബജറ്റ് മാസം ₹5,000 ആയി സെറ്റ് ചെയ്തു."
    assert data["spoken_text"] == "ഭക്ഷണം ബജറ്റ് മാസം 5000 രൂപ ആയി സെറ്റ് ചെയ്തു."


@pytest.mark.parametrize("plan,text,expected", [
    (_set_plan(None, 5000), "set budget 5000", "Which category is the budget for?"),
    (Plan(actions=[SetBudgetAction(category="Food")], language="en"), "set food budget",
     "How much should the monthly Food budget be?"),
    (_set_plan(None, 5000, "ml"), "ബജറ്റ് 5000 ആക്കൂ", "ഏത് വിഭാഗത്തിലാണ് എന്ന് പറയാമോ?"),
    (Plan(actions=[SetBudgetAction(category="Food")], language="ml"), "ഭക്ഷണ ബജറ്റ് സെറ്റ് ചെയ്യൂ",
     "എത്ര രൂപയാണ് എന്ന് പറയാമോ?"),
])
def test_assistant_incomplete_set_budget_asks_a_clarify_question(db, plan, text, expected):
    user_id = _user(db)
    data = _send(user_id, text, plan).json()
    assert data["reply_text"] == expected
    assert data["changed"] is False
    assert data["mood"] == "confused"
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


# ==============================================================================
# 4. Budget alert after an add
# ==============================================================================

def _add_plan(amount, category="Food", language="en", kind="expense", date_str=None, **extra):
    return Plan(
        actions=[AddAction(kind=kind, amount=amount, category=category, date=date_str, **extra)],
        language=language,
    )


def _food_budget(db, user_id, spent=3900, budget=5000):
    if spent:
        _txn(db, user_id, "Food", spent)
    client.put("/budgets/Food", json={"amount": budget}, headers=_auth(user_id))


def test_add_crossing_80_percent_appends_a_near_alert(db):
    user_id = _user(db)
    _food_budget(db, user_id)
    data = _send(user_id, "spent 200 on lunch", _add_plan(200)).json()
    assert data["reply_text"] == "Added ₹200 to Food. Heads up: Food is at 82% of its ₹5,000 budget this month."
    assert data["spoken_text"] == data["reply_text"]
    assert data["mood"] == "happy"  # only the 100% crossing makes Pappu concerned
    assert data["results"][0]["data"]["budget_alert"]["alert"] == "near"


def test_add_that_stays_near_does_not_repeat_the_alert(db):
    user_id = _user(db)
    _food_budget(db, user_id, spent=4100)
    data = _send(user_id, "spent 100 on tea", _add_plan(100)).json()
    assert data["reply_text"] == "Added ₹100 to Food."
    assert data["mood"] == "happy"


def test_add_crossing_100_percent_appends_an_over_alert(db):
    user_id = _user(db)
    _food_budget(db, user_id, spent=4200)
    data = _send(user_id, "spent 900 on dinner", _add_plan(900)).json()
    assert data["reply_text"] == (
        "Added ₹900 to Food. Heads up: your Food budget of ₹5,000 is used up this month, ₹5,100 spent."
    )
    assert data["spoken_text"] == data["reply_text"]
    assert data["mood"] == "concerned"


def test_add_jumping_past_both_thresholds_gives_one_over_alert(db):
    user_id = _user(db)
    _food_budget(db, user_id, spent=1000)
    data = _send(user_id, "spent 4500 on a party", _add_plan(4500)).json()
    assert data["reply_text"] == (
        "Added ₹4,500 to Food. Heads up: your Food budget of ₹5,000 is used up this month, ₹5,500 spent."
    )


def test_add_reaching_exactly_100_percent_is_the_100_crossing(db):
    user_id = _user(db)
    _food_budget(db, user_id, spent=4500)
    data = _send(user_id, "spent 500 on food", _add_plan(500)).json()
    assert data["reply_text"] == (
        "Added ₹500 to Food. Heads up: your Food budget of ₹5,000 is used up this month, ₹5,000 spent."
    )
    assert data["mood"] == "concerned"


def test_add_while_already_over_does_not_repeat_the_alert(db):
    user_id = _user(db)
    _food_budget(db, user_id, spent=5200)
    data = _send(user_id, "spent 100 on tea", _add_plan(100)).json()
    assert data["reply_text"] == "Added ₹100 to Food."
    assert data["mood"] == "happy"


@pytest.mark.parametrize("plan", [
    _add_plan(2000, category="Transport"),                       # no budget for Transport
    _add_plan(2000, date_str=LAST_MONTH.isoformat()),            # another month
    _add_plan(2000, kind="income", category="Salary"),          # income
])
def test_adds_that_never_alert(db, plan):
    user_id = _user(db)
    _food_budget(db, user_id)
    data = _send(user_id, "add it", plan).json()
    assert "Heads up" not in data["reply_text"]
    assert "budget_alert" not in (data["results"][0]["data"] or {})


def test_person_add_never_alerts(db):
    user_id = _user(db)
    db.add(Contact(id=uuid.uuid4(), user_id=user_id, name="Rahul"))
    db.commit()
    _food_budget(db, user_id)
    plan = _add_plan(2000, kind="person", category=None, contact="Rahul", direction="sent")
    data = _send(user_id, "sent 2000 to Rahul", plan).json()
    assert "Heads up" not in data["reply_text"]


def test_alert_in_malayalam(db):
    user_id = _user(db, "ml")
    _food_budget(db, user_id)
    data = _send(user_id, "ഊണിന് 200 രൂപ", _add_plan(200, language="ml")).json()
    assert data["reply_text"] == (
        "ഭക്ഷണം വിഭാഗത്തിൽ ₹200 ചേർത്തു. ശ്രദ്ധിക്കൂ: ഈ മാസത്തെ ഭക്ഷണം ബജറ്റ് ₹5,000, അതിന്റെ 82 ശതമാനം ചെലവായി."
    )
    assert data["spoken_text"] == (
        "ഭക്ഷണം വിഭാഗത്തിൽ 200 രൂപ ചേർത്തു. ശ്രദ്ധിക്കൂ: ഈ മാസത്തെ ഭക്ഷണം ബജറ്റ് 5000 രൂപ, അതിന്റെ 82 ശതമാനം ചെലവായി."
    )


def test_over_alert_in_malayalam(db):
    user_id = _user(db, "ml")
    _food_budget(db, user_id, spent=4200)
    data = _send(user_id, "അത്താഴത്തിന് 900 രൂപ", _add_plan(900, language="ml")).json()
    assert data["reply_text"] == (
        "ഭക്ഷണം വിഭാഗത്തിൽ ₹900 ചേർത്തു. ശ്രദ്ധിക്കൂ: ഈ മാസത്തെ ഭക്ഷണം ബജറ്റ് ₹5,000 തീർന്നു, ആകെ ₹5,100 ചെലവായി."
    )
    assert data["spoken_text"] == (
        "ഭക്ഷണം വിഭാഗത്തിൽ 900 രൂപ ചേർത്തു. ശ്രദ്ധിക്കൂ: ഈ മാസത്തെ ഭക്ഷണം ബജറ്റ് 5000 രൂപ തീർന്നു, ആകെ 5100 രൂപ ചെലവായി."
    )
    assert data["mood"] == "concerned"


def test_multi_add_appends_the_alert_after_the_combined_reply(db):
    user_id = _user(db)
    _food_budget(db, user_id)
    plan = Plan(actions=[
        AddAction(kind="expense", amount=200, category="Food"),
        AddAction(kind="expense", amount=80, category="Transport"),
    ], language="en")
    data = _send(user_id, "200 lunch and 80 auto", plan).json()
    assert data["reply_text"] == (
        "Added ₹200 to Food and Added ₹80 to Transport. "
        "Heads up: Food is at 82% of its ₹5,000 budget this month."
    )


def test_confirmed_future_date_add_this_month_alerts(db):
    user_id = _user(db)
    _food_budget(db, user_id)
    first = _send(user_id, "dinner 200 on the 20th", _add_plan(200, date_str="2026-11-20")).json()
    assert first["pending"]["kind"] == "confirm"
    res = client.post(
        f"/assistant/pending/{first['pending']['id']}/answer",
        json={"answer": "yes"},
        headers=_auth(user_id),
    )
    assert res.status_code == 200
    assert res.json()["reply_text"] == (
        "Recorded transaction. Heads up: Food is at 82% of its ₹5,000 budget this month."
    )


def test_multi_action_plan_crossing_80_alerts_once(db):
    user_id = _user(db)
    _food_budget(db, user_id, spent=3500)
    plan = Plan(actions=[
        AddAction(kind="expense", amount=300, category="Food"),   # 76%
        AddAction(kind="expense", amount=300, category="Food"),   # 82%, crosses 80
        AddAction(kind="expense", amount=100, category="Food"),   # 84%
    ], language="en")
    data = _send(user_id, "300 lunch, 300 dinner and 100 tea", plan).json()
    assert data["reply_text"].count("Heads up") == 1
    assert data["reply_text"].endswith("Heads up: Food is at 82% of its ₹5,000 budget this month.")
    assert data["mood"] == "happy"


def test_multi_action_plan_crossing_80_then_100_gives_only_the_100_line(db):
    user_id = _user(db)
    _food_budget(db, user_id, spent=3700)
    plan = Plan(actions=[
        AddAction(kind="expense", amount=500, category="Food"),    # 84%, crosses 80
        AddAction(kind="expense", amount=1000, category="Food"),   # 104%, crosses 100
    ], language="en")
    data = _send(user_id, "500 lunch and 1000 party", plan).json()
    assert data["reply_text"] == (
        "Added ₹500 to Food and Added ₹1,000 to Food. "
        "Heads up: your Food budget of ₹5,000 is used up this month, ₹5,200 spent."
    )
    assert data["mood"] == "concerned"


# ==============================================================================
# 5. Budget alert after an edit, delete or undo
# ==============================================================================

def _edit_last(amount=None, category=None, language="en"):
    patch_ = {k: v for k, v in (("amount", amount), ("category", category)) if v is not None}
    return Plan(actions=[EditAction(selector=Selector(ref="last_touched"), patch=patch_)], language=language)


def test_edit_raising_an_expense_across_80_alerts(db):
    user_id = _user(db)
    _food_budget(db, user_id, spent=0)
    _send(user_id, "spent 3000 on food", _add_plan(3000))                      # 60%
    data = _send(user_id, "make it 4200", _edit_last(amount=4200)).json()      # 84%
    assert data["reply_text"] == (
        "Changed Food ₹3,000 on 8 Nov to ₹4,200. Say undo to revert. "
        "Heads up: Food is at 84% of its ₹5,000 budget this month."
    )
    assert data["results"][0]["data"]["budget_alert"]["alert"] == "near"
    assert data["mood"] == "neutral"  # an edit's usual mood; 80% does not change it


def test_edit_raising_an_expense_across_100_alerts_in_malayalam(db):
    user_id = _user(db, "ml")
    _food_budget(db, user_id, spent=0)
    _send(user_id, "ഭക്ഷണത്തിന് 4500", _add_plan(4500, language="ml"))        # 90%
    data = _send(user_id, "അത് 5200 ആക്കൂ", _edit_last(amount=5200, language="ml")).json()
    assert data["reply_text"].endswith("ശ്രദ്ധിക്കൂ: ഈ മാസത്തെ ഭക്ഷണം ബജറ്റ് ₹5,000 തീർന്നു, ആകെ ₹5,200 ചെലവായി.")
    assert data["spoken_text"].endswith("ശ്രദ്ധിക്കൂ: ഈ മാസത്തെ ഭക്ഷണം ബജറ്റ് 5000 രൂപ തീർന്നു, ആകെ 5200 രൂപ ചെലവായി.")
    assert data["mood"] == "concerned"


def test_edit_moving_an_expense_into_a_budgeted_category_alerts(db):
    user_id = _user(db)
    _food_budget(db, user_id, spent=3500)                                      # 70%
    _send(user_id, "auto 800", _add_plan(800, category="Transport"))
    data = _send(user_id, "that was food", _edit_last(category="Food")).json()  # 86%
    assert data["reply_text"].endswith("Heads up: Food is at 86% of its ₹5,000 budget this month.")


@pytest.mark.parametrize("start,new_amount", [(4200, 3000), (4200, 4300)])
def test_edit_that_lowers_or_stays_in_the_same_state_does_not_alert(db, start, new_amount):
    user_id = _user(db)
    _food_budget(db, user_id, spent=0)
    _send(user_id, "spent on food", _add_plan(start))                          # 84%
    data = _send(user_id, "change it", _edit_last(amount=new_amount)).json()
    assert "Heads up" not in data["reply_text"]
    assert "budget_alert" not in data["results"][0]["data"]


def test_confirmed_edit_of_an_older_expense_alerts(db):
    user_id = _user(db)
    _food_budget(db, user_id, spent=3000)                                      # 60%
    old = Transaction(
        id=uuid.uuid4(), user_id=user_id, category_id=_cat(db, "Food").id, amount=Decimal("700"),
        type="expense", txn_date=date(2026, 11, 2), created_at=datetime(2026, 11, 2, 9, 0, tzinfo=timezone.utc),
    )
    db.add(old)
    db.commit()
    plan = Plan(actions=[EditAction(selector=Selector(category="Food", amount=700), patch={"amount": 1200})])
    first = _send(user_id, "the 700 food was 1200", plan).json()
    assert first["pending"]["kind"] == "confirm"
    done = _answer(user_id, first["pending"]["id"], "yes")                    # 84%
    assert done["reply_text"].endswith("Heads up: Food is at 84% of its ₹5,000 budget this month.")
    assert done["spoken_text"] == done["reply_text"]


def test_delete_below_a_threshold_never_alerts_and_the_next_crossing_alerts_again(db):
    user_id = _user(db)
    _food_budget(db, user_id, spent=4200)                                      # 84%
    over = _send(user_id, "dinner 900", _add_plan(900)).json()                 # 102%
    assert "is used up" in over["reply_text"]

    first = _send(user_id, "delete that", Plan(actions=[DeleteAction(selector=Selector(ref="last_touched"))])).json()
    done = _answer(user_id, first["pending"]["id"], "yes")                    # back to 84%
    assert "Heads up" not in done["reply_text"]
    assert done["mood"] == "neutral"

    again = _send(user_id, "dinner 900", _add_plan(900)).json()
    assert again["reply_text"].endswith("Heads up: your Food budget of ₹5,000 is used up this month, ₹5,100 spent.")


def test_undo_never_alerts_and_the_next_crossing_alerts_again(db):
    user_id = _user(db)
    _food_budget(db, user_id)                                                  # 3900, 78%
    crossed = _send(user_id, "lunch 200", _add_plan(200)).json()               # 82%
    assert "Heads up" in crossed["reply_text"]

    undone = _send(user_id, "undo", Plan(actions=[UndoActionOp()])).json()     # back to 78%
    assert undone["reply_text"] == "Undone last action."

    again = _send(user_id, "lunch 200", _add_plan(200)).json()
    assert again["reply_text"].endswith("Heads up: Food is at 82% of its ₹5,000 budget this month.")


def test_undo_restoring_a_deleted_expense_over_a_threshold_does_not_alert(db):
    user_id = _user(db)
    _food_budget(db, user_id, spent=3900)
    _send(user_id, "lunch 1200", _add_plan(1200))                              # 102%
    first = _send(user_id, "delete that", Plan(actions=[DeleteAction(selector=Selector(ref="last_touched"))])).json()
    _answer(user_id, first["pending"]["id"], "yes")                           # 78%
    undone = _send(user_id, "undo", Plan(actions=[UndoActionOp()])).json()     # 102% again
    assert undone["reply_text"] == "Undone last action."
    assert undone["mood"] == "neutral"
