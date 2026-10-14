import uuid
from decimal import Decimal
from datetime import date, datetime, timedelta, timezone
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, init_db
from app.models.transaction import Transaction
from app.models.category import Category
from app.models.profile import Profile
from app.assistant.schemas import Selector
from app.assistant.resolver import resolve


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


def test_list_query_nth_with_recency_latest_treated_as_limit(db_session):
    user_id = uuid.uuid4()
    prof = Profile(id=user_id, name="Test User")
    cat = db_session.query(Category).filter(Category.name == "Food").first()
    db_session.add(prof)
    db_session.commit()

    base_date = date(2026, 10, 14)
    # Seed 25 transactions
    txns = []
    for i in range(25):
        t = Transaction(
            id=uuid.uuid4(),
            user_id=user_id,
            type="expense",
            amount=Decimal(f"{100 + i}.00"),
            category_id=cat.id,
            description=f"Item {i}",
            txn_date=base_date - timedelta(days=i),
            created_at=datetime.now(timezone.utc) - timedelta(minutes=25 - i),
        )
        txns.append(t)
    db_session.add_all(txns)
    db_session.commit()

    # List query with selector nth=5 and recency="latest"
    sel = Selector(nth=5, recency="latest")
    res = resolve(db_session, user_id, selector=sel, for_mutation=False)

    assert res.outcome == "many"
    assert len(res.rows) == 5
    # Must never return empty
    assert len(res.rows) > 0
    assert res.filters_used.get("limit") == 5


def test_recency_ordering_with_backdated_entry(db_session):
    user_id = uuid.uuid4()
    prof = Profile(id=user_id, name="Test User")
    cat = db_session.query(Category).filter(Category.name == "Food").first()
    db_session.add(prof)
    db_session.commit()

    now = datetime.now(timezone.utc)

    # Transaction A: txn_date is today, but created earlier (10 minutes ago)
    txn_a = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=Decimal("150.00"),
        category_id=cat.id,
        description="Lunch today entered earlier",
        txn_date=date(2026, 10, 14),
        created_at=now - timedelta(minutes=10),
    )

    # Transaction B: backdated to last week, but entered just now (1 minute ago)
    txn_b = Transaction(
        id=uuid.uuid4(),
        user_id=user_id,
        type="expense",
        amount=Decimal("350.00"),
        category_id=cat.id,
        description="Backdated dinner entered recently",
        txn_date=date(2026, 10, 7),
        created_at=now - timedelta(minutes=1),
    )

    db_session.add_all([txn_a, txn_b])
    db_session.commit()

    # 1. For list and query results: order by txn_date desc then created_at desc
    res_list = resolve(db_session, user_id, selector=Selector(), for_mutation=False)
    assert len(res_list.rows) == 2
    # txn_a (Oct 14) must come before txn_b (Oct 7)
    assert res_list.rows[0].id == txn_a.id
    assert res_list.rows[1].id == txn_b.id

    # 2. For delete and edit with latest: orders strictly by created_at desc
    res_mutation = resolve(db_session, user_id, selector=Selector(recency="latest"), for_mutation=True)
    assert res_mutation.outcome == "one"
    assert len(res_mutation.rows) == 1
    # txn_b was entered more recently (created_at is later), so it is targeted
    assert res_mutation.rows[0].id == txn_b.id
