"""
Tests for Fix 4: Composer and person direction semantics fixes.
- Unsupported bulk delete vs budgets
- Person add wording: 'Added ₹400 you owe Anu.', 'Added ₹400 Anu owes you.', 'Pooja paid you ₹200.'
- Unified delete confirmation question formatting
"""
import uuid
from decimal import Decimal
from datetime import date
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, init_db
from app.assistant.composer import compose_reply
from app.assistant.schemas import PlanV2, ChatAction, AddOp
from app.assistant.executors.add import execute_add
from app.assistant.validation import resolve_category
from app.assistant.pending import format_delete_confirmation_question
from app.models.profile import Profile
from app.models.contact import Contact
from app.models.transaction import Transaction


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


def test_bulk_delete_vs_budget_reply():
    bulk_plan = PlanV2(ops=[ChatAction(op="chat", kind="unsupported_bulk")])
    reply_text, spoken_text = compose_reply(plan=bulk_plan, results=[], language="en")
    assert reply_text == "I can't delete everything at once. Tell me which transaction to delete."
    assert spoken_text == "I can't delete everything at once. Tell me which transaction to delete."

    budget_plan = PlanV2(ops=[ChatAction(op="chat", kind="unsupported")])
    b_reply, b_spoken = compose_reply(plan=budget_plan, results=[], language="en")
    assert b_reply == "Budgets are not available yet."
    assert b_spoken == "Budgets are not available yet."


def test_i_owe_anu_direction_and_wording(db_session):
    user_id = uuid.uuid4()
    prof = Profile(id=user_id, name="Test User", preferred_language="en")
    db_session.add(prof)
    db_session.commit()
    
    # "I owe Anu 400": user received money, owes Anu
    add_op = AddOp(
        op="add",
        kind="person",
        amount=400.0,
        contact="Anu",
        direction="received",
        date="2026-10-14",
    )
    result = execute_add(db=db_session, user_id=user_id, op=add_op, batch_id=uuid.uuid4())
    assert result.ok is True
    
    # Check stored type: direction 'received' maps to 'income'
    txn = db_session.query(Transaction).filter(Transaction.id == uuid.UUID(result.transaction_id)).first()
    assert txn is not None
    assert txn.type == "income"
    assert txn.amount == Decimal("400.00")
    
    # Check composer reply
    plan = PlanV2(ops=[add_op])
    reply_text, spoken_text = compose_reply(plan=plan, results=[result.model_dump()], language="en")
    assert reply_text == "Added ₹400 you owe Anu."
    assert spoken_text == "Added ₹400 you owe Anu."


def test_anu_owes_me_direction_and_wording(db_session):
    user_id = uuid.uuid4()
    prof = Profile(id=user_id, name="Test User", preferred_language="en")
    db_session.add(prof)
    db_session.commit()
    
    # "Anu owes me 400": user sent money, Anu owes user
    add_op = AddOp(
        op="add",
        kind="person",
        amount=400.0,
        contact="Anu",
        direction="sent",
        date="2026-10-14",
        description="lent money",
    )
    result = execute_add(db=db_session, user_id=user_id, op=add_op, batch_id=uuid.uuid4())
    assert result.ok is True
    
    # Check stored type: direction 'sent' maps to 'expense'
    txn = db_session.query(Transaction).filter(Transaction.id == uuid.UUID(result.transaction_id)).first()
    assert txn is not None
    assert txn.type == "expense"
    assert txn.amount == Decimal("400.00")
    
    # Check composer reply
    plan = PlanV2(ops=[add_op])
    reply_text, spoken_text = compose_reply(plan=plan, results=[result.model_dump()], language="en")
    assert reply_text == "Added ₹400 Anu owes you."
    assert spoken_text == "Added ₹400 Anu owes you."


def test_repayment_wording(db_session):
    user_id = uuid.uuid4()
    prof = Profile(id=user_id, name="Test User", preferred_language="en")
    db_session.add(prof)
    contact = Contact(user_id=user_id, name="Pooja")
    db_session.add(contact)
    db_session.commit()

    cat = resolve_category(db_session, "People", default_type="expense")
    
    # User previously lent Pooja 1000 (expense)
    prior_txn = Transaction(
        user_id=user_id,
        contact_id=contact.id,
        category_id=cat.id,
        amount=Decimal("1000.00"),
        type="expense",
        txn_date=date(2026, 10, 1),
    )
    db_session.add(prior_txn)
    db_session.commit()
    
    # Pooja pays user 200 (received)
    repay_op = AddOp(
        op="add",
        kind="person",
        amount=200.0,
        contact="Pooja",
        direction="received",
        date="2026-10-14",
    )
    result = execute_add(db=db_session, user_id=user_id, op=repay_op, batch_id=uuid.uuid4())
    assert result.ok is True
    
    plan = PlanV2(ops=[repay_op])
    reply_text, spoken_text = compose_reply(plan=plan, results=[result.model_dump()], language="en")
    assert reply_text == "Pooja paid you ₹200."
    assert spoken_text == "Pooja paid you ₹200."


def test_unified_delete_confirmation_question():
    # 1. Income row without contact
    income_cand = {
        "amount": 300.0,
        "type": "income",
        "date": "2026-10-14",
    }
    q1 = format_delete_confirmation_question(income_cand)
    assert q1 == "Delete income ₹300 on 14 Oct?"

    # 2. Contact row with Malayalam name
    contact_cand = {
        "amount": 300.0,
        "contact_name": "രാഹുൽ",
        "type": "expense",
        "date": "2026-10-14",
    }
    q2 = format_delete_confirmation_question(contact_cand)
    assert q2 == "Delete രാഹുൽ ₹300 on 14 Oct?"

    # 3. Category row with non-zero decimal
    cat_cand = {
        "amount": 350.50,
        "category_name": "Food",
        "type": "expense",
        "date": "2026-10-05",
    }
    q3 = format_delete_confirmation_question(cat_cand)
    assert q3 == "Delete Food ₹350.50 on 5 Oct?"
