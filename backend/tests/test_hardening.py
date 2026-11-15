"""Security hardening: error text, upload and body limits, CORS on unhandled errors."""

import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user_id
from app.main import app
from app.routers.stt import MAX_AUDIO_BYTES
from app.stt.client import STTError
from app.tts.client import TTSError


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user_id] = lambda: uuid.uuid4()
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.pop(get_current_user_id, None)


def _audio(size=64):
    return {"file": ("a.m4a", b"x" * size, "audio/mp4")}


class TestSpeechToText:
    def test_empty_upload_is_a_400_not_a_500(self, client):
        response = client.post("/stt/transcribe", files={"file": ("a.m4a", b"", "audio/mp4")})
        assert response.status_code == 400

    def test_oversized_upload_is_refused_before_calling_sarvam(self, client):
        with patch("app.routers.stt.SarvamSTTClient") as stt:
            response = client.post("/stt/transcribe", files=_audio(MAX_AUDIO_BYTES + 1))
        assert response.status_code == 413
        stt.assert_not_called()

    def test_upstream_error_text_is_not_sent_to_the_client(self, client):
        with patch("app.routers.stt.SarvamSTTClient") as stt:
            stt.return_value.transcribe.side_effect = STTError("STT API request failed: 403 - key sk_live_abc invalid")
            response = client.post("/stt/transcribe", files=_audio())
        assert response.status_code == 502
        assert response.json()["detail"] == "Speech transcription failed"

    def test_unexpected_error_text_is_not_sent_to_the_client(self, client):
        with patch("app.routers.stt.SarvamSTTClient", side_effect=ValueError("SARVAM_API_KEY is required")):
            response = client.post("/stt/transcribe", files=_audio())
        assert response.status_code == 500
        assert "SARVAM" not in response.text


class TestTextToSpeech:
    def test_upstream_error_text_is_not_sent_to_the_client(self, client):
        with patch("app.routers.tts.SarvamTTSClient") as tts:
            tts.return_value.synthesize.side_effect = TTSError("TTS API request failed: 500 - internal trace", status_code=502)
            response = client.post("/tts/synthesize", json={"text": "hello", "target_language_code": "en-IN"})
        assert response.status_code == 502
        assert response.json()["detail"] == "Speech synthesis failed"

    def test_our_own_400_message_is_kept(self, client):
        with patch("app.routers.tts.SarvamTTSClient") as tts:
            tts.return_value.synthesize.side_effect = TTSError("Text cannot be empty for speech synthesis.", status_code=400)
            response = client.post("/tts/synthesize", json={"text": "hello", "target_language_code": "en-IN"})
        assert response.status_code == 400
        assert "empty" in response.json()["detail"]


class TestBodyLimits:
    def test_assistant_message_text_is_capped(self, client):
        response = client.post("/assistant/message", json={"text": "a" * 2001})
        assert response.status_code == 422

    def test_pending_answer_is_capped(self, client):
        response = client.post(f"/assistant/pending/{uuid.uuid4()}/answer", json={"answer": "a" * 501})
        assert response.status_code == 422

    @pytest.mark.parametrize("role", ["system", "tool", ""])
    def test_chat_message_role_must_be_user_or_assistant(self, client, role):
        response = client.post("/chat/message", json={"role": role, "text": "hi"})
        assert response.status_code == 422

    def test_chat_message_text_is_capped(self, client):
        response = client.post("/chat/message", json={"role": "user", "text": "a" * 8001})
        assert response.status_code == 422


class TestAuthAndCors:
    def test_bad_token_reply_carries_no_parser_detail(self):
        response = TestClient(app).get("/profile", headers={"Authorization": "Bearer not.a.jwt"})
        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid token"

    def test_unhandled_error_is_a_plain_500_with_cors_headers(self, client):
        with patch("app.routers.profile.Session", create=True), \
             patch("sqlalchemy.orm.Query.first", side_effect=RuntimeError("relation \"secret_table\" does not exist")):
            response = client.get("/profile", headers={"Origin": "http://localhost:8081"})
        assert response.status_code == 500
        assert response.json() == {"detail": "Internal server error"}
        assert response.headers.get("access-control-allow-origin") == "*"

    def test_cors_does_not_allow_credentials(self, client):
        response = client.options(
            "/profile",
            headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"},
        )
        assert "access-control-allow-credentials" not in response.headers


# ---------------------------------------------------------------------------
# Rate limits, LIKE wildcards, trace retention
# ---------------------------------------------------------------------------

from datetime import datetime, timedelta, timezone  # noqa: E402

from app import rate_limit as rl  # noqa: E402
from app.assistant.resolver import resolve  # noqa: E402
from app.assistant.schemas import Selector  # noqa: E402
from app.models.assistant_trace import AssistantTrace  # noqa: E402
from app.models.transaction import Transaction  # noqa: E402
from app.services.sql_text import escape_like  # noqa: E402
from app.services.tracing import _purge_old_traces  # noqa: E402
from tests.test_assistant_planner_cases import db_with_two_food_rows  # noqa: E402,F401


class TestRateLimit:
    def test_window_allows_the_limit_then_refuses_then_recovers(self):
        user = uuid.uuid4()
        assert [rl._check(user, "tts", 3, t) for t in (0.0, 1.0, 2.0)] == [0.0, 0.0, 0.0]
        assert rl._check(user, "tts", 3, 3.0) == pytest.approx(57.0)
        assert rl._check(user, "tts", 3, 60.5) == 0.0  # the first hit has aged out

    def test_users_and_buckets_are_counted_separately(self):
        a, b = uuid.uuid4(), uuid.uuid4()
        assert rl._check(a, "tts", 1, 0.0) == 0.0
        assert rl._check(a, "tts", 1, 1.0) > 0
        assert rl._check(b, "tts", 1, 1.0) == 0.0
        assert rl._check(a, "stt", 1, 1.0) == 0.0

    def test_route_returns_429_with_retry_after_once_over_the_limit(self, monkeypatch):
        monkeypatch.setitem(rl.RATE_LIMITS, "tts", 2)
        user = uuid.uuid4()
        app.dependency_overrides[get_current_user_id] = lambda: user
        try:
            http = TestClient(app)
            body = {"text": "hello", "target_language_code": "en-IN"}
            with patch("app.routers.tts.SarvamTTSClient") as tts:
                tts.return_value.synthesize.side_effect = TTSError("x", status_code=502)
                codes = [http.post("/tts/synthesize", json=body).status_code for _ in range(3)]
                refused = http.post("/tts/synthesize", json=body)
            assert codes == [502, 502, 429]
            assert refused.status_code == 429
            assert int(refused.headers["retry-after"]) >= 1
            assert tts.return_value.synthesize.call_count == 2  # Sarvam is not called once refused
        finally:
            app.dependency_overrides.pop(get_current_user_id, None)

    def test_limits_can_be_switched_off(self, monkeypatch):
        monkeypatch.setattr(rl, "RATE_LIMITS_ENABLED", False)
        monkeypatch.setitem(rl.RATE_LIMITS, "tts", 1)
        user = uuid.uuid4()
        dependency = rl.rate_limit("tts")
        dependency(user_id=user)
        dependency(user_id=user)  # no error

    @pytest.mark.parametrize("path,bucket", [
        ("/assistant/message", "assistant"), ("/stt/transcribe", "stt"), ("/tts/synthesize", "tts"),
        ("/bills", "bill_read"), ("/bills/{bill_id}/assign", "bill_assign"),
    ])
    def test_every_costly_route_has_a_limit(self, path, bucket):
        route = next(r for r in app.routes if getattr(r, "path", None) == path and "POST" in r.methods)
        names = [d.call.__qualname__ for d in route.dependant.dependencies]
        assert any("rate_limit" in n for n in names), f"{path} has no rate limit"
        assert bucket in rl.RATE_LIMITS


class TestLikeWildcards:
    def test_escape(self):
        assert escape_like("100%_off\\") == "100\\%\\_off\\\\"

    def test_percent_in_search_text_matches_only_itself(self, db_with_two_food_rows):
        session, user_id = db_with_two_food_rows
        rows = session.query(Transaction).filter(Transaction.user_id == user_id).all()
        rows[0].description = "50% off pizza"
        rows[1].description = "tea"
        session.commit()
        assert resolve(session, user_id, Selector(text="%")).outcome == "one"
        assert resolve(session, user_id, Selector(text="_")).outcome == "none"
        assert resolve(session, user_id, Selector(text="pizza")).outcome == "one"


class TestTraceRetention:
    def _trace(self, session, user_id, age_days):
        session.add(AssistantTrace(
            user_id=user_id, message_text="m", input_type="text",
            created_at=datetime.now(timezone.utc) - timedelta(days=age_days),
        ))

    def test_off_by_default_keeps_everything(self, db_with_two_food_rows):
        session, user_id = db_with_two_food_rows
        self._trace(session, user_id, 400)
        session.commit()
        assert _purge_old_traces(session, user_id) == 0
        assert session.query(AssistantTrace).count() == 1

    def test_deletes_only_old_traces_of_that_user(self, db_with_two_food_rows):
        from app.models.profile import Profile
        session, user_id = db_with_two_food_rows
        other = uuid.uuid4()
        session.add(Profile(id=other, name="Other"))
        self._trace(session, user_id, 120)
        self._trace(session, user_id, 5)
        self._trace(session, other, 120)
        session.commit()
        assert _purge_old_traces(session, user_id, retention_days=90) == 1
        left = session.query(AssistantTrace).all()
        assert sorted(str(t.user_id) for t in left) == sorted([str(user_id), str(other)])
