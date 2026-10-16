"""
Unit tests for Pappu Assistant v2 Planner, Schemas, Context, and Fast Path.
"""

import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch
import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, init_db
from app.models import Profile, Category, Contact, Transaction, ChatMessage, PendingAction
from app.assistant.schemas import (
    Plan,
    AddAction,
    EditAction,
    DeleteAction,
    QueryAction,
    ClarifyAction,
    ChatAction,
    AnswerPendingAction,
    Selector,
)
from app.assistant.context import load_assistant_context, AssistantContext, PendingItemContextItem
from app.assistant.planner import AssistantPlanner, check_fast_path, FAST_PATH_EXACT_MATCHES
from app.services.tracing import AssistantTracer


@pytest.fixture
def db_session():
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
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


# ==============================================================================
# 1. Schema Validation Tests
# ==============================================================================

def test_add_action_validation():
    # Valid expense
    a = AddAction(kind="expense", amount=100.0, category="Food")
    assert a.amount == 100.0

    # Negative or zero amount rejected
    with pytest.raises(ValidationError):
        AddAction(kind="expense", amount=0, category="Food")

    with pytest.raises(ValidationError):
        AddAction(kind="expense", amount=-10, category="Food")

    # Person transaction requires contact and direction
    with pytest.raises(ValidationError):
        AddAction(kind="person", amount=100.0, contact=None, direction="sent")

    with pytest.raises(ValidationError):
        AddAction(kind="person", amount=100.0, contact="Pooja", direction=None)


def test_edit_action_validation():
    # Empty patch rejected
    with pytest.raises(ValidationError):
        EditAction(selector=Selector(amount=50.0), patch={})

    # Valid edit
    e = EditAction(selector=Selector(amount=50.0), patch={"amount": 75.0})
    assert e.patch["amount"] == 75.0


def test_plan_action_count_limits():
    # 0 actions rejected
    with pytest.raises(ValidationError):
        Plan(actions=[])

    # 5 actions accepted
    actions = [AddAction(kind="expense", amount=10 * i, category="Food") for i in range(1, 6)]
    p = Plan(actions=actions)
    assert len(p.actions) == 5
    assert len(p.ops) == 5

    # 6 actions rejected (max 5)
    actions_6 = [AddAction(kind="expense", amount=10 * i, category="Food") for i in range(1, 7)]
    with pytest.raises(ValidationError):
        Plan(actions=actions_6)


def test_clarify_action_missing_fields_compatibility():
    # Created with missing_fields
    c1 = ClarifyAction(question="How much?", missing_fields=["amount"])
    assert c1.missing_fields == ["amount"]
    assert c1.missing == ["amount"]

    # Created with missing alias from json
    data = {"op": "clarify", "question": "Which date?", "missing": ["date"]}
    c2 = ClarifyAction.model_validate(data)
    assert c2.missing_fields == ["date"]
    assert c2.missing == ["date"]


def test_chat_action_kind_validation():
    c_greet = ChatAction(kind="greeting")
    assert c_greet.kind == "greeting"

    c_unsupported = ChatAction(kind="unsupported")
    assert c_unsupported.kind == "unsupported"

    with pytest.raises(ValidationError):
        ChatAction(kind="invalid_kind")


# ==============================================================================
# 2. Fast Path Tests
# ==============================================================================

def test_fast_path_exact_matches():
    pending_ctx = AssistantContext(
        today="2026-10-14",
        weekday="Wednesday",
        pending_item=PendingItemContextItem(id="p1", kind="confirm"),
    )

    for word, expected_val in FAST_PATH_EXACT_MATCHES.items():
        plan = check_fast_path(word, pending_ctx)
        assert plan is not None
        assert len(plan.actions) == 1
        assert plan.actions[0].op == "answer_pending"
        assert plan.actions[0].value == expected_val

    # Case insensitive
    plan_upper = check_fast_path("YES", pending_ctx)
    assert plan_upper is not None
    assert plan_upper.actions[0].value == "yes"


def test_fast_path_returns_none_when_no_pending_or_non_match():
    # No pending item
    empty_ctx = AssistantContext(today="2026-10-14", weekday="Wednesday", pending_item=None)
    assert check_fast_path("yes", empty_ctx) is None

    # Pending item exists, but text is not in exact match list
    pending_ctx = AssistantContext(
        today="2026-10-14",
        weekday="Wednesday",
        pending_item=PendingItemContextItem(id="p1", kind="confirm"),
    )
    assert check_fast_path("yes please do that now", pending_ctx) is None
    assert check_fast_path("I think so", pending_ctx) is None


# ==============================================================================
# 3. Context Loader Tests
# ==============================================================================

def test_context_loader_parallel_and_isolated(db_session):
    user_a = uuid.uuid4()
    user_b = uuid.uuid4()

    prof_a = Profile(id=user_a, name="User A", preferred_language="en")
    prof_b = Profile(id=user_b, name="User B", preferred_language="en")
    db_session.add_all([prof_a, prof_b])

    # User A data
    c_a = Contact(id=uuid.uuid4(), user_id=user_a, name="Pooja", aliases=["pooj"])
    m_a = ChatMessage(user_id=user_a, role="user", text="Spent 250 on lunch")
    p_a = PendingAction(id=uuid.uuid4(), user_id=user_a, kind="confirm", plan_json={"ops": []}, status="pending")
    db_session.add_all([c_a, m_a, p_a])

    # User B data
    c_b = Contact(id=uuid.uuid4(), user_id=user_b, name="Secret Contact", aliases=[])
    m_b = ChatMessage(user_id=user_b, role="user", text="User B secret")
    db_session.add_all([c_b, m_b])
    db_session.commit()

    ctx_a = load_assistant_context(user_a, db=db_session)

    assert ctx_a.today is not None
    assert ctx_a.weekday is not None
    assert len(ctx_a.contacts) == 1
    assert ctx_a.contacts[0].name == "Pooja"
    assert len(ctx_a.last_3_chat_turns) == 1
    assert ctx_a.last_3_chat_turns[0].text == "Spent 250 on lunch"
    assert ctx_a.pending_item is not None
    assert ctx_a.pending_item.kind == "confirm"
    assert ctx_a.token_estimate > 0

    # User B data is never leaked into User A context
    contact_names_a = [c.name for c in ctx_a.contacts]
    assert "Secret Contact" not in contact_names_a


# ==============================================================================
# 4. Planner LLM Retry and Fallback Tests
# ==============================================================================

def test_planner_retry_on_first_schema_failure():
    mock_client = MagicMock()
    # First response: invalid JSON
    # Second response: valid Plan JSON
    mock_client._make_request.side_effect = [
        "This is not JSON at all",
        '{"ops": [{"op": "add", "kind": "expense", "amount": 250, "category": "Food"}]}',
    ]

    planner = AssistantPlanner(llm_client=mock_client)
    ctx = AssistantContext(today="2026-10-14", weekday="Wednesday")

    plan = planner.plan("Spent 250 on lunch", ctx)
    assert len(plan.actions) == 1
    assert plan.actions[0].op == "add"
    assert plan.actions[0].amount == 250
    assert mock_client._make_request.call_count == 2


def test_planner_fallback_clarify_after_second_failure():
    mock_client = MagicMock()
    # Both calls fail
    mock_client._make_request.side_effect = [
        "Broken output 1",
        "Broken output 2",
    ]

    planner = AssistantPlanner(llm_client=mock_client)
    ctx = AssistantContext(today="2026-10-14", weekday="Wednesday")

    plan = planner.plan("Spent 250 on lunch", ctx)
    assert len(plan.actions) == 1
    assert plan.actions[0].op == "clarify"
    assert plan.actions[0].question == "Sorry, could you say that again?"
    assert mock_client._make_request.call_count == 2
