"""
Unit and integration tests for Pappu Assistant v2 deterministic core.

Covers:
1. Semantic checks and validation.
2. Resolver: all selector fields, combinations, latest with Pooja, latest with Food,
   amount only disambiguation, nth, ref last_touched, filters_used on none outcome.
3. Balance service: owes you, you owe, settled, and 'I owe Anu 400' stored as income.
4. Executors: add, edit, delete, query (balances, sum, list, count, biggest, compare), undo.
5. Batch undo with shared batch_id.
6. Last touched helper.
7. Cross user isolation across resolver and all executors.
8. Failure isolation across actions.
"""

import uuid
from decimal import Decimal
from datetime import date, timedelta
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, init_db
from app.models import Profile, Category, Contact, Transaction, UndoAction
from app.schemas.plan_v2 import Selector, AddOp, EditOp, DeleteOp, QueryOp, UndoOp
from app.services.date_utils import get_current_ist_datetime
from app.services.balances import balances, _compute_contact_balance
from app.assistant.validation import (
    validate_amount,
    validate_and_parse_date,
    resolve_category,
    validate_person_contact,
    MAX_AMOUNT_CAP,
)
from app.assistant.resolver import resolve
from app.assistant.last_touched import get_last_touched_id
from app.assistant.executors.add import execute_add
from app.assistant.executors.edit import execute_edit
from app.assistant.executors.delete import execute_delete
from app.assistant.executors.query import execute_query
from app.assistant.executors.undo import execute_undo
from app.assistant.executors.coordinator import execute_ops


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


@pytest.fixture
def seed_users(db_session):
    user_a = uuid.uuid4()
    user_b = uuid.uuid4()

    prof_a = Profile(id=user_a, name="User A", preferred_language="en")
    prof_b = Profile(id=user_b, name="User B", preferred_language="en")
    db_session.add_all([prof_a, prof_b])
    db_session.commit()

    return {"user_a": user_a, "user_b": user_b}


# ==============================================================================
# 1. Semantic Checks Tests
# ==============================================================================

def test_semantic_amount_validation():
    # Valid amount
    amt = validate_amount(150.50)
    assert amt == Decimal("150.50")

    # Amount equal to zero or negative rejected
    with pytest.raises(ValueError, match="Amount must be greater than 0"):
        validate_amount(0)

    with pytest.raises(ValueError, match="Amount must be greater than 0"):
        validate_amount(-50)

    # Exceeding configurable cap rejected
    with pytest.raises(ValueError, match="Amount exceeds maximum allowed limit"):
        validate_amount(MAX_AMOUNT_CAP + Decimal("1.00"))


def test_semantic_date_validation():
    today_ist = get_current_ist_datetime().date()

    # Valid past date
    past_str = (today_ist - timedelta(days=5)).isoformat()
    parsed, needs_conf = validate_and_parse_date(past_str)
    assert parsed == today_ist - timedelta(days=5)
    assert needs_conf is False

    # Today date
    parsed_today, needs_conf_today = validate_and_parse_date(today_ist.isoformat())
    assert parsed_today == today_ist
    assert needs_conf_today is False

    # Future date flagged as needs_confirmation
    future_str = (today_ist + timedelta(days=2)).isoformat()
    parsed_fut, needs_conf_fut = validate_and_parse_date(future_str)
    assert parsed_fut == today_ist + timedelta(days=2)
    assert needs_conf_fut is True

    # Invalid calendar date rejected
    with pytest.raises(ValueError, match="Invalid calendar date"):
        validate_and_parse_date("2026-02-30")

    with pytest.raises(ValueError, match="Invalid calendar date"):
        validate_and_parse_date("not-a-date")


def test_semantic_category_mapping(db_session):
    # Known category maps directly
    cat_food = resolve_category(db_session, "Food")
    assert cat_food.name == "Food"

    # Known category case-insensitive
    cat_transport = resolve_category(db_session, "transport")
    assert cat_transport.name == "Transport"

    # Unknown category maps to Other
    cat_unknown = resolve_category(db_session, "Cryptocurrency")
    assert cat_unknown.name == "Other"

    # Empty category maps to Other
    cat_none = resolve_category(db_session, None)
    assert cat_none.name == "Other"


def test_semantic_person_contact_validation():
    # Valid contact
    res = validate_person_contact("Pooja")
    assert res == "Pooja"

    # Empty or whitespace contact rejected
    with pytest.raises(ValueError, match="Person transaction requires a contact"):
        validate_person_contact(None)

    with pytest.raises(ValueError, match="Person transaction requires a contact"):
        validate_person_contact("   ")


# ==============================================================================
# 2. Balances Service Tests
# ==============================================================================

def test_balances_owes_you_you_owe_and_settled(db_session, seed_users):
    user_id = seed_users["user_a"]
    today_ist = get_current_ist_datetime().date()
    people_cat = db_session.query(Category).filter(Category.name == "People").first()

    # Contact 1: Pooja owes user (User sent 500 expense)
    c_pooja = Contact(id=uuid.uuid4(), user_id=user_id, name="Pooja", aliases=[])
    db_session.add(c_pooja)
    t1 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=Decimal("500.00"),
        category_id=people_cat.id,
        contact_id=c_pooja.id,
        txn_date=today_ist,
    )
    db_session.add(t1)

    # Contact 2: Anu (User owes Anu: User received 300 income)
    c_anu = Contact(id=uuid.uuid4(), user_id=user_id, name="Anu", aliases=[])
    db_session.add(c_anu)
    t2 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="income",
        amount=Decimal("300.00"),
        category_id=people_cat.id,
        contact_id=c_anu.id,
        txn_date=today_ist,
    )
    db_session.add(t2)

    # Contact 3: Rahul (Settled: sent 200 expense, received 200 income)
    c_rahul = Contact(id=uuid.uuid4(), user_id=user_id, name="Rahul", aliases=[])
    db_session.add(c_rahul)
    t3 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=Decimal("200.00"),
        category_id=people_cat.id,
        contact_id=c_rahul.id,
        txn_date=today_ist,
    )
    t4 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="income",
        amount=Decimal("200.00"),
        category_id=people_cat.id,
        contact_id=c_rahul.id,
        txn_date=today_ist,
    )
    db_session.add_all([t3, t4])
    db_session.commit()

    # Calling balances with contact=None returns only nonzero net
    all_balances = balances(db_session, user_id)
    assert len(all_balances) == 2
    names = {b.contact_name: b for b in all_balances}
    assert "Pooja" in names
    assert names["Pooja"].status == "owes_you"
    assert names["Pooja"].net_balance == Decimal("500.00")

    assert "Anu" in names
    assert names["Anu"].status == "you_owe"
    assert names["Anu"].net_balance == Decimal("-300.00")

    # Calling balances with specific contact Rahul returns settled status
    rahul_bal = balances(db_session, user_id, contact="Rahul")
    assert len(rahul_bal) == 1
    assert rahul_bal[0].status == "settled"
    assert rahul_bal[0].net_balance == Decimal("0.00")


def test_balances_i_owe_anu_400_stored_as_income(db_session, seed_users):
    """
    Test requirement:
    'I owe Anu 400' stored as income giving 'you owe Anu'.
    """
    user_id = seed_users["user_a"]
    today_ist = get_current_ist_datetime().date()
    people_cat = db_session.query(Category).filter(Category.name == "People").first()

    anu = Contact(id=uuid.uuid4(), user_id=user_id, name="Anu", aliases=[])
    db_session.add(anu)

    # Stored as income of 400 with Anu
    txn = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="income",
        amount=Decimal("400.00"),
        category_id=people_cat.id,
        contact_id=anu.id,
        txn_date=today_ist,
    )
    db_session.add(txn)
    db_session.commit()

    res = balances(db_session, user_id, contact="Anu")
    assert len(res) == 1
    item = res[0]
    assert item.status == "you_owe"
    assert item.net_balance == Decimal("-400.00")
    assert "You owe Anu ₹400.00" in item.display_text


# ==============================================================================
# 3. Resolver Tests
# ==============================================================================

def test_resolver_all_fields_and_combinations(db_session, seed_users):
    user_id = seed_users["user_a"]
    today_ist = get_current_ist_datetime().date()
    yesterday = today_ist - timedelta(days=1)
    two_days_ago = today_ist - timedelta(days=2)

    cat_food = db_session.query(Category).filter(Category.name == "Food").first()
    cat_trans = db_session.query(Category).filter(Category.name == "Transport").first()
    pooja = Contact(id=uuid.uuid4(), user_id=user_id, name="Pooja", aliases=["pooj"])
    db_session.add(pooja)

    t1 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=Decimal("250.00"),
        category_id=cat_food.id,
        contact_id=pooja.id,
        description="Lunch with Pooja",
        txn_date=today_ist,
    )
    t2 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=Decimal("500.00"),
        category_id=cat_trans.id,
        description="Uber ride",
        txn_date=yesterday,
    )
    t3 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="income",
        amount=Decimal("1000.00"),
        category_id=cat_food.id,
        description="Refund for dinner",
        txn_date=two_days_ago,
    )
    db_session.add_all([t1, t2, t3])
    db_session.commit()

    # Exact amount
    res = resolve(db_session, user_id, Selector(amount=250.0))
    assert res.outcome == "one"
    assert res.rows[0].id == t1.id

    # Amount range
    res = resolve(db_session, user_id, Selector(amount_min=200, amount_max=600))
    assert res.outcome == "many"
    assert len(res.rows) == 2

    # Date range inclusive
    res = resolve(db_session, user_id, Selector(date_from=yesterday.isoformat(), date_to=today_ist.isoformat()))
    assert res.outcome == "many"
    assert len(res.rows) == 2

    # Text search ILIKE
    res = resolve(db_session, user_id, Selector(text="uber"))
    assert res.outcome == "one"
    assert res.rows[0].id == t2.id

    # Contact alias match
    res = resolve(db_session, user_id, Selector(contact="pooj"))
    assert res.outcome == "one"
    assert res.rows[0].id == t1.id

    # Direction match
    res = resolve(db_session, user_id, Selector(direction="received"))
    assert res.outcome == "one"
    assert res.rows[0].id == t3.id

    # Combined filters
    res = resolve(db_session, user_id, Selector(category="Food", amount=250.0, direction="sent"))
    assert res.outcome == "one"
    assert res.rows[0].id == t1.id


def test_resolver_latest_with_contact_pooja(db_session, seed_users):
    user_id = seed_users["user_a"]
    today_ist = get_current_ist_datetime().date()
    yesterday = today_ist - timedelta(days=1)
    cat_people = db_session.query(Category).filter(Category.name == "People").first()

    pooja = Contact(id=uuid.uuid4(), user_id=user_id, name="Pooja", aliases=[])
    db_session.add(pooja)

    t_old = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=Decimal("100.00"),
        category_id=cat_people.id,
        contact_id=pooja.id,
        txn_date=yesterday,
    )
    t_new = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=Decimal("200.00"),
        category_id=cat_people.id,
        contact_id=pooja.id,
        txn_date=today_ist,
    )
    db_session.add_all([t_old, t_new])
    db_session.commit()

    res = resolve(db_session, user_id, Selector(contact="Pooja", recency="latest"))
    assert res.outcome == "one"
    assert res.rows[0].id == t_new.id


def test_resolver_latest_with_category_food(db_session, seed_users):
    user_id = seed_users["user_a"]
    today_ist = get_current_ist_datetime().date()
    cat_food = db_session.query(Category).filter(Category.name == "Food").first()

    t_old = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=Decimal("150.00"),
        category_id=cat_food.id,
        txn_date=today_ist - timedelta(days=3),
    )
    t_new = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=Decimal("300.00"),
        category_id=cat_food.id,
        txn_date=today_ist,
    )
    db_session.add_all([t_old, t_new])
    db_session.commit()

    res = resolve(db_session, user_id, Selector(category="Food", recency="latest"))
    assert res.outcome == "one"
    assert res.rows[0].id == t_new.id


def test_resolver_amount_only_disambiguation(db_session, seed_users):
    user_id = seed_users["user_a"]
    today_ist = get_current_ist_datetime().date()
    cat_food = db_session.query(Category).filter(Category.name == "Food").first()

    t1 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=Decimal("500.00"),
        category_id=cat_food.id,
        txn_date=today_ist,
    )
    t2 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=Decimal("500.00"),
        category_id=cat_food.id,
        txn_date=today_ist - timedelta(days=1),
    )
    db_session.add_all([t1, t2])
    db_session.commit()

    res = resolve(db_session, user_id, Selector(amount=500.0))
    assert res.outcome == "many"
    assert len(res.rows) == 2


def test_resolver_nth_selection(db_session, seed_users):
    user_id = seed_users["user_a"]
    today_ist = get_current_ist_datetime().date()
    cat_food = db_session.query(Category).filter(Category.name == "Food").first()

    # Ordered txn_date desc:
    # index 0: today (300)
    # index 1: yesterday (200)
    # index 2: two days ago (100)
    t_300 = Transaction(id=uuid.uuid4(), user_id=user_id, type="expense", amount=Decimal("300.00"), category_id=cat_food.id, txn_date=today_ist)
    t_200 = Transaction(id=uuid.uuid4(), user_id=user_id, type="expense", amount=Decimal("200.00"), category_id=cat_food.id, txn_date=today_ist - timedelta(days=1))
    t_100 = Transaction(id=uuid.uuid4(), user_id=user_id, type="expense", amount=Decimal("100.00"), category_id=cat_food.id, txn_date=today_ist - timedelta(days=2))
    db_session.add_all([t_300, t_200, t_100])
    db_session.commit()

    # nth=2 selects second most recent (200)
    res = resolve(db_session, user_id, Selector(category="Food", nth=2))
    assert res.outcome == "one"
    assert res.rows[0].id == t_200.id


def test_resolver_none_outcome_returns_filters_used(db_session, seed_users):
    user_id = seed_users["user_a"]
    selector = Selector(contact="NonExistentPerson", amount=99999.0)
    res = resolve(db_session, user_id, selector)
    assert res.outcome == "none"
    assert len(res.rows) == 0
    assert "contact" in res.filters_used
    assert res.filters_used["contact"] == "NonExistentPerson"
    assert res.filters_used["amount"] == 99999.0


def test_resolver_last_touched_ref(db_session, seed_users):
    user_id = seed_users["user_a"]
    today_ist = get_current_ist_datetime().date()
    cat_food = db_session.query(Category).filter(Category.name == "Food").first()

    t = Transaction(id=uuid.uuid4(), user_id=user_id, type="expense", amount=Decimal("50.00"), category_id=cat_food.id, txn_date=today_ist)
    db_session.add(t)
    db_session.commit()

    res = resolve(db_session, user_id, Selector(ref="last_touched"), last_touched_id=t.id)
    assert res.outcome == "one"
    assert res.rows[0].id == t.id


# ==============================================================================
# 4. Executor Tests
# ==============================================================================

def test_executor_add_expense_income_and_person(db_session, seed_users):
    user_id = seed_users["user_a"]
    batch_id = uuid.uuid4()

    # 1. Add Expense
    op_exp = AddOp(kind="expense", amount=120.0, category="Food", description="Shawarma")
    res_exp = execute_add(db_session, user_id, op_exp, batch_id)
    assert res_exp.ok is True
    assert res_exp.action == "add"

    # 2. Add Person (auto contact creation)
    op_person = AddOp(kind="person", amount=450.0, direction="sent", contact="Arun")
    res_person = execute_add(db_session, user_id, op_person, batch_id)
    assert res_person.ok is True
    contact = db_session.query(Contact).filter(Contact.user_id == user_id, Contact.name == "Arun").first()
    assert contact is not None


def test_executor_edit_and_undo_restores_old_values(db_session, seed_users):
    user_id = seed_users["user_a"]
    batch_1 = uuid.uuid4()
    batch_2 = uuid.uuid4()

    # Create transaction
    op_add = AddOp(kind="expense", amount=100.0, category="Food", description="Initial")
    res_add = execute_add(db_session, user_id, op_add, batch_1)
    txn_id = uuid.UUID(res_add.transaction_id)

    # Edit amount to 250
    op_edit = EditOp(selector=Selector(amount=100.0), patch={"amount": 250.0, "description": "Updated"})
    res_edit = execute_edit(db_session, user_id, op_edit, batch_2)
    assert res_edit.ok is True

    # Verify updated
    txn = db_session.query(Transaction).filter(Transaction.id == txn_id).first()
    assert txn.amount == Decimal("250.00")
    assert txn.description == "Updated"

    # Undo edit
    res_undo = execute_undo(db_session, user_id)
    assert res_undo.ok is True

    # Verify restored old values
    db_session.refresh(txn)
    assert txn.amount == Decimal("100.00")
    assert txn.description == "Initial"


def test_executor_undo_of_add_deletes_only_that_row(db_session, seed_users):
    user_id = seed_users["user_a"]
    batch_1 = uuid.uuid4()
    batch_2 = uuid.uuid4()

    # Add transaction 1
    res_1 = execute_add(db_session, user_id, AddOp(kind="expense", amount=100.0, category="Food"), batch_1)
    # Add transaction 2
    res_2 = execute_add(db_session, user_id, AddOp(kind="expense", amount=200.0, category="Transport"), batch_2)

    t1_id = uuid.UUID(res_1.transaction_id)
    t2_id = uuid.UUID(res_2.transaction_id)

    # Undo latest batch (which is transaction 2)
    res_undo = execute_undo(db_session, user_id)
    assert res_undo.ok is True

    # Transaction 2 deleted, Transaction 1 remains
    assert db_session.query(Transaction).filter(Transaction.id == t2_id).first() is None
    assert db_session.query(Transaction).filter(Transaction.id == t1_id).first() is not None


def test_executor_batch_undo_of_two_adds(db_session, seed_users):
    user_id = seed_users["user_a"]
    shared_batch = uuid.uuid4()

    # Execute two adds sharing the same batch_id
    ops = [
        AddOp(kind="expense", amount=50.0, category="Food"),
        AddOp(kind="expense", amount=75.0, category="Bills"),
    ]
    results = execute_ops(db_session, user_id, ops, batch_id=shared_batch)
    assert len(results) == 2
    assert results[0].ok is True and results[1].ok is True

    t1_id = uuid.UUID(results[0].transaction_id)
    t2_id = uuid.UUID(results[1].transaction_id)

    # Undo batch reverts both adds
    res_undo = execute_undo(db_session, user_id)
    assert res_undo.ok is True
    assert res_undo.data["undone_count"] == 2

    assert db_session.query(Transaction).filter(Transaction.id == t1_id).first() is None
    assert db_session.query(Transaction).filter(Transaction.id == t2_id).first() is None


def test_executor_delete_then_undo_recreates_row(db_session, seed_users):
    user_id = seed_users["user_a"]
    batch_add = uuid.uuid4()
    batch_del = uuid.uuid4()

    res_add = execute_add(db_session, user_id, AddOp(kind="expense", amount=350.0, category="Shopping", description="Shoes"), batch_add)
    txn_id = uuid.UUID(res_add.transaction_id)

    # Delete with confirmed=True
    op_del = DeleteOp(selector=Selector(amount=350.0))
    res_del = execute_delete(db_session, user_id, op_del, batch_del, confirmed=True)
    assert res_del.ok is True
    assert res_del.status == "deleted"

    # Transaction is gone
    assert db_session.query(Transaction).filter(Transaction.id == txn_id).first() is None

    # Undo delete recreates transaction with same ID and properties
    res_undo = execute_undo(db_session, user_id)
    assert res_undo.ok is True

    restored = db_session.query(Transaction).filter(Transaction.id == txn_id).first()
    assert restored is not None
    assert restored.amount == Decimal("350.00")
    assert restored.description == "Shoes"


def test_executor_delete_unconfirmed_requires_confirmation(db_session, seed_users):
    user_id = seed_users["user_a"]
    batch_id = uuid.uuid4()

    res_add = execute_add(db_session, user_id, AddOp(kind="expense", amount=40.0, category="Food"), batch_id)
    txn_id = uuid.UUID(res_add.transaction_id)

    # Delete without confirmation
    op_del = DeleteOp(selector=Selector(amount=40.0))
    res_del = execute_delete(db_session, user_id, op_del, batch_id, confirmed=False)
    assert res_del.ok is True
    assert res_del.status == "needs_confirmation"

    # Row is not deleted
    assert db_session.query(Transaction).filter(Transaction.id == txn_id).first() is not None


def test_executor_query_operations_and_compare_math(db_session, seed_users):
    user_id = seed_users["user_a"]
    batch_id = uuid.uuid4()
    today_ist = get_current_ist_datetime().date()

    # Add transactions
    execute_add(db_session, user_id, AddOp(kind="expense", amount=100.0, category="Food", date=today_ist.isoformat()), batch_id)
    execute_add(db_session, user_id, AddOp(kind="expense", amount=500.0, category="Food", date=today_ist.isoformat()), batch_id)
    execute_add(db_session, user_id, AddOp(kind="expense", amount=300.0, category="Food", date=(today_ist - timedelta(days=1)).isoformat()), batch_id)

    # Query sum
    res_sum = execute_query(db_session, user_id, QueryOp(query_kind="sum", selector=Selector(category="Food")))
    assert res_sum.ok is True
    assert res_sum.data["sum"] == 900.0
    assert res_sum.data["count"] == 3

    # Query count
    res_count = execute_query(db_session, user_id, QueryOp(query_kind="count", selector=Selector(category="Food")))
    assert res_count.ok is True
    assert res_count.data["count"] == 3

    # Query biggest
    res_biggest = execute_query(db_session, user_id, QueryOp(query_kind="biggest", selector=Selector(category="Food")))
    assert res_biggest.ok is True
    assert res_biggest.data["biggest"]["amount"] == 500.0

    # Query list
    res_list = execute_query(db_session, user_id, QueryOp(query_kind="list", selector=Selector(category="Food")))
    assert res_list.ok is True
    assert len(res_list.data["transactions"]) == 3

    # Query compare math: Period 1 (today: 600) vs Period 2 (yesterday: 300)
    # delta = 600 - 300 = 300, delta_percentage = (300 / 300) * 100 = 100.0%
    sel_1 = Selector(date_from=today_ist.isoformat(), date_to=today_ist.isoformat())
    sel_2 = Selector(date_from=(today_ist - timedelta(days=1)).isoformat(), date_to=(today_ist - timedelta(days=1)).isoformat())
    res_compare = execute_query(
        db_session,
        user_id,
        QueryOp(query_kind="compare", selector=sel_1, compare_to=sel_2),
    )
    assert res_compare.ok is True
    assert res_compare.data["sum_1"] == 600.0
    assert res_compare.data["sum_2"] == 300.0
    assert res_compare.data["delta"] == 300.0
    assert res_compare.data["delta_percentage"] == 100.0


def test_last_touched_helper(db_session, seed_users):
    user_id = seed_users["user_a"]
    batch_id = uuid.uuid4()

    res_add = execute_add(db_session, user_id, AddOp(kind="expense", amount=99.0, category="Bills"), batch_id)
    t_id = uuid.UUID(res_add.transaction_id)

    last_touched = get_last_touched_id(db_session, user_id)
    assert last_touched == t_id


def test_cross_user_isolation_for_all_executors(db_session, seed_users):
    """
    Test Rule 2:
    Every query filters by the verified JWT user_id. Cross user ids return 404/not found.
    """
    user_a = seed_users["user_a"]
    user_b = seed_users["user_b"]
    batch_a = uuid.uuid4()
    batch_b = uuid.uuid4()

    # User B creates a transaction
    res_b = execute_add(db_session, user_b, AddOp(kind="expense", amount=888.0, category="Food", description="B secret"), batch_b)
    txn_b_id = uuid.UUID(res_b.transaction_id)

    # 1. Resolver isolation: User A cannot resolve User B's transaction
    res_resolve = resolve(db_session, user_a, Selector(amount=888.0))
    assert res_resolve.outcome == "none"
    assert len(res_resolve.rows) == 0

    # 2. Resolver ref last_touched isolation: User A passing User B's txn id gets none
    res_ref = resolve(db_session, user_a, Selector(ref="last_touched"), last_touched_id=txn_b_id)
    assert res_ref.outcome == "none"

    # 3. Edit isolation: User A cannot edit User B's transaction
    res_edit = execute_edit(db_session, user_a, EditOp(selector=Selector(amount=888.0), patch={"amount": 1.0}), batch_a)
    assert res_edit.ok is False
    assert res_edit.error == "Transaction not found"

    # 4. Delete isolation: User A cannot delete User B's transaction
    res_del = execute_delete(db_session, user_a, DeleteOp(selector=Selector(amount=888.0)), batch_a, confirmed=True)
    assert res_del.ok is False
    assert res_del.error == "Transaction not found"

    # 5. Query isolation: User A queries balances or sums, gets 0 rows
    res_query = execute_query(db_session, user_a, QueryOp(query_kind="sum", selector=Selector(amount=888.0)))
    assert res_query.ok is True
    assert res_query.data["sum"] == 0.0
    assert res_query.data["count"] == 0

    # 6. Undo isolation: User A has nothing to undo
    res_undo = execute_undo(db_session, user_a)
    assert res_undo.ok is False
    assert res_undo.error == "Nothing to undo"


def test_failure_isolation_across_actions(db_session, seed_users):
    """
    Test requirement:
    Failures are isolated: return a per action result with ok or error, never abort other actions.
    """
    user_id = seed_users["user_a"]

    # Plan has:
    # 1. Valid Add
    # 2. Invalid Add (amount -500)
    # 3. Valid Add
    ops = [
        AddOp(kind="expense", amount=150.0, category="Food"),
        AddOp(kind="expense", amount=-500.0, category="Transport"),
        AddOp(kind="expense", amount=350.0, category="Shopping"),
    ]

    results = execute_ops(db_session, user_id, ops)
    assert len(results) == 3

    assert results[0].ok is True
    assert results[0].action == "add"

    assert results[1].ok is False
    assert results[1].action == "add"
    assert "Amount must be greater than 0" in results[1].error

    assert results[2].ok is True
    assert results[2].action == "add"

    # Valid adds were persisted in DB
    t1 = db_session.query(Transaction).filter(Transaction.id == uuid.UUID(results[0].transaction_id)).first()
    t3 = db_session.query(Transaction).filter(Transaction.id == uuid.UUID(results[2].transaction_id)).first()
    assert t1 is not None
    assert t3 is not None
