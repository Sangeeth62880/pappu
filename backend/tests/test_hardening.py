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
