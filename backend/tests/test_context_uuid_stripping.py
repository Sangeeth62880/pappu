"""
Unit tests for stripping IDs and UUIDs from Assistant v2 LLM context.

Verifies:
1. AssistantContext.to_dict_for_prompt() sends only names, amounts, categories, dates, and descriptions.
2. No UUID pattern appears in the prompt payload sent to the LLM planner.
3. Server side ID map preserves contact IDs, last touched ID, and pending item ID.
"""

import re
import uuid
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, init_db
from app.services.date_utils import get_current_ist_datetime
from app.models import Profile, Category, Contact, Transaction, UndoAction, PendingAction, ChatMessage
from app.assistant.context import (
    load_assistant_context,
    AssistantContext,
    ContactContextItem,
    LastTouchedContextItem,
    PendingItemContextItem,
    UUID_REGEX,
)
from app.assistant.planner import AssistantPlanner


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


def test_no_uuid_pattern_in_to_dict_for_prompt():
    c_id = str(uuid.uuid4())
    lt_id = str(uuid.uuid4())
    p_id = str(uuid.uuid4())
    cand_id = str(uuid.uuid4())

    ctx = AssistantContext(
        today="2026-10-14",
        weekday="Wednesday",
        contacts=[
            ContactContextItem(id=c_id, name="Pooja", aliases=["pooja"]),
        ],
        last_touched_transaction=LastTouchedContextItem(
            id=lt_id,
            amount=250.0,
            category="Food",
            contact="Pooja",
            date="2026-10-14",
            description="lunch",
        ),
        pending_item=PendingItemContextItem(
            id=p_id,
            kind="disambiguate",
            plan={"question": "Which transaction?", "action": {"op": "delete"}},
            candidates=[
                {
                    "id": cand_id,
                    "user_id": str(uuid.uuid4()),
                    "category_id": 1,
                    "category_name": "Food",
                    "amount": 250.0,
                    "date": "2026-10-14",
                    "description": "lunch",
                }
            ],
        ),
    )

    prompt_dict = ctx.to_dict_for_prompt()
    prompt_str = str(prompt_dict)

    # Assert no UUID pattern in dictionary representation
    uuid_matches = UUID_REGEX.findall(prompt_str)
    assert uuid_matches == [], f"Found UUIDs in prompt context: {uuid_matches}"

    # Contacts check
    assert len(prompt_dict["contacts"]) == 1
    assert "id" not in prompt_dict["contacts"][0]
    assert prompt_dict["contacts"][0]["name"] == "Pooja"

    # Last touched check
    assert "id" not in prompt_dict["last_touched_transaction"]
    assert prompt_dict["last_touched_transaction"]["amount"] == 250.0
    assert prompt_dict["last_touched_transaction"]["category"] == "Food"

    # Pending item check
    assert "id" not in prompt_dict["pending_item"]
    cands = prompt_dict["pending_item"].get("candidates", [])
    assert len(cands) == 1
    assert "id" not in cands[0]
    assert "user_id" not in cands[0]
    assert "category_id" not in cands[0]
    assert cands[0]["amount"] == 250.0


def test_no_uuid_pattern_in_planner_prompt_payload():
    c_id = str(uuid.uuid4())
    lt_id = str(uuid.uuid4())
    p_id = str(uuid.uuid4())

    ctx = AssistantContext(
        today="2026-10-14",
        weekday="Wednesday",
        contacts=[
            ContactContextItem(id=c_id, name="Rahul", aliases=["rahul"]),
        ],
        last_touched_transaction=LastTouchedContextItem(
            id=lt_id,
            amount=500.0,
            category="Shopping",
            contact="Rahul",
            date="2026-10-13",
            description="groceries",
        ),
        pending_item=PendingItemContextItem(
            id=p_id,
            kind="confirm",
            plan={"question": "Delete Rahul ₹500 on 13 Oct?"},
        ),
    )

    planner = AssistantPlanner()
    rendered_prompt = planner.build_system_prompt(ctx)

    uuid_matches = UUID_REGEX.findall(rendered_prompt)
    assert uuid_matches == [], f"Found UUIDs in rendered system prompt: {uuid_matches}"
    assert "Rahul" in rendered_prompt
    assert "Shopping" in rendered_prompt
    assert "500" in rendered_prompt


def test_server_side_id_map_preserves_identifiers():
    c_id = str(uuid.uuid4())
    lt_id = str(uuid.uuid4())
    p_id = str(uuid.uuid4())

    data = {
        "today": "2026-10-14",
        "weekday": "Wednesday",
        "contacts": [{"id": c_id, "name": "Anu", "aliases": ["anu"]}],
        "last_touched_transaction": {
            "id": lt_id,
            "amount": 400.0,
            "category": "Other",
            "contact": "Anu",
            "txn_date": "2026-10-14",
            "description": "borrowed money",
        },
        "pending_item": {
            "id": p_id,
            "kind": "confirm",
            "plan": {"question": "Record 400?"},
        },
    }

    ctx = AssistantContext.from_dict(data)

    # Server side ID map has the IDs
    assert ctx.get_last_touched_id() == lt_id
    assert ctx.get_pending_item_id() == p_id
    assert ctx.get_contact_id("anu") == c_id

    # But prompt dict does not leak them
    prompt_str = str(ctx.to_dict_for_prompt())
    assert UUID_REGEX.search(prompt_str) is None


def test_end_to_end_context_loading_has_no_uuids_in_prompt(db_session):
    user_id = uuid.uuid4()
    prof = Profile(id=user_id, name="Test User", preferred_language="en")
    c = Contact(id=uuid.uuid4(), user_id=user_id, name="Vivek", aliases=["vivek"])
    cat = db_session.query(Category).first()

    txn = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=150.0,
        category_id=cat.id if cat else 1,
        description="coffee",
        txn_date=get_current_ist_datetime().date(),
    )
    undo = UndoAction(
        user_id=user_id,
        action_type="add",
        transaction_id=txn.id,
    )
    pending = PendingAction(
        id=uuid.uuid4(),
        user_id=user_id,
        kind="confirm",
        plan_json={"question": "Delete coffee ₹150 on 14 Oct?"},
        status="pending",
    )
    msg = ChatMessage(
        user_id=user_id,
        role="user",
        text="Paid 150 for coffee",
    )
    db_session.add_all([prof, c, txn, undo, pending, msg])
    db_session.commit()

    ctx = load_assistant_context(user_id, db=db_session)
    planner = AssistantPlanner()
    rendered_prompt = planner.build_system_prompt(ctx)

    uuid_matches = UUID_REGEX.findall(rendered_prompt)
    assert uuid_matches == [], f"Found UUIDs in prompt rendered from database context: {uuid_matches}"
    assert ctx.get_last_touched_id() == str(txn.id)
    assert ctx.get_pending_item_id() == str(pending.id)
    assert ctx.get_contact_id("vivek") == str(c.id)
