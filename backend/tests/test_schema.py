import uuid
from datetime import date
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError

from app.database import Base, init_db
from app.models import User, Category, Transaction
from app.services.category_seed import SEED_CATEGORIES, seed_categories


@pytest.fixture
def test_db():
    """
    Creates a fresh, isolated in-memory test database with foreign keys enabled.
    """
    engine = create_engine("sqlite:///:memory:")

    # SQLite needs foreign key constraint enforcement turned on explicitly
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    # Run migration / table creation & seeding
    init_db(bind_engine=engine)

    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def test_migration_runs_cleanly(test_db):
    """
    Test: migration runs cleanly on a fresh test DB.
    """
    # Verify tables exist in metadata and can be queried
    users = test_db.query(User).all()
    assert users == []

    transactions = test_db.query(Transaction).all()
    assert transactions == []


def test_seeded_categories_match_fixed_list_exactly(test_db):
    """
    Test: seeded categories match the fixed list exactly (no extras, no missing).
    """
    categories = test_db.query(Category).all()
    assert len(categories) == len(SEED_CATEGORIES)
    assert len(categories) == 7

    expected_names = {"Food", "Transport", "Shopping", "Bills", "Entertainment", "Salary", "Other"}
    db_names = {cat.name for cat in categories}
    assert db_names == expected_names

    # Check types
    for cat in categories:
        if cat.name == "Salary":
            assert cat.type == "income"
        else:
            assert cat.type == "expense"

    # Running seed_categories again should be idempotent (no duplicates added)
    seed_categories(test_db)
    categories_after = test_db.query(Category).all()
    assert len(categories_after) == 7


def test_transaction_foreign_key_invalid_category_fails(test_db):
    """
    Test: creating a transaction with an invalid category_id fails (FK constraint).
    """
    user = User(
        name="Valid User",
        email="user_fk_test1@example.com",
        password_hash="hashed_pw"
    )
    test_db.add(user)
    test_db.commit()

    invalid_txn = Transaction(
        user_id=user.id,
        type="expense",
        amount=100.00,
        category_id=9999,  # Non-existent category
        txn_date=date.today()
    )
    test_db.add(invalid_txn)

    with pytest.raises(IntegrityError):
        test_db.commit()
    test_db.rollback()


def test_transaction_foreign_key_invalid_user_fails(test_db):
    """
    Test: creating a transaction with an invalid user_id fails (FK constraint).
    """
    food_cat = test_db.query(Category).filter_by(name="Food").first()
    assert food_cat is not None

    invalid_txn = Transaction(
        user_id=uuid.uuid4(),  # Non-existent user
        type="expense",
        amount=150.00,
        category_id=food_cat.id,
        txn_date=date.today()
    )
    test_db.add(invalid_txn)

    with pytest.raises(IntegrityError):
        test_db.commit()
    test_db.rollback()


def test_valid_transaction_creation_and_cascade_delete(test_db):
    """
    Test: creating a valid transaction succeeds and deleting the user cascades.
    """
    food_cat = test_db.query(Category).filter_by(name="Food").first()
    user = User(
        name="Cascade User",
        email="cascade_test@example.com",
        password_hash="hashed_pw"
    )
    test_db.add(user)
    test_db.commit()

    valid_txn = Transaction(
        user_id=user.id,
        type="expense",
        amount=75.50,
        category_id=food_cat.id,
        description="Coffee and snacks",
        txn_date=date.today()
    )
    test_db.add(valid_txn)
    test_db.commit()

    # Verify transaction saved
    saved_txn = test_db.query(Transaction).filter_by(id=valid_txn.id).first()
    assert saved_txn is not None
    assert saved_txn.amount == 75.50
    assert saved_txn.user.id == user.id
    assert saved_txn.category.name == "Food"

    # Delete user and verify cascade delete of transaction
    test_db.delete(user)
    test_db.commit()

    txns_after = test_db.query(Transaction).filter_by(id=valid_txn.id).all()
    assert len(txns_after) == 0
