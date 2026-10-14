"""
Tests for Fix 3:
1. Unknown contact in list, sum, delete, and balances:
   - Returns "I don't know a contact named Delhi."
   - Does not create or guess contacts.
2. Empty results for list, sum, and delete naming the filters:
   - "No Food expense of ₹600 on 13 Oct."
3. category_breakdown defaults to this month and names the range.
4. category_breakdown all_time names "all time".
"""
import uuid
from decimal import Decimal
from datetime import date
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, init_db
from app.models.profile import Profile
from app.models.contact import Contact
from app.models.transaction import Transaction
from app.assistant.schemas import QueryOp, DeleteOp, Selector, PlanV2
from app.assistant.executors.query import execute_query
from app.assistant.executors.delete import execute_delete
from app.assistant.composer import compose_reply, _compose_resolver_none


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


def test_unknown_contact_replies(db_session):
    user_id = uuid.uuid4()
    prof = Profile(id=user_id, name="Test User", preferred_language="en")
    db_session.add(prof)
    db_session.commit()

    # 1. List query for unknown contact "Delhi"
    q_list = QueryOp(op="query", query_kind="list", selector=Selector(contact="Delhi"))
    res_list = execute_query(db_session, user_id, q_list)
    assert res_list.ok is False
    assert res_list.error == "Unknown contact"
    reply, _ = compose_reply(plan=PlanV2(ops=[q_list]), results=[res_list.model_dump()], language="en")
    assert reply == "I don't know a contact named Delhi."

    # 2. Sum query for unknown contact "Delhi"
    q_sum = QueryOp(op="query", query_kind="sum", selector=Selector(contact="Delhi"))
    res_sum = execute_query(db_session, user_id, q_sum)
    assert res_sum.ok is False
    assert res_sum.error == "Unknown contact"
    reply, _ = compose_reply(plan=PlanV2(ops=[q_sum]), results=[res_sum.model_dump()], language="en")
    assert reply == "I don't know a contact named Delhi."

    # 3. Delete query for unknown contact "Delhi"
    del_op = DeleteOp(op="delete", selector=Selector(contact="Delhi"))
    res_del = execute_delete(db_session, user_id, del_op, batch_id=uuid.uuid4())
    assert res_del.ok is False
    assert res_del.error == "Unknown contact"
    reply, _ = compose_reply(plan=PlanV2(ops=[del_op]), results=[res_del.model_dump()], language="en")
    assert reply == "I don't know a contact named Delhi."

    # 4. Balances query for unknown contact "Delhi"
    q_bal = QueryOp(op="query", query_kind="balances", selector=Selector(contact="Delhi"))
    res_bal = execute_query(db_session, user_id, q_bal)
    assert res_bal.ok is False
    assert res_bal.error == "Unknown contact"
    reply, _ = compose_reply(plan=PlanV2(ops=[q_bal]), results=[res_bal.model_dump()], language="en")
    assert reply == "I don't know a contact named Delhi."


def test_empty_named_filters_list_sum_delete(db_session):
    user_id = uuid.uuid4()
    prof = Profile(id=user_id, name="Test User", preferred_language="en")
    db_session.add(prof)
    db_session.commit()

    # Selector with category Food, amount 600, date 2026-10-13
    sel = Selector(
        category="Food",
        amount=600.0,
        date_from="2026-10-13",
        date_to="2026-10-13",
    )

    # 1. Delete when no match exists
    del_op = DeleteOp(op="delete", selector=sel)
    res_del = execute_delete(db_session, user_id, del_op, batch_id=uuid.uuid4())
    assert res_del.ok is False
    reply, _ = compose_reply(plan=PlanV2(ops=[del_op]), results=[res_del.model_dump()], language="en")
    assert reply == "No Food expense of ₹600 on 13 Oct."

    # 2. List when no match exists
    q_list = QueryOp(op="query", query_kind="list", selector=sel)
    res_list = execute_query(db_session, user_id, q_list)
    assert res_list.ok is True
    reply, _ = compose_reply(plan=PlanV2(ops=[q_list]), results=[res_list.model_dump()], language="en")
    assert reply == "No Food expense of ₹600 on 13 Oct."

    # 3. Sum when no match exists
    q_sum = QueryOp(op="query", query_kind="sum", selector=sel)
    res_sum = execute_query(db_session, user_id, q_sum)
    assert res_sum.ok is True
    reply, _ = compose_reply(plan=PlanV2(ops=[q_sum]), results=[res_sum.model_dump()], language="en")
    assert reply == "No Food expense of ₹600 on 13 Oct."


def test_category_breakdown_default_this_month(db_session):
    user_id = uuid.uuid4()
    prof = Profile(id=user_id, name="Test User", preferred_language="en")
    db_session.add(prof)

    from app.assistant.validation import resolve_category
    cat_food = resolve_category(db_session, "Food")
    cat_shop = resolve_category(db_session, "Shopping")

    # Add transaction in October 2026
    txn1 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        amount=Decimal("450.00"),
        type="expense",
        category_id=cat_food.id,
        txn_date=date(2026, 10, 5),
    )
    # Add transaction in September 2026 (should not be included in this month)
    txn2 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        amount=Decimal("900.00"),
        type="expense",
        category_id=cat_shop.id,
        txn_date=date(2026, 9, 20),
    )
    db_session.add_all([txn1, txn2])
    db_session.commit()

    # Query with no period or selector given, ref_date is 2026-10-14
    q_cat = QueryOp(op="query", query_kind="category_breakdown")
    res_cat = execute_query(db_session, user_id, q_cat, ref_date=date(2026, 10, 14))
    assert res_cat.ok is True

    reply, spoken = compose_reply(plan=PlanV2(ops=[q_cat]), results=[res_cat.model_dump()], language="en")
    assert "from 1 to 31 Oct" in reply
    assert "Food ₹450" in reply
    assert "Shopping" not in reply


def test_category_breakdown_all_time(db_session):
    user_id = uuid.uuid4()
    prof = Profile(id=user_id, name="Test User", preferred_language="en")
    db_session.add(prof)

    from app.assistant.validation import resolve_category
    cat_food = resolve_category(db_session, "Food")
    cat_shop = resolve_category(db_session, "Shopping")

    txn1 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        amount=Decimal("450.00"),
        type="expense",
        category_id=cat_food.id,
        txn_date=date(2026, 10, 5),
    )
    txn2 = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        amount=Decimal("900.00"),
        type="expense",
        category_id=cat_shop.id,
        txn_date=date(2026, 9, 20),
    )
    db_session.add_all([txn1, txn2])
    db_session.commit()

    # Query with selector period="all_time"
    q_all = QueryOp(op="query", query_kind="category_breakdown", selector=Selector(period="all_time"))
    res_all = execute_query(db_session, user_id, q_all, ref_date=date(2026, 10, 14))
    assert res_all.ok is True

    reply, spoken = compose_reply(plan=PlanV2(ops=[q_all]), results=[res_all.model_dump()], language="en")
    assert "all time" in reply
    assert "Shopping ₹900" in reply
    assert "Food ₹450" in reply
