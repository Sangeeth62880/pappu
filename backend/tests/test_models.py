import uuid
from datetime import date
from app.models import Profile, Category, Contact, Transaction

def test_profile_model_attributes():
    profile = Profile(
        name="Test Profile",
        preferred_language="en"
    )
    assert profile.__tablename__ == "profiles"
    assert profile.name == "Test Profile"
    assert profile.preferred_language == "en"

def test_category_model_attributes():
    category = Category(
        name="Food",
        type="expense"
    )
    assert category.__tablename__ == "categories"
    assert category.name == "Food"
    assert category.type == "expense"

def test_contact_model_attributes():
    user_id = uuid.uuid4()
    contact = Contact(
        user_id=user_id,
        name="John Doe"
    )
    assert contact.__tablename__ == "contacts"
    assert contact.user_id == user_id
    assert contact.name == "John Doe"

def test_transaction_model_attributes():
    user_id = uuid.uuid4()
    contact_id = uuid.uuid4()
    txn = Transaction(
        user_id=user_id,
        type="expense",
        amount=250.50,
        category_id=1,
        contact_id=contact_id,
        description="Lunch",
        txn_date=date(2026, 8, 30)
    )
    assert txn.__tablename__ == "transactions"
    assert txn.user_id == user_id
    assert txn.type == "expense"
    assert txn.amount == 250.50
    assert txn.category_id == 1
    assert txn.contact_id == contact_id
    assert txn.description == "Lunch"
    assert txn.txn_date == date(2026, 8, 30)

def test_models_columns_and_fks():
    profile_cols = {c.name for c in Profile.__table__.columns}
    assert {"id", "name", "preferred_language", "created_at"}.issubset(profile_cols)

    cat_cols = {c.name for c in Category.__table__.columns}
    assert {"id", "name", "type"}.issubset(cat_cols)

    contact_cols = {c.name for c in Contact.__table__.columns}
    assert {"id", "user_id", "name", "created_at"}.issubset(contact_cols)

    txn_cols = {c.name for c in Transaction.__table__.columns}
    assert {"id", "user_id", "type", "amount", "category_id", "contact_id", "description", "txn_date", "created_at"}.issubset(txn_cols)

    # Check foreign keys
    fks = {fk.target_fullname for fk in Transaction.__table__.foreign_keys}
    assert "profiles.id" in fks
    assert "categories.id" in fks
    assert "contacts.id" in fks

    contact_fks = {fk.target_fullname for fk in Contact.__table__.foreign_keys}
    assert "profiles.id" in contact_fks
