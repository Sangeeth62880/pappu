"""
Integration tests for Phase 4: Confirmation & Error-Recovery Routing.

Per BUILD_PHASES.md Phase 4:
- Integration test: 'add' intent flows straight through to a DB write.
- Integration test: 'delete' intent with one match stops at ASK_CONFIRMATION and does NOT write until follow-up confirmation.
- Integration test: 'delete' intent with multiple matches stops at ASK_DISAMBIGUATION and does not write.
- Integration test: 'edit' intent with one match stops at ASK_CONFIRMATION and does not write until follow-up confirmation.
- Integration test: 'undo' correctly reverses the most recent transaction only.
- User data isolation test for routing, confirmation, and undo.
"""

import uuid
from decimal import Decimal
from datetime import date, datetime
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db, init_db
from app.models import Category, Transaction, Profile
from app.auth import jwks_client
from tests.test_auth import create_test_es256_jwt, test_public_key, MockSigningKey

client = TestClient(app)


@pytest.fixture
def test_db_session():
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
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    session = TestingSessionLocal()
    try:
        with patch.object(
            jwks_client,
            "get_signing_key_from_jwt",
            return_value=MockSigningKey(test_public_key),
        ):
            yield session
    finally:
        session.close()
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(bind=engine)


class TestAddIntentExecution:
    """Integration tests for immediate execution of 'add' intents."""

    def test_add_intent_straight_db_write(self, test_db_session):
        user_id = str(uuid.uuid4())
        token = create_test_es256_jwt(user_id)

        response = client.post(
            "/intent/route",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "intent": {
                    "action": "add",
                    "language": "en",
                    "fields": {
                        "amount": 450,
                        "category": "Food",
                        "date": "2026-08-31",
                        "description": "lunch meeting"
                    },
                    "matched_transactions": [],
                    "confidence": "high",
                    "requires_confirmation": False,
                    "missing_fields": []
                }
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["decision"] == "EXECUTE"
        assert data["execution_result"]["status"] == "created"
        created_id = data["execution_result"]["transaction"]["id"]

        # Verify record exists in DB
        txn = test_db_session.query(Transaction).filter_by(id=uuid.UUID(created_id)).first()
        assert txn is not None
        assert float(txn.amount) == 450.0
        assert txn.description == "lunch meeting"
        assert str(txn.user_id) == user_id


class TestDeleteConfirmationAndDisambiguation:
    """Integration tests for delete confirmation and disambiguation tiers."""

    def test_delete_single_match_stops_at_confirmation_and_does_not_delete_until_confirmed(self, test_db_session):
        user_id = str(uuid.uuid4())
        token = create_test_es256_jwt(user_id)

        # Seed 1 food transaction
        profile = Profile(id=uuid.UUID(user_id), name="Test User", preferred_language="en")
        test_db_session.add(profile)
        food_cat = test_db_session.query(Category).filter_by(name="Food").first()
        txn = Transaction(
            id=uuid.uuid4(),
            user_id=uuid.UUID(user_id),
            type="expense",
            amount=Decimal("350.00"),
            category_id=food_cat.id,
            description="dinner",
            txn_date=date(2026, 8, 30),
        )
        test_db_session.add(txn)
        test_db_session.commit()
        txn_id_str = str(txn.id)

        # 1. Route delete intent
        route_res = client.post(
            "/intent/route",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "intent": {
                    "action": "delete",
                    "language": "en",
                    "fields": {
                        "category": "Food",
                        "date": "2026-08-30"
                    },
                    "matched_transactions": [],
                    "confidence": "high",
                    "requires_confirmation": False,
                    "missing_fields": []
                }
            }
        )

        assert route_res.status_code == 200
        route_data = route_res.json()
        assert route_data["decision"] == "ASK_CONFIRMATION"
        assert route_data["matched_transactions"] == [txn_id_str]
        assert route_data["target_transaction"]["id"] == txn_id_str

        # CRITICAL ASSERTION: Transaction MUST STILL EXIST in the database!
        txn_in_db = test_db_session.query(Transaction).filter_by(id=uuid.UUID(txn_id_str)).first()
        assert txn_in_db is not None

        # 2. Confirm delete
        confirm_res = client.post(
            "/intent/confirm",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "transaction_id": txn_id_str,
                "action": "delete"
            }
        )

        assert confirm_res.status_code == 200
        confirm_data = confirm_res.json()
        assert confirm_data["status"] == "executed"
        assert confirm_data["action"] == "delete"

        # Verify transaction is now deleted from DB
        test_db_session.expire_all()
        txn_after = test_db_session.query(Transaction).filter_by(id=uuid.UUID(txn_id_str)).first()
        assert txn_after is None

    def test_delete_multiple_matches_stops_at_disambiguation_no_deletion(self, test_db_session):
        user_id = str(uuid.uuid4())
        token = create_test_es256_jwt(user_id)

        # Seed 2 food transactions on same date
        profile = Profile(id=uuid.UUID(user_id), name="Test User", preferred_language="en")
        test_db_session.add(profile)
        food_cat = test_db_session.query(Category).filter_by(name="Food").first()
        t1 = Transaction(
            id=uuid.uuid4(),
            user_id=uuid.UUID(user_id),
            type="expense",
            amount=Decimal("100.00"),
            category_id=food_cat.id,
            description="breakfast",
            txn_date=date(2026, 8, 30),
        )
        t2 = Transaction(
            id=uuid.uuid4(),
            user_id=uuid.UUID(user_id),
            type="expense",
            amount=Decimal("200.00"),
            category_id=food_cat.id,
            description="lunch",
            txn_date=date(2026, 8, 30),
        )
        test_db_session.add_all([t1, t2])
        test_db_session.commit()

        route_res = client.post(
            "/intent/route",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "intent": {
                    "action": "delete",
                    "language": "en",
                    "fields": {
                        "category": "Food",
                        "date": "2026-08-30"
                    },
                    "matched_transactions": [],
                    "confidence": "high",
                    "requires_confirmation": False,
                    "missing_fields": []
                }
            }
        )

        assert route_res.status_code == 200
        data = route_res.json()
        assert data["decision"] == "ASK_DISAMBIGUATION"
        assert len(data["matched_transactions"]) == 2
        assert len(data["candidates"]) == 2

        # Verify BOTH transactions remain in DB
        assert test_db_session.query(Transaction).count() == 2


class TestEditConfirmation:
    """Integration tests for edit confirmation tier."""

    def test_edit_single_match_stops_at_confirmation_and_does_not_modify_until_confirmed(self, test_db_session):
        user_id = str(uuid.uuid4())
        token = create_test_es256_jwt(user_id)

        profile = Profile(id=uuid.UUID(user_id), name="Test User", preferred_language="en")
        test_db_session.add(profile)
        trans_cat = test_db_session.query(Category).filter_by(name="Transport").first()
        txn = Transaction(
            id=uuid.uuid4(),
            user_id=uuid.UUID(user_id),
            type="expense",
            amount=Decimal("100.00"),
            category_id=trans_cat.id,
            description="auto",
            txn_date=date(2026, 8, 30),
        )
        test_db_session.add(txn)
        test_db_session.commit()
        txn_id_str = str(txn.id)

        # Route edit intent
        route_res = client.post(
            "/intent/route",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "intent": {
                    "action": "edit",
                    "language": "en",
                    "fields": {
                        "category": "Transport",
                        "amount": 150,
                        "date": "2026-08-30"
                    },
                    "matched_transactions": [],
                    "confidence": "high",
                    "requires_confirmation": False,
                    "missing_fields": []
                }
            }
        )

        assert route_res.status_code == 200
        assert route_res.json()["decision"] == "ASK_CONFIRMATION"

        # Assert DB amount is still unchanged (100.00)
        txn_in_db = test_db_session.query(Transaction).filter_by(id=uuid.UUID(txn_id_str)).first()
        assert float(txn_in_db.amount) == 100.00

        # Confirm edit
        confirm_res = client.post(
            "/intent/confirm",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "transaction_id": txn_id_str,
                "action": "edit",
                "fields": {
                    "amount": 150
                }
            }
        )

        assert confirm_res.status_code == 200
        test_db_session.expire_all()
        txn_updated = test_db_session.query(Transaction).filter_by(id=uuid.UUID(txn_id_str)).first()
        assert float(txn_updated.amount) == 150.00


class TestUndoTransaction:
    """Integration tests for undoing the last transaction."""

    def test_undo_reverses_most_recent_transaction_only(self, test_db_session):
        user_id = str(uuid.uuid4())
        token = create_test_es256_jwt(user_id)

        profile = Profile(id=uuid.UUID(user_id), name="Test User", preferred_language="en")
        test_db_session.add(profile)
        food_cat = test_db_session.query(Category).filter_by(name="Food").first()

        # Seed older transaction
        t1 = Transaction(
            id=uuid.uuid4(),
            user_id=uuid.UUID(user_id),
            type="expense",
            amount=Decimal("100.00"),
            category_id=food_cat.id,
            description="first",
            txn_date=date(2026, 8, 29),
            created_at=datetime(2026, 8, 29, 10, 0, 0),
        )
        # Seed newer transaction
        t2 = Transaction(
            id=uuid.uuid4(),
            user_id=uuid.UUID(user_id),
            type="expense",
            amount=Decimal("200.00"),
            category_id=food_cat.id,
            description="second",
            txn_date=date(2026, 8, 30),
            created_at=datetime(2026, 8, 30, 10, 0, 0),
        )
        test_db_session.add_all([t1, t2])
        test_db_session.commit()

        t1_id = t1.id
        t2_id = t2.id

        # Execute Undo
        undo_res = client.post(
            "/transactions/undo",
            headers={"Authorization": f"Bearer {token}"}
        )

        assert undo_res.status_code == 200
        undo_data = undo_res.json()
        assert undo_data["status"] == "undone"
        assert undo_data["transaction"]["id"] == str(t2_id)

        # Verify t2 is deleted and t1 still exists
        test_db_session.expire_all()
        assert test_db_session.query(Transaction).filter_by(id=t2_id).first() is None
        assert test_db_session.query(Transaction).filter_by(id=t1_id).first() is not None

    def test_undo_empty_state_returns_404(self, test_db_session):
        user_id = str(uuid.uuid4())
        token = create_test_es256_jwt(user_id)

        undo_res = client.post(
            "/transactions/undo",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert undo_res.status_code == 404


class TestMultiUserIsolation:
    """Per-user data isolation tests for routing, confirmation, and undo."""

    def test_user_cannot_route_delete_confirm_or_undo_other_users_transaction(self, test_db_session):
        user_a_id = str(uuid.uuid4())
        user_b_id = str(uuid.uuid4())
        token_a = create_test_es256_jwt(user_a_id)
        token_b = create_test_es256_jwt(user_b_id)

        # Seed profile and transaction for User A
        test_db_session.add(Profile(id=uuid.UUID(user_a_id), name="User A", preferred_language="en"))
        test_db_session.add(Profile(id=uuid.UUID(user_b_id), name="User B", preferred_language="en"))
        food_cat = test_db_session.query(Category).filter_by(name="Food").first()
        txn_a = Transaction(
            id=uuid.uuid4(),
            user_id=uuid.UUID(user_a_id),
            type="expense",
            amount=Decimal("500.00"),
            category_id=food_cat.id,
            description="User A food",
            txn_date=date(2026, 8, 31),
        )
        test_db_session.add(txn_a)
        test_db_session.commit()
        txn_a_id_str = str(txn_a.id)

        # 1. User B tries to route delete for Food -> should find 0 matches
        route_b = client.post(
            "/intent/route",
            headers={"Authorization": f"Bearer {token_b}"},
            json={
                "intent": {
                    "action": "delete",
                    "language": "en",
                    "fields": {
                        "category": "Food",
                        "date": "2026-08-31"
                    },
                    "matched_transactions": [],
                    "confidence": "high",
                    "requires_confirmation": False,
                    "missing_fields": []
                }
            }
        )
        assert route_b.status_code == 200
        # 0 matches found for user B -> routes to ASK_CLARIFICATION
        assert route_b.json()["decision"] == "ASK_CLARIFICATION"
        assert len(route_b.json()["matched_transactions"]) == 0

        # 2. User B tries to confirm delete on User A's transaction ID -> 404
        confirm_b = client.post(
            "/intent/confirm",
            headers={"Authorization": f"Bearer {token_b}"},
            json={
                "transaction_id": txn_a_id_str,
                "action": "delete"
            }
        )
        assert confirm_b.status_code == 404

        # 3. User B calls undo -> should return 404 (User A's transaction remains untouched)
        undo_b = client.post(
            "/transactions/undo",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        assert undo_b.status_code == 404

        # Assert User A's transaction is still intact
        test_db_session.expire_all()
        assert test_db_session.query(Transaction).filter_by(id=uuid.UUID(txn_a_id_str)).first() is not None
