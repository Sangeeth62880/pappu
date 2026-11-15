"""
Planner case matrix for Assistant v2 (CLAUDE.md testing conventions).

For each action type (add, edit, delete, query) the planner is fed a mocked LLM answer for:
  - a clean high-confidence message,
  - a message with a missing field (the planner asks, with missing_fields),
  - a code-mixed Malayalam-English message.
Multi-match is decided by the resolver, not the LLM, so those cases resolve the planner's
selector against real rows and expect outcome "many" (edit and delete only: an add or a
query never targets one existing row).

These replace the same matrix that used to run against the retired /intent parser.
"""

import json
import uuid
from datetime import timedelta
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.assistant.context import AssistantContext
from app.assistant.planner import AssistantPlanner
from app.assistant.resolver import resolve
from app.database import Base, init_db
from app.models.category import Category
from app.models.profile import Profile
from app.models.transaction import Transaction
from app.services.date_utils import get_current_ist_datetime


def plan_for(text, llm_json):
    llm = MagicMock()
    llm._make_request.return_value = json.dumps(llm_json, ensure_ascii=False)
    planner = AssistantPlanner(llm_client=llm)
    plan = planner.plan(text, AssistantContext(today="2026-11-15", weekday="Sunday"))
    # The user's words reach the model unchanged, as the last message.
    assert llm._make_request.call_args.args[0][-1] == {"role": "user", "content": text}
    assert llm._make_request.call_count == 1
    return plan


def only_action(plan):
    assert len(plan.actions) == 1
    return plan.actions[0]


class TestAdd:
    def test_clean(self):
        action = only_action(plan_for(
            "Spent 250 on lunch",
            {"ops": [{"op": "add", "kind": "expense", "amount": 250, "category": "Food", "description": "lunch"}], "language": "en"},
        ))
        assert (action.op, action.kind, action.amount, action.category) == ("add", "expense", 250, "Food")

    def test_missing_amount_asks(self):
        action = only_action(plan_for(
            "I bought something",
            {"ops": [{"op": "clarify", "question": "How much was it?", "missing_fields": ["amount"]}], "language": "en"},
        ))
        assert action.op == "clarify"
        assert action.missing_fields == ["amount"]

    def test_code_mixed(self):
        action = only_action(plan_for(
            "innale auto kku 80 koduthu",
            {"ops": [{"op": "add", "kind": "expense", "amount": 80, "category": "Transport", "date": "2026-11-14"}], "language": "mixed"},
        ))
        assert (action.op, action.amount, action.category, action.date) == ("add", 80, "Transport", "2026-11-14")

    def test_person_add_in_malayalam_script(self):
        action = only_action(plan_for(
            "പൂജയ്ക്ക് 300 കൊടുത്തു",
            {"ops": [{"op": "add", "kind": "person", "amount": 300, "direction": "sent", "contact": "Pooja"}], "language": "ml"},
        ))
        assert (action.kind, action.direction, action.contact) == ("person", "sent", "Pooja")


class TestEdit:
    def test_clean(self):
        action = only_action(plan_for(
            "Change yesterday's transport to 150",
            {"ops": [{"op": "edit", "selector": {"category": "Transport", "date_from": "2026-11-14", "date_to": "2026-11-14"}, "patch": {"amount": 150}}], "language": "en"},
        ))
        assert action.op == "edit"
        assert action.patch == {"amount": 150}
        assert action.selector.category == "Transport"

    def test_missing_new_value_asks(self):
        action = only_action(plan_for(
            "Edit the food expense",
            {"ops": [{"op": "clarify", "question": "What should I change it to?", "missing_fields": ["amount"]}], "language": "en"},
        ))
        assert action.op == "clarify"
        assert action.missing_fields == ["amount"]

    def test_code_mixed(self):
        action = only_action(plan_for(
            "food bill 450 aakku",
            {"ops": [{"op": "edit", "selector": {"category": "Food", "recency": "latest"}, "patch": {"amount": 450}}], "language": "mixed"},
        ))
        assert action.op == "edit"
        assert action.patch == {"amount": 450}

    def test_an_edit_with_nothing_to_change_is_rejected_and_falls_back_to_a_question(self):
        llm = MagicMock()
        llm._make_request.return_value = json.dumps({"ops": [{"op": "edit", "selector": {"category": "Food"}, "patch": {}}]})
        plan = AssistantPlanner(llm_client=llm).plan("edit food", AssistantContext(today="2026-11-15", weekday="Sunday"))
        assert llm._make_request.call_count == 2  # one retry with the validation error
        assert only_action(plan).op == "clarify"


class TestDelete:
    def test_clean(self):
        action = only_action(plan_for(
            "Delete the food expense from yesterday",
            {"ops": [{"op": "delete", "selector": {"category": "Food", "date_from": "2026-11-14", "date_to": "2026-11-14"}}], "language": "en"},
        ))
        assert action.op == "delete"
        assert action.selector.category == "Food"

    def test_missing_target_asks(self):
        action = only_action(plan_for(
            "Delete something",
            {"ops": [{"op": "clarify", "question": "Which one should I delete?", "missing_fields": ["target"]}], "language": "en"},
        ))
        assert action.op == "clarify"
        assert action.missing_fields == ["target"]

    def test_code_mixed(self):
        action = only_action(plan_for(
            "swiggy 350 delete chey",
            {"ops": [{"op": "delete", "selector": {"amount": 350, "text": "swiggy"}}], "language": "mixed"},
        ))
        assert action.op == "delete"
        assert (action.selector.amount, action.selector.text) == (350, "swiggy")


class TestQuery:
    def test_clean(self):
        action = only_action(plan_for(
            "How much did I spend on food this month?",
            {"ops": [{"op": "query", "query_kind": "sum", "selector": {"category": "Food", "period": "this_month"}}], "language": "en"},
        ))
        assert (action.op, action.query_kind, action.selector.category) == ("query", "sum", "Food")

    def test_vague_question_asks(self):
        action = only_action(plan_for(
            "Show my",
            {"ops": [{"op": "clarify", "question": "What would you like to see?", "missing_fields": ["query"]}], "language": "en"},
        ))
        assert action.op == "clarify"
        assert action.missing_fields == ["query"]

    def test_code_mixed(self):
        action = only_action(plan_for(
            "ee masam ethra chelavayi",
            {"ops": [{"op": "query", "query_kind": "sum", "selector": {"period": "this_month"}}], "language": "mixed"},
        ))
        assert (action.op, action.query_kind) == ("query", "sum")

    def test_malayalam_script(self):
        action = only_action(plan_for(
            "ഈ മാസം ഭക്ഷണത്തിന് എത്ര ചെലവായി?",
            {"ops": [{"op": "query", "query_kind": "sum", "selector": {"category": "Food", "period": "this_month"}}], "language": "ml"},
        ))
        assert action.selector.category == "Food"


@pytest.fixture
def db_with_two_food_rows():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def _fk(dbapi_connection, _record):
        dbapi_connection.cursor().execute("PRAGMA foreign_keys=ON")

    init_db(bind_engine=engine)
    session = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    user_id = uuid.uuid4()
    session.add(Profile(id=user_id, name="Tester"))
    food = session.query(Category).filter(Category.name == "Food").first()
    today = get_current_ist_datetime().date()
    for days_ago in (0, 1):
        session.add(Transaction(
            id=uuid.uuid4(), user_id=user_id, type="expense", amount=Decimal("500.00"),
            category_id=food.id, txn_date=today - timedelta(days=days_ago),
        ))
    session.commit()
    try:
        yield session, user_id
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


class TestMultiMatch:
    """Two rows fit what the user said: the resolver reports "many", so the user is asked to pick."""

    def test_edit_selector_matching_two_rows(self, db_with_two_food_rows):
        session, user_id = db_with_two_food_rows
        action = only_action(plan_for(
            "Change the 500 food expense to 300",
            {"ops": [{"op": "edit", "selector": {"category": "Food", "amount": 500}, "patch": {"amount": 300}}], "language": "en"},
        ))
        result = resolve(session, user_id, action.selector)
        assert result.outcome == "many"
        assert len(result.rows) == 2

    def test_delete_selector_matching_two_rows(self, db_with_two_food_rows):
        session, user_id = db_with_two_food_rows
        action = only_action(plan_for(
            "food 500 delete chey",
            {"ops": [{"op": "delete", "selector": {"category": "Food", "amount": 500}}], "language": "mixed"},
        ))
        result = resolve(session, user_id, action.selector)
        assert result.outcome == "many"
        assert len(result.rows) == 2
