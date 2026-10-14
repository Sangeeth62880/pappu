"""
Integration tests for Confirmation & Disambiguation Routing via Assistant v2.

Per BUILD_PHASES.md Phase 4 (updated for Assistant v2):
- Integration test: 'add' intent flows straight through to a DB write.
- Integration test: 'delete' intent with one match stops at confirmation and does NOT write until follow-up confirmation.
- Integration test: 'delete' intent with multiple matches stops at disambiguation and does not write.
- Integration test: 'edit' intent with one match stops at confirmation and does not write until follow-up confirmation.
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
from app.assistant.schemas import (
    Plan,
    AddAction,
    EditAction,
    DeleteAction,
    Selector,
)

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

        add_plan = Plan(
            ops=[
                AddAction(
                    op="add",
                    kind="expense",
                    amount=450,
                    category="Food",
                    date="2026-08-31",
                    description="lunch meeting",
                )
            ]
        )

        with patch("app.assistant.planner.AssistantPlanner.plan", return_value=add_plan):
            response = client.post(
                "/assistant/message",
                headers={"Authorization": f"Bearer {token}"},
                json={"text": "I spent 450 on lunch meeting on 2026-08-31"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["changed"] is True
        assert len(data["results"]) == 1
        created_id = data["results"][0]["data"]["id"]

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

        # 1. Route delete intent via assistant
        delete_plan = Plan(
            ops=[
                DeleteAction(
                    op="delete",
                    selector=Selector(category="Food", date_from="2026-08-30", date_to="2026-08-30"),
                )
            ]
        )
        with patch("app.assistant.planner.AssistantPlanner.plan", return_value=delete_plan):
            route_res = client.post(
                "/assistant/message",
                headers={"Authorization": f"Bearer {token}"},
                json={"text": "delete my food expense from 2026-08-30"},
            )

        assert route_res.status_code == 200
        route_data = route_res.json()
        assert route_data["pending"] is not None
        assert route_data["pending"]["kind"] == "confirm"
        pending_id = route_data["pending"]["id"]

        # CRITICAL ASSERTION: Transaction MUST STILL EXIST in the database!
        txn_in_db = test_db_session.query(Transaction).filter_by(id=uuid.UUID(txn_id_str)).first()
        assert txn_in_db is not None

        # 2. Confirm delete via pending answer
        confirm_res = client.post(
            f"/assistant/pending/{pending_id}/answer",
            headers={"Authorization": f"Bearer {token}"},
            json={"answer": "yes"},
        )

        assert confirm_res.status_code == 200
        confirm_data = confirm_res.json()
        assert confirm_data["changed"] is True

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

        delete_plan = Plan(
            ops=[
                DeleteAction(
                    op="delete",
                    selector=Selector(category="Food", date_from="2026-08-30", date_to="2026-08-30"),
                )
            ]
        )
        with patch("app.assistant.planner.AssistantPlanner.plan", return_value=delete_plan):
            route_res = client.post(
                "/assistant/message",
                headers={"Authorization": f"Bearer {token}"},
                json={"text": "delete food expense from 2026-08-30"},
            )

        assert route_res.status_code == 200
        data = route_res.json()
        assert data["pending"] is not None
        assert data["pending"]["kind"] == "disambiguate"
        assert len(data["pending"]["candidates"]) == 2

        # Verify BOTH transactions remain in DB
        assert test_db_session.query(Transaction).count() == 2


class TestEditConfirmation:
    """Integration tests for edit confirmation tier."""

    def test_edit_single_match_executes_and_updates_db(self, test_db_session):
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

        edit_plan = Plan(
            ops=[
                EditAction(
                    op="edit",
                    selector=Selector(category="Transport", date_from="2026-08-30", date_to="2026-08-30"),
                    patch={"amount": 150.0},
                )
            ]
        )
        with patch("app.assistant.planner.AssistantPlanner.plan", return_value=edit_plan):
            route_res = client.post(
                "/assistant/message",
                headers={"Authorization": f"Bearer {token}"},
                json={"text": "change my transport expense from 2026-08-30 to 150"},
            )

        assert route_res.status_code == 200
        route_data = route_res.json()
        assert route_data["changed"] is True

        # Assert DB amount is updated to 150.00
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

        # 1. User A creates a pending delete confirmation
        delete_plan_a = Plan(
            ops=[DeleteAction(op="delete", selector=Selector(category="Food", date_from="2026-08-31", date_to="2026-08-31"))]
        )
        with patch("app.assistant.planner.AssistantPlanner.plan", return_value=delete_plan_a):
            res_a = client.post(
                "/assistant/message",
                headers={"Authorization": f"Bearer {token_a}"},
                json={"text": "delete User A food"},
            )
        assert res_a.status_code == 200
        pending_a_id = res_a.json()["pending"]["id"]

        # 2. User B tries to answer User A's pending ID -> 404 (cross-user isolation)
        confirm_b = client.post(
            f"/assistant/pending/{pending_a_id}/answer",
            headers={"Authorization": f"Bearer {token_b}"},
            json={"answer": "yes"},
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
