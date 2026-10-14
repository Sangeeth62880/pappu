import pytest
import uuid
from decimal import Decimal
import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base
from app.models import Contact, Transaction, Category, Profile
from app.services.contact_matcher import find_similar_contacts
from app.assistant.resolver import resolve
from app.assistant.schemas import Selector


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_contact_matcher_finds_similar_names(db_session):
    user_id = uuid.uuid4()
    prof = Profile(id=user_id, name="Test User")
    c1 = Contact(user_id=user_id, name="Arjun Nair")
    c2 = Contact(user_id=user_id, name="Sangeeth")
    db_session.add_all([prof, c1, c2])
    db_session.commit()

    # Exact match
    exact, similar = find_similar_contacts(db_session, user_id, "Sangeeth")
    assert exact is not None
    assert exact.name == "Sangeeth"

    # Substring match (user says "arjun", existing is "Arjun Nair")
    exact, similar = find_similar_contacts(db_session, user_id, "arjun")
    assert exact is None
    assert len(similar) == 1
    assert similar[0].name == "Arjun Nair"

    # Fuzzy match (user says "Arjunan")
    exact, similar = find_similar_contacts(db_session, user_id, "Arjunan")
    assert exact is None
    assert len(similar) == 1
    assert similar[0].name == "Arjun Nair"


def test_matcher_supports_month_range(db_session):
    user_id = uuid.uuid4()
    prof = Profile(id=user_id, name="Test User")
    cat = Category(name="Food", type="expense")
    db_session.add_all([prof, cat])
    db_session.commit()

    t1 = Transaction(
        user_id=user_id,
        type="expense",
        amount=Decimal("300.00"),
        category_id=cat.id,
        txn_date=datetime.date(2026, 10, 2),
    )
    t2 = Transaction(
        user_id=user_id,
        type="expense",
        amount=Decimal("500.00"),
        category_id=cat.id,
        txn_date=datetime.date(2026, 10, 10),
    )
    db_session.add_all([t1, t2])
    db_session.commit()

    sel = Selector(
        category="Food",
        date_from="2026-10-01",
        date_to="2026-10-31",
    )
    res = resolve(db_session, user_id, selector=sel)
    assert res.outcome == "many"
    assert len(res.rows) == 2
