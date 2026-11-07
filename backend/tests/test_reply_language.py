"""
Reply language tests for Assistant v2.

- Plan.language is optional; invalid values coerce to None instead of failing validation.
- Reply language: detected language wins, 'mixed' / missing / invalid fall back to the profile.
- Every composer reply template has a Malayalam version (iterates TEMPLATES).
- Every reply type renders fully in Malayalam, spoken text is TTS clean, ml-IN is returned.
- Malayalam and Manglish confirm / cancel words answer a pending item.
"""

import json
import re
import uuid
from datetime import date
from decimal import Decimal
from string import Formatter
from typing import get_args
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.auth import jwks_client
from app.database import get_db, init_db
from app.models.chat_message import ChatMessage
from app.models.profile import Profile
from app.models.transaction import Transaction
from app.assistant.composer import (
    CATEGORY_NAMES_ML,
    MONTHS_ML,
    PERIOD_LABELS_ML,
    TEMPLATES,
    _compose_single_undo,
    compose_reply,
    render,
    resolve_reply_language,
    to_spoken,
    tts_language_code,
)
from app.assistant.context import AssistantContext, PendingItemContextItem
from app.assistant.pending import (
    CANCEL_ANSWERS,
    CONFIRM_ANSWERS,
    format_delete_confirmation_question,
    format_edit_confirmation_question,
    format_superseded_message,
)
from app.assistant.planner import FAST_PATH_EXACT_MATCHES, AssistantPlanner, check_fast_path
from app.assistant.sanitizer import sanitize_language
from app.assistant.schemas import (
    AddAction,
    AssistantResponse,
    ChatAction,
    ClarifyAction,
    DeleteAction,
    PendingSummary,
    PeriodLiteral,
    Plan,
    Selector,
)
from app.assistant.validation import resolve_category
from app.models.pending_action import PendingAction
from app.services.category_seed import SEED_CATEGORIES
from tests.test_assistant_message import MockSigningKey, _auth_header, test_public_key

client = TestClient(app)

MALAYALAM = re.compile(r"[ഀ-ൿ]")
LATIN = re.compile(r"[A-Za-z]")
DASHES = ("-", "–", "—")
CONTACT = "രാഹുൽ"


# ==============================================================================
# 1. Plan.language schema
# ==============================================================================

def test_plan_language_is_optional_and_defaults_to_none():
    assert Plan(actions=[ChatAction(kind="greeting")]).language is None
    assert Plan.model_validate({"ops": [{"op": "chat", "kind": "greeting"}]}).language is None


@pytest.mark.parametrize("raw,expected", [("en", "en"), ("ML", "ml"), (" mixed ", "mixed")])
def test_plan_language_accepts_known_values(raw, expected):
    plan = Plan.model_validate({"ops": [{"op": "undo"}], "language": raw})
    assert plan.language == expected


@pytest.mark.parametrize("raw", ["malayalam", "hi", "", 5, None, ["ml"]])
def test_plan_language_invalid_value_coerces_to_none(raw):
    plan = Plan.model_validate({"ops": [{"op": "undo"}], "language": raw})
    assert plan.language is None


# ==============================================================================
# 2. Reply language resolution, sanitizer, TTS code
# ==============================================================================

@pytest.mark.parametrize(
    "detected,preferred,expected",
    [
        ("ml", "en", "ml"),        # detected Malayalam wins
        ("en", "ml", "en"),        # detected English wins over a Malayalam profile
        (None, "ml", "ml"),        # missing detection falls back to profile
        (None, "en", "en"),
        ("klingon", "ml", "ml"),   # invalid detection falls back to profile
        ("mixed", "ml", "ml"),     # Manglish follows the profile preference
        ("mixed", "en", "en"),
        (None, None, "en"),
        (None, "mixed", "en"),
    ],
)
def test_resolve_reply_language(detected, preferred, expected):
    assert resolve_reply_language(detected, preferred) == expected


def test_tts_language_code():
    assert tts_language_code("ml") == "ml-IN"
    assert tts_language_code("en") == "en-IN"
    assert tts_language_code(None) == "en-IN"
    assert AssistantResponse(reply_text="x", spoken_text="x", language="ml").language_code == "ml-IN"
    assert AssistantResponse(reply_text="x", spoken_text="x").language_code == "en-IN"


@pytest.mark.parametrize(
    "language,text,expected",
    [
        ("ml", "ente food expense ethra aayi", "mixed"),   # Latin only cannot be Malayalam script
        ("en", "last transaction delete ചെയ്യൂ", "mixed"),  # Malayalam script cannot be pure English
        ("ml", "രാഹുലിന് 500 കൊടുത്തു", "ml"),
        ("en", "Spent 250 on lunch", "en"),
        ("mixed", "Rahulinu 500 koduthu", "mixed"),
        (None, "anything", None),
    ],
)
def test_sanitize_language_checks_script(language, text, expected):
    assert sanitize_language(language, text) == expected


def test_to_spoken_is_phonetic_for_malayalam_and_noop_for_english():
    assert to_spoken("ആകെ ₹1,50,000.", "ml") == "ആകെ 150000 രൂപ."
    assert to_spoken("ഏതാണ്? 1) ഭക്ഷണം ₹250, 2) യാത്ര ₹80", "ml") == "ഏതാണ്? 1. ഭക്ഷണം 250 രൂപ, 2. യാത്ര 80 രൂപ"
    assert to_spoken("Added ₹250 to Food.", "en") == "Added ₹250 to Food."


# ==============================================================================
# 3. Every reply template has a Malayalam version
# ==============================================================================

def _fields(template):
    return {name for _, name, _, _ in Formatter().parse(template) if name}


@pytest.mark.parametrize("key", sorted(TEMPLATES))
def test_every_reply_template_has_malayalam(key):
    entry = TEMPLATES[key]
    en, ml = entry.get("en"), entry.get("ml")
    assert en, f"{key} has no English template"
    assert ml, f"{key} has no Malayalam template"
    assert ml != en, f"{key} Malayalam template is a copy of the English one"
    literal = re.sub(r"\{[^}]*\}", "", ml)
    if re.search(r"[^\W\d_]", literal):
        # Any words in the template itself must be Malayalam (compare.result is placeholders only).
        assert MALAYALAM.search(literal), f"{key} Malayalam template has no Malayalam script"
    assert not LATIN.search(literal), f"{key} Malayalam template contains Latin text: {ml!r}"
    assert _fields(ml) <= _fields(en), f"{key} Malayalam template uses unknown placeholders"
    for text in (en, ml):
        assert not any(d in text for d in DASHES), f"{key} uses a hyphen or dash: {text!r}"


def test_malayalam_lookup_tables_are_complete():
    for cat in SEED_CATEGORIES:
        assert cat["name"].lower() in CATEGORY_NAMES_ML, f"No Malayalam name for {cat['name']}"
    for period in get_args(PeriodLiteral):
        assert period in PERIOD_LABELS_ML, f"No Malayalam label for period {period}"
    assert len(MONTHS_ML) == 12
    for value in [*CATEGORY_NAMES_ML.values(), *MONTHS_ML, *PERIOD_LABELS_ML.values()]:
        assert MALAYALAM.search(value) and not any(d in value for d in DASHES)


# ==============================================================================
# 4. Every reply type renders fully in Malayalam
# ==============================================================================

def _ok(action, data=None, status=None):
    res = {"ok": True, "action": action, "data": data or {}}
    if status:
        res["status"] = status
    return res


def _fail(action, error, filters=None):
    res = {"ok": False, "action": action, "error": error}
    if filters is not None:
        res["filters_used"] = filters
    return res


RANGE = {"resolved_date_from": "2026-10-05", "resolved_date_to": "2026-10-11"}
ROWS = [
    {"amount": 250, "category_name": "Food", "txn_date": "2026-10-10"},
    {"amount": 80, "category_name": "Transport", "txn_date": "2026-10-09"},
    {"amount": 999, "category_name": "Bills", "txn_date": "2026-10-08"},
    {"amount": 120, "category_name": "Shopping", "txn_date": "2026-10-07"},
]


def _person(flow, direction, txn_type):
    return _ok("add", {
        "kind": "person", "type": txn_type, "direction": direction, "amount": 500,
        "contact_name": CONTACT, "person_flow": flow,
    })


def _query(status, data):
    return _ok("query", data, status=status)


def _plan(action):
    return Plan(actions=[action])


ML_SCENARIOS = [
    # add
    ("add_expense", {"results": [_ok("add", {"type": "expense", "amount": 250, "category_name": "Food"})]}),
    ("add_income", {"results": [_ok("add", {"kind": "income", "type": "income", "amount": 50000, "category_name": "Salary"})]}),
    ("add_person_sent", {"results": [_person(None, "sent", "expense")]}),
    ("add_person_repayment", {"results": [_person("repayment", "received", "income")]}),
    ("add_person_i_owe", {"results": [_person("i_owe", "received", "income")]}),
    ("add_person_they_owe", {"results": [_person("they_owe", "sent", "expense")]}),
    ("add_multi_action", {"results": [
        _ok("add", {"type": "expense", "amount": 250, "category_name": "Food"}),
        _ok("add", {"type": "expense", "amount": 80, "category_name": "Transport"}),
    ]}),
    # edit
    ("edit_amount", {"results": [_ok("edit", {"amount": 300, "category_name": "Food", "txn_date": "2026-10-14", "previous": {"amount": 250}})]}),
    ("edit_other_field", {"results": [_ok("edit", {"amount": 250, "category_name": "Transport", "previous": {"amount": 250}})]}),
    # delete
    ("delete_with_amount", {"results": [_ok("delete", {"amount": 250, "category_name": "Food", "txn_date": "2026-10-14"})]}),
    ("delete_income_no_category", {"results": [_ok("delete", {"amount": 900, "type": "income", "txn_date": "2026-10-14"})]}),
    ("delete_contact_no_amount", {"results": [_ok("delete", {"contact_name": CONTACT, "txn_date": "2026-10-14"})]}),
    ("delete_generic", {"results": [_ok("delete", {})]}),
    # undo
    ("undo_done", {"results": [_ok("undo", status="undone")]}),
    # query: balances
    ("balances_none_owed_to_me", {"results": [_query("balances", {"balance_side": "owed_to_me"})]}),
    ("balances_none_i_owe", {"results": [_query("balances", {"balance_side": "i_owe"})]}),
    ("balances_none_all", {"results": [_query("balances", {})]}),
    ("balances_entries", {"results": [_query("balances", {"balances": [
        {"contact_name": CONTACT, "net_balance": 500},
        {"contact_name": "അനു", "net_balance": -300},
        {"contact_name": "പൂജ", "net_balance": 0},
    ]})]}),
    # query: category breakdown
    ("breakdown_none_all_time", {"results": [_query("category_breakdown", {"categories": [], "filters_used": {"period": "all_time"}})]}),
    ("breakdown_full", {"results": [_query("category_breakdown", {"categories": [
        {"category": "Food", "total": 2500}, {"category": "Transport", "total": 800},
        {"category": "Bills", "total": 600}, {"category": "Other", "total": 100},
    ], "filters_used": RANGE})]}),
    # query: sum
    ("sum_income_category", {"results": [_query("sum", {"sum": 50000, "count": 1, "category": "Salary", "filters_used": {"direction": "received", **RANGE}})]}),
    ("sum_income_range", {"results": [_query("sum", {"sum": 7000, "count": 2, "filters_used": {"direction": "received", **RANGE}})]}),
    ("sum_income_total", {"results": [_query("sum", {"sum": 7000, "count": 2, "filters_used": {"direction": "received"}})]}),
    ("sum_spent_category", {"results": [_query("sum", {"sum": 2000, "count": 3, "category": "Food", "filters_used": RANGE})]}),
    ("sum_spent_range", {"results": [_query("sum", {"sum": 2000, "count": 3, "filters_used": RANGE})]}),
    ("sum_total", {"results": [_query("sum", {"sum": 2000, "count": 3, "filters_used": {}})]}),
    ("sum_no_match_for_amount", {"results": [_query("sum", {"sum": 0, "count": 0, "filters_used": {"amount": 600, "category": "Food"}})]}),
    # query: count, biggest, compare, list
    ("count_one", {"results": [_query("count", {"count": 1, "filters_used": RANGE})]}),
    ("count_many", {"results": [_query("count", {"count": 4, "filters_used": {"resolved_date_from": "2026-09-25", "resolved_date_to": "2026-10-05"}})]}),
    ("biggest_none", {"results": [_query("biggest", {"filters_used": {"resolved_date_from": "2026-10-05"}})]}),
    ("biggest_found", {"results": [_query("biggest", {"biggest": {"amount": 2000, "category_name": "Shopping", "txn_date": "2026-10-14"}})]}),
    ("compare_up", {"results": [_query("compare", {
        "sum_1": 8200, "sum_2": 6900, "delta": 1300, "period1_label": "This month", "period2_label": "last month",
        "filters_used_1": {"resolved_date_from": "2026-11-01", "resolved_date_to": "2026-11-07"},
        "filters_used_2": {"resolved_date_from": "2026-10-01", "resolved_date_to": "2026-10-31"},
    })]}),
    ("compare_down", {"results": [_query("compare", {
        "sum_1": 100, "sum_2": 400, "delta": -300, "period1_label": "Last 7 days", "period2_label": "period 2",
    })]}),
    ("list_full", {"results": [_query("list", {"transactions": ROWS, "filters_used": RANGE})]}),
    ("list_empty_category_amount_range", {"results": [_query("list", {"transactions": [], "filters_used": {"category": "Food", "amount": 600, **RANGE}})]}),
    ("list_empty_contact", {"results": [_query("list", {"transactions": [], "filters_used": {"contact": CONTACT}})]}),
    ("list_empty_category_and_contact", {"results": [_query("list", {"transactions": [], "filters_used": {"category": "Food", "contact": CONTACT}})]}),
    ("list_empty_income_amount", {"results": [_query("list", {"transactions": [], "filters_used": {"amount": 500, "direction": "received"}})]}),
    ("list_empty_no_filters", {"results": [_query("list", {"transactions": [], "filters_used": {"period": "this_month"}})]}),
    ("query_unknown_kind", {"results": [_query("mystery", {})]}),
    # errors
    ("error_not_found", {"results": [_fail("delete", "Transaction not found", {"category": "Food", "date_from": "2026-10-13", "date_to": "2026-10-13"})]}),
    ("error_unknown_contact", {"results": [_fail("delete", "Unknown contact", {"unknown_contact": "അനു"})]}),
    ("error_last_touched", {"results": [_fail("edit", "Transaction not found", {"ref": "last_touched"})]}),
    ("error_all_time_not_found", {"results": [_fail("delete", "Transaction not found", {"category": "Food", "period": "all_time"})]}),
    ("error_disambiguation", {"results": [_fail("edit", "Needs disambiguation")]}),
    ("error_nothing_pending", {"results": [_fail("answer_pending", "Nothing is waiting for confirmation.")]}),
    ("error_generic", {"results": [_fail("add", "Amount must be positive")]}),
    ("error_failed_undo", {"results": [_fail("undo", "Nothing to undo")]}),
    ("operation_done", {"results": [_ok("mystery")]}),
    ("not_found_no_filters", {"results": []}),
    # clarify (the planner's English question must not leak into a Malayalam reply)
    ("clarify_amount", {"plan": _plan(ClarifyAction(question="How much was the auto?", missing_fields=["amount"]))}),
    ("clarify_date", {"plan": _plan(ClarifyAction(question="32nd October is not a valid date.", missing_fields=["date"]))}),
    ("clarify_contact", {"plan": _plan(ClarifyAction(question="Who did you pay?", missing_fields=["contact"]))}),
    ("clarify_category", {"plan": _plan(ClarifyAction(question="Which category?", missing_fields=["category"]))}),
    ("clarify_generic", {"plan": _plan(ClarifyAction(question="Sorry, could you say that again?", missing_fields=[]))}),
    # chat
    ("chat_greeting", {"plan": _plan(ChatAction(kind="greeting"))}),
    ("chat_help", {"plan": _plan(ChatAction(kind="help"))}),
    ("chat_off_topic", {"plan": _plan(ChatAction(kind="off_topic"))}),
    ("chat_unsupported", {"plan": _plan(ChatAction(kind="unsupported"))}),
    ("chat_unsupported_bulk", {"plan": _plan(ChatAction(kind="unsupported_bulk"))}),
    # pending confirmations
    ("pending_delete_confirm", {"pending": PendingSummary(id="p1", kind="confirm", question=format_delete_confirmation_question(
        {"amount": 250, "category_name": "Food", "txn_date": "2026-10-14", "type": "expense"}, "ml"))}),
    ("pending_edit_confirm", {"pending": PendingSummary(id="p1", kind="confirm", question=format_edit_confirmation_question(
        {"amount": 250, "category_name": "Food", "txn_date": "2026-10-14"}, {"amount": 300}, "ml"))}),
    ("pending_future_add_confirm", {"pending": PendingSummary(id="p1", kind="confirm", question=render(
        "pending.future_add_question", "ml", amt="₹500", date="ഡിസംബർ 1"))}),
    ("pending_disambiguate", {"pending": PendingSummary(id="p1", kind="disambiguate", question="", candidates=ROWS)}),
    ("pending_new_contact", {"pending": PendingSummary(id="p1", kind="contact_confirm", question=render(
        "pending.new_contact_question", "ml", name=CONTACT))}),
    ("pending_contact_match", {"pending": PendingSummary(id="p1", kind="contact_confirm", question=render(
        "pending.contact_match_question", "ml", name=CONTACT))}),
]


def _compose(lang, scenario):
    kwargs = {"plan": None, "results": [], "pending": None, **scenario}
    return compose_reply(language=lang, **kwargs)


@pytest.mark.parametrize("name,scenario", ML_SCENARIOS, ids=[s[0] for s in ML_SCENARIOS])
def test_reply_type_renders_in_malayalam(name, scenario):
    reply, spoken = _compose("ml", scenario)
    for text in (reply, spoken):
        assert MALAYALAM.search(text), f"{name}: no Malayalam in {text!r}"
        assert not LATIN.search(text), f"{name}: English leaked into {text!r}"
        assert not any(d in text for d in DASHES), f"{name}: hyphen or dash in {text!r}"
    assert "₹" not in spoken, f"{name}: spoken text should say രൂപ, got {spoken!r}"

    if "pending" not in scenario:
        # Pending questions are rendered at creation in their own language; everything else must differ.
        en_reply, _ = _compose("en", scenario)
        assert en_reply != reply


def test_failed_undo_helper_has_malayalam():
    assert _compose_single_undo({"ok": False}, "ml") == "റദ്ദാക്കാൻ ഒന്നുമില്ല."


def test_malayalam_wording_examples():
    """Locks a few full sentences so wording changes are deliberate."""
    reply, spoken = _compose("ml", ML_SCENARIOS[0][1])
    assert reply == "ഭക്ഷണം വിഭാഗത്തിൽ ₹250 ചേർത്തു."
    assert spoken == "ഭക്ഷണം വിഭാഗത്തിൽ 250 രൂപ ചേർത്തു."

    reply, _ = _compose("ml", dict(ML_SCENARIOS)["sum_spent_range"])
    assert reply == "ഒക്ടോബർ 5 മുതൽ 11 വരെ ആകെ ₹2,000 ചെലവാക്കി."

    reply, _ = _compose("ml", dict(ML_SCENARIOS)["add_multi_action"])
    assert reply == "ഭക്ഷണം വിഭാഗത്തിൽ ₹250 ചേർത്തു, യാത്ര വിഭാഗത്തിൽ ₹80 ചേർത്തു."

    assert format_delete_confirmation_question(
        {"amount": 250, "category_name": "Food", "txn_date": "2026-10-14"}, "ml"
    ) == "ഒക്ടോബർ 14ലെ ഭക്ഷണം ₹250 ഒഴിവാക്കട്ടെ?"


def test_superseded_message_in_malayalam():
    item = PendingAction(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        kind="confirm",
        status="pending",
        plan_json={"action": {"op": "delete"}, "question": "x"},
        candidates_json=[{"contact_name": CONTACT, "amount": 300, "type": "expense"}],
    )
    assert format_superseded_message(item, "ml") == "മുമ്പ് ചോദിച്ച രാഹുൽ ₹300 ഒഴിവാക്കൽ റദ്ദാക്കി."
    # English stays exactly as before
    assert format_superseded_message(item) == "I cancelled the pending delete of രാഹുൽ ₹300."


# ==============================================================================
# 5. Malayalam / Manglish confirm and cancel words
# ==============================================================================

NEW_CONFIRM_WORDS = ["athe", "sheri", "seri", "aanu", "അതെ", "ശരി", "ആണ്"]
NEW_CANCEL_WORDS = ["venda", "vendaa", "illa", "വേണ്ട", "വേണ്ടാ", "ഇല്ല"]


def _pending_ctx():
    return AssistantContext(
        today="2026-10-14", weekday="Wednesday", pending_item=PendingItemContextItem(id="p1", kind="confirm")
    )


@pytest.mark.parametrize("word", NEW_CONFIRM_WORDS)
def test_malayalam_confirm_words_answer_yes(word):
    plan = check_fast_path(word, _pending_ctx())
    assert plan is not None and plan.actions[0].value == "yes"
    assert word in CONFIRM_ANSWERS


@pytest.mark.parametrize("word", NEW_CANCEL_WORDS)
def test_malayalam_cancel_words_answer_no(word):
    plan = check_fast_path(word, _pending_ctx())
    assert plan is not None and plan.actions[0].value == "no"
    assert word in CANCEL_ANSWERS


def test_fast_path_words_and_pending_normalizer_agree():
    for word, value in FAST_PATH_EXACT_MATCHES.items():
        if value == "yes":
            assert word in CONFIRM_ANSWERS, word
        else:
            assert word in CANCEL_ANSWERS or word in ("no", "cancel"), word


# ==============================================================================
# 6. End to end through /assistant/message and /assistant/pending/{id}/answer
# ==============================================================================

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


def _user(db: Session, preferred_language: str) -> uuid.UUID:
    user_id = uuid.uuid4()
    db.add(Profile(id=user_id, name="Lang User", preferred_language=preferred_language))
    db.commit()
    return user_id


def _food_txn(db: Session, user_id: uuid.UUID) -> Transaction:
    cat = resolve_category(db, "Food", default_type="expense")
    txn = Transaction(
        id=uuid.uuid4(), user_id=user_id, category_id=cat.id,
        amount=Decimal("250.00"), type="expense", txn_date=date(2026, 10, 14),
    )
    db.add(txn)
    db.commit()
    return txn


def _send(user_id, text, plan=None):
    if plan is None:
        # Fast path answers must never reach the planner.
        with patch.object(AssistantPlanner, "plan", side_effect=AssertionError("planner called")):
            return client.post("/assistant/message", json={"text": text}, headers=_auth_header(user_id))
    with patch.object(AssistantPlanner, "plan", return_value=plan):
        return client.post("/assistant/message", json={"text": text}, headers=_auth_header(user_id))


def _lunch(language):
    return Plan(actions=[AddAction(kind="expense", amount=250, category="Food")], language=language)


def test_malayalam_message_gets_malayalam_reply_and_ml_in(db):
    user_id = _user(db, "en")
    res = _send(user_id, "ഊണിന് 250 രൂപ ചെലവായി", _lunch("ml"))
    assert res.status_code == 200
    data = res.json()
    assert data["reply_text"] == "ഭക്ഷണം വിഭാഗത്തിൽ ₹250 ചേർത്തു."
    assert data["spoken_text"] == "ഭക്ഷണം വിഭാഗത്തിൽ 250 രൂപ ചേർത്തു."
    assert data["language"] == "ml"
    assert data["language_code"] == "ml-IN"

    # Stored for chat history replay
    stored = db.query(ChatMessage).filter(ChatMessage.user_id == user_id, ChatMessage.role == "assistant").one()
    assert json.loads(stored.payload)["language_code"] == "ml-IN"


def test_detected_english_wins_over_malayalam_profile(db):
    user_id = _user(db, "ml")
    data = _send(user_id, "Spent 250 on lunch", _lunch("en")).json()
    assert data["reply_text"] == "Added ₹250 to Food."
    assert data["language"] == "en"
    assert data["language_code"] == "en-IN"


@pytest.mark.parametrize("profile,expected_code", [("ml", "ml-IN"), ("en", "en-IN")])
def test_missing_detection_falls_back_to_profile(db, profile, expected_code):
    user_id = _user(db, profile)
    data = _send(user_id, "Spent 250 on lunch", _lunch(None)).json()
    assert data["language_code"] == expected_code
    expected = "ഭക്ഷണം വിഭാഗത്തിൽ ₹250 ചേർത്തു." if profile == "ml" else "Added ₹250 to Food."
    assert data["reply_text"] == expected


class _StubLLM:
    def __init__(self, raw: str):
        self.raw = raw
        self.calls = 0

    def _make_request(self, messages):
        self.calls += 1
        return self.raw


def test_invalid_detection_falls_back_to_profile_without_retry(db):
    user_id = _user(db, "ml")
    stub = _StubLLM(json.dumps({
        "ops": [{"op": "add", "kind": "expense", "amount": 250, "category": "Food"}],
        "language": "malayalam",
    }))
    with patch("app.routers.assistant.AssistantPlanner", lambda: AssistantPlanner(llm_client=stub)):
        res = client.post("/assistant/message", json={"text": "ooninu 250"}, headers=_auth_header(user_id))
    data = res.json()
    assert stub.calls == 1  # invalid language did not fail schema validation
    assert data["reply_text"] == "ഭക്ഷണം വിഭാഗത്തിൽ ₹250 ചേർത്തു."
    assert data["language_code"] == "ml-IN"


@pytest.mark.parametrize("profile,expected", [("en", "Added ₹250 to Food."), ("ml", "ഭക്ഷണം വിഭാഗത്തിൽ ₹250 ചേർത്തു.")])
def test_manglish_follows_profile_preference(db, profile, expected):
    user_id = _user(db, profile)
    data = _send(user_id, "ooninu 250 chelavaayi", _lunch("mixed")).json()
    assert data["reply_text"] == expected


def test_manglish_tagged_ml_by_planner_is_sanitized_to_mixed(db):
    user_id = _user(db, "en")
    data = _send(user_id, "ooninu 250 chelavaayi", _lunch("ml")).json()
    assert data["reply_text"] == "Added ₹250 to Food."


def _delete_food_plan(language):
    return Plan(actions=[DeleteAction(selector=Selector(category="Food", amount=250))], language=language)


def test_malayalam_delete_confirm_tap_replies_in_malayalam(db):
    user_id = _user(db, "en")
    txn_id = _food_txn(db, user_id).id

    data = _send(user_id, "ഭക്ഷണം 250 ഒഴിവാക്കൂ", _delete_food_plan("ml")).json()
    assert data["reply_text"] == "ഒക്ടോബർ 14ലെ ഭക്ഷണം ₹250 ഒഴിവാക്കട്ടെ?"
    assert data["spoken_text"] == "ഒക്ടോബർ 14ലെ ഭക്ഷണം 250 രൂപ ഒഴിവാക്കട്ടെ?"
    assert data["language_code"] == "ml-IN"
    pending_id = data["pending"]["id"]

    # Tapping the card has no detected language: the pending question's language wins over the 'en' profile.
    tap = client.post(
        f"/assistant/pending/{pending_id}/answer", json={"answer": "confirm"}, headers=_auth_header(user_id)
    ).json()
    assert tap["reply_text"] == "ഒക്ടോബർ 14ലെ ഭക്ഷണം ₹250 ഒഴിവാക്കി."
    assert tap["language_code"] == "ml-IN"
    assert tap["changed"] is True
    db.expire_all()
    assert db.query(Transaction).filter(Transaction.id == txn_id).first() is None


@pytest.mark.parametrize("word", ["sheri", "athe", "ശരി"])
def test_manglish_confirm_word_executes_pending_delete(db, word):
    user_id = _user(db, "en")
    txn_id = _food_txn(db, user_id).id
    assert _send(user_id, "Delete food 250", _delete_food_plan("en")).json()["pending"]["kind"] == "confirm"

    data = _send(user_id, word).json()
    assert data["reply_text"] == "Deleted Food ₹250 on 14 Oct."
    assert data["changed"] is True
    db.expire_all()
    assert db.query(Transaction).filter(Transaction.id == txn_id).first() is None


@pytest.mark.parametrize("word", ["venda", "illa", "വേണ്ട", "ഇല്ല"])
def test_malayalam_cancel_word_cancels_pending_delete(db, word):
    user_id = _user(db, "en")
    txn_id = _food_txn(db, user_id).id
    _send(user_id, "ഭക്ഷണം 250 ഒഴിവാക്കൂ", _delete_food_plan("ml"))

    data = _send(user_id, word).json()
    assert data["reply_text"] == "റദ്ദാക്കി."
    assert data["language_code"] == "ml-IN"
    assert data["changed"] is False
    db.expire_all()
    assert db.query(Transaction).filter(Transaction.id == txn_id).first() is not None
