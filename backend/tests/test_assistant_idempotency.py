"""
Idempotency of POST /assistant/message under retries.

Uses a file-backed SQLite DB (one connection per session, real transaction
isolation) so two in-flight requests behave like separate server workers.
"""

import threading
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db, init_db
from app.models.idempotency import AssistantIdempotency
from app.models.profile import Profile
from app.models.transaction import Transaction
from app.assistant import idempotency
from app.assistant.schemas import Plan, AddAction
from app.assistant.planner import AssistantPlanner
from app.auth import jwks_client
from tests.test_auth import create_test_es256_jwt, test_public_key, MockSigningKey

client = TestClient(app, raise_server_exceptions=False)


def _add_plan(amount=500, description="pizza"):
    return Plan(
        actions=[AddAction(op="add", kind="expense", amount=amount, category="Food", description=description)],
        language="en",
    )


@pytest.fixture
def file_db(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'idempotency.db'}",
        connect_args={"check_same_thread": False, "timeout": 10},
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    init_db(bind_engine=engine)
    SessionFactory = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = SessionFactory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with patch.object(jwks_client, "get_signing_key_from_jwt", return_value=MockSigningKey(test_public_key)):
            yield SessionFactory
    finally:
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def _auth(user_id):
    return {"Authorization": f"Bearer {create_test_es256_jwt(user_id=str(user_id))}"}


def _make_user(SessionFactory):
    user_id = uuid.uuid4()
    with SessionFactory() as s:
        s.add(Profile(id=user_id, name="Test User"))
        s.commit()
    return user_id


def _txns(SessionFactory, user_id):
    with SessionFactory() as s:
        return s.query(Transaction).filter(Transaction.user_id == user_id).all()


def _key_row(SessionFactory, user_id, client_msg_id):
    with SessionFactory() as s:
        return (
            s.query(AssistantIdempotency)
            .filter(AssistantIdempotency.user_id == user_id, AssistantIdempotency.client_msg_id == client_msg_id)
            .first()
        )


def _post(user_id, client_msg_id, text="Spent 500 on pizza"):
    return client.post(
        "/assistant/message",
        json={"text": text, "input": "typed", "client_msg_id": client_msg_id},
        headers=_auth(user_id),
    )


def test_concurrent_same_key_creates_exactly_one_transaction(file_db):
    """Request B arrives (same user, same client_msg_id) while A is still in the planner."""
    user_id = _make_user(file_db)
    a_in_planner = threading.Event()
    release_a = threading.Event()
    planner_calls = []

    def slow_first_plan(self, text, ctx, **kwargs):
        planner_calls.append(text)
        if len(planner_calls) == 1:
            a_in_planner.set()
            release_a.wait(timeout=10)
        return _add_plan()

    responses = {}
    with patch.object(AssistantPlanner, "plan", slow_first_plan):
        t = threading.Thread(target=lambda: responses.__setitem__("a", _post(user_id, "race-key")))
        t.start()
        assert a_in_planner.wait(timeout=10)
        responses["b"] = _post(user_id, "race-key")
        release_a.set()
        t.join(timeout=20)

        # Once A is done, the same retry gets A's stored response.
        responses["c"] = _post(user_id, "race-key")

    assert responses["a"].status_code == 200, responses["a"].text
    assert responses["b"].status_code == 409
    assert responses["b"].json()["code"] == "still_processing"
    assert responses["b"].headers["Retry-After"] == "2"
    assert responses["c"].status_code == 200
    assert responses["c"].json() == responses["a"].json()
    assert len(planner_calls) == 1
    assert len(_txns(file_db, user_id)) == 1


def test_sequential_retry_returns_stored_response(file_db):
    user_id = _make_user(file_db)
    with patch.object(AssistantPlanner, "plan", return_value=_add_plan()) as planner:
        first = _post(user_id, "seq-key")
        second = _post(user_id, "seq-key")

    assert first.status_code == 200 and second.status_code == 200
    assert second.json() == first.json()
    assert planner.call_count == 1
    assert len(_txns(file_db, user_id)) == 1
    row = _key_row(file_db, user_id, "seq-key")
    assert row.status == "done"
    assert row.response_json == first.json()


def test_stale_in_progress_is_taken_over(file_db):
    """A reservation left behind by a crashed worker expires and the retry runs."""
    user_id = _make_user(file_db)
    with file_db() as s:
        s.add(AssistantIdempotency(
            user_id=user_id,
            client_msg_id="stale-key",
            status="in_progress",
            reserved_at=datetime.now(timezone.utc) - idempotency.STALE_AFTER - timedelta(seconds=1),
        ))
        s.commit()

    with patch.object(AssistantPlanner, "plan", return_value=_add_plan()):
        res = _post(user_id, "stale-key")

    assert res.status_code == 200, res.text
    assert len(_txns(file_db, user_id)) == 1
    row = _key_row(file_db, user_id, "stale-key")
    assert row.status == "done"
    assert row.response_json == res.json()


def test_fresh_in_progress_is_not_taken_over(file_db):
    user_id = _make_user(file_db)
    with file_db() as s:
        s.add(AssistantIdempotency(
            user_id=user_id,
            client_msg_id="busy-key",
            status="in_progress",
            reserved_at=datetime.now(timezone.utc) - idempotency.STALE_AFTER + timedelta(seconds=30),
        ))
        s.commit()

    with patch.object(AssistantPlanner, "plan", return_value=_add_plan()) as planner:
        res = _post(user_id, "busy-key")

    assert res.status_code == 409
    assert res.json()["code"] == "still_processing"
    assert planner.call_count == 0
    assert _txns(file_db, user_id) == []


def test_stale_takeover_has_a_single_winner(file_db):
    """Two retries racing for the same stale key: only one may take it over."""
    user_id = _make_user(file_db)
    with file_db() as s:
        s.add(AssistantIdempotency(
            user_id=user_id,
            client_msg_id="stale-race",
            status="in_progress",
            reserved_at=datetime.now(timezone.utc) - idempotency.STALE_AFTER - timedelta(seconds=1),
        ))
        s.commit()

    with file_db() as s1, file_db() as s2:
        first = idempotency.reserve(s1, user_id, "stale-race")
        second = idempotency.reserve(s2, user_id, "stale-race")

    assert first.outcome == "reserved"
    assert second.outcome == "in_progress"


def test_same_key_from_two_users_does_not_collide(file_db):
    user_a = _make_user(file_db)
    user_b = _make_user(file_db)

    with patch.object(AssistantPlanner, "plan", return_value=_add_plan(500, "pizza")):
        res_a = _post(user_a, "shared-key", text="Spent 500 on pizza")
    with patch.object(AssistantPlanner, "plan", return_value=_add_plan(700, "biryani")) as planner_b:
        res_b = _post(user_b, "shared-key", text="Spent 700 on biryani")
        retry_b = _post(user_b, "shared-key", text="Spent 700 on biryani")

    assert res_a.status_code == 200 and res_b.status_code == 200
    # B's message was executed for B, not answered from A's cached response.
    assert planner_b.call_count == 1
    assert res_b.json() != res_a.json()
    assert retry_b.json() == res_b.json()
    assert [float(t.amount) for t in _txns(file_db, user_a)] == [500.0]
    assert [float(t.amount) for t in _txns(file_db, user_b)] == [700.0]


def test_crash_mid_request_does_not_block_the_key(file_db):
    user_id = _make_user(file_db)
    calls = []

    def flaky_plan(self, text, ctx, **kwargs):
        calls.append(text)
        if len(calls) == 1:
            raise RuntimeError("Sarvam exploded")
        return _add_plan()

    with patch.object(AssistantPlanner, "plan", flaky_plan):
        crashed = _post(user_id, "crash-key")
        assert crashed.status_code == 500
        # The failed request released its reservation...
        assert _key_row(file_db, user_id, "crash-key") is None
        # ...so the retry runs immediately instead of getting 409.
        retry = _post(user_id, "crash-key")

    assert retry.status_code == 200, retry.text
    assert len(calls) == 2
    assert len(_txns(file_db, user_id)) == 1
    assert _key_row(file_db, user_id, "crash-key").status == "done"
