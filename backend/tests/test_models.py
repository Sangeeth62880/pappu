import uuid
from datetime import date
from app.models import User, Category, Transaction

def test_user_model_attributes():
    user = User(
        name="Test User",
        email="test@example.com",
        password_hash="hashed_pw",
        preferred_language="en"
    )
    assert user.__tablename__ == "users"
    assert user.name == "Test User"
    assert user.email == "test@example.com"
    assert user.password_hash == "hashed_pw"
    assert user.preferred_language == "en"

def test_category_model_attributes():
    category = Category(
        name="Food",
        type="expense"
    )
    assert category.__tablename__ == "categories"
    assert category.name == "Food"
    assert category.type == "expense"

def test_transaction_model_attributes():
    user_id = uuid.uuid4()
    txn = Transaction(
        user_id=user_id,
        type="expense",
        amount=250.50,
        category_id=1,
        description="Lunch",
        txn_date=date(2026, 8, 30)
    )
    assert txn.__tablename__ == "transactions"
    assert txn.user_id == user_id
    assert txn.type == "expense"
    assert txn.amount == 250.50
    assert txn.category_id == 1
    assert txn.description == "Lunch"
    assert txn.txn_date == date(2026, 8, 30)

def test_models_columns_and_fks():
    user_cols = {c.name for c in User.__table__.columns}
    assert {"id", "name", "email", "password_hash", "preferred_language", "created_at"}.issubset(user_cols)

    cat_cols = {c.name for c in Category.__table__.columns}
    assert {"id", "name", "type"}.issubset(cat_cols)

    txn_cols = {c.name for c in Transaction.__table__.columns}
    assert {"id", "user_id", "type", "amount", "category_id", "description", "txn_date", "created_at"}.issubset(txn_cols)

    # Check foreign keys
    fks = {fk.target_fullname for fk in Transaction.__table__.foreign_keys}
    assert "users.id" in fks
    assert "categories.id" in fks
