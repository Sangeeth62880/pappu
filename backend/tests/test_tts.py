"""
Unit and integration tests for Text-to-Speech (TTS) with Sarvam Bulbul v3.
"""

import uuid
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.tts.client import SarvamTTSClient, TTSError, normalize_tts_language_code
from app.schemas.tts import TTSResponse
from app.llm.response_generator import generate_spoken_response
from tests.test_auth import create_test_es256_jwt, test_public_key, MockSigningKey

MOCK_BASE64_AUDIO = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="


@pytest.fixture
def mock_jwks_client():
    mock = MagicMock()
    mock.get_signing_key_from_jwt.return_value = MockSigningKey(test_public_key)
    with patch("app.auth.jwks_client", mock):
        yield mock


class TestSarvamTTSClient:
    """Unit tests for the SarvamTTSClient."""

    def test_normalize_language_code(self):
        assert normalize_tts_language_code("ml") == "ml-IN"
        assert normalize_tts_language_code("malayalam") == "ml-IN"
        assert normalize_tts_language_code("ml-IN") == "ml-IN"
        assert normalize_tts_language_code("en") == "en-IN"
        assert normalize_tts_language_code("english") == "en-IN"
        assert normalize_tts_language_code("mixed") == "en-IN"
        assert normalize_tts_language_code(None) == "en-IN"

    def test_empty_text_raises_error(self):
        tts_client = SarvamTTSClient(api_key="test-key")
        with pytest.raises(TTSError, match="Text cannot be empty"):
            tts_client.synthesize("")

    def test_missing_api_key_raises_error(self):
        with pytest.raises(ValueError, match="SARVAM_API_KEY is required"):
            SarvamTTSClient(api_key="")

    def test_synthesize_success_english(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "audios": [MOCK_BASE64_AUDIO],
            "request_id": "req-tts-123",
        }

        with patch("httpx.Client.post", return_value=mock_response):
            tts_client = SarvamTTSClient(api_key="test-key")
            result = tts_client.synthesize(
                text="Added Food transaction for ₹500.",
                target_language_code="en-IN",
                speaker="kavitha",
            )

            assert isinstance(result, TTSResponse)
            assert result.audio_base64 == MOCK_BASE64_AUDIO
            assert result.language_code == "en-IN"
            assert result.audio_format == "audio/wav"
            assert result.request_id == "req-tts-123"

    def test_synthesize_success_malayalam(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "audios": [MOCK_BASE64_AUDIO],
            "request_id": "req-tts-ml-456",
        }

        with patch("httpx.Client.post", return_value=mock_response):
            tts_client = SarvamTTSClient(api_key="test-key")
            result = tts_client.synthesize(
                text="500 രൂപയുടെ ഭക്ഷണ ചിലവ് ചേർത്തു.",
                target_language_code="ml",
                speaker="kavitha",
            )

            assert isinstance(result, TTSResponse)
            assert result.audio_base64 == MOCK_BASE64_AUDIO
            assert result.language_code == "ml-IN"
            assert result.request_id == "req-tts-ml-456"

    def test_synthesize_api_failure_raises_tts_error(self):
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Sarvam Server Error"
        import httpx
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "500 Server Error", request=MagicMock(), response=mock_response
        )

        with patch("httpx.Client.post", return_value=mock_response):
            tts_client = SarvamTTSClient(api_key="test-key")
            with pytest.raises(TTSError, match="TTS API request failed"):
                tts_client.synthesize("Hello world")


class TestTTSEndpoint:
    """Integration tests for POST /tts/synthesize."""

    def test_synthesize_unauthorized_without_token(self):
        client = TestClient(app)
        response = client.post(
            "/tts/synthesize",
            json={"text": "Hello world", "target_language_code": "en-IN"},
        )
        assert response.status_code == 401

    def test_synthesize_authorized_success(self, mock_jwks_client):
        user_id = str(uuid.uuid4())
        token = create_test_es256_jwt(user_id=user_id)
        client = TestClient(app)

        mock_tts_res = TTSResponse(
            audio_base64=MOCK_BASE64_AUDIO,
            language_code="en-IN",
            audio_format="audio/wav",
            request_id="req-tts-auth-789",
        )

        with patch.object(SarvamTTSClient, "synthesize", return_value=mock_tts_res):
            response = client.post(
                "/tts/synthesize",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "text": "Added Food expense of ₹250.",
                    "target_language_code": "en-IN",
                    "speaker": "kavitha",
                },
            )

            assert response.status_code == 200
            data = response.json()
            assert data["audio_base64"] == MOCK_BASE64_AUDIO
            assert data["language_code"] == "en-IN"
            assert data["audio_format"] == "audio/wav"


class TestResponseGenerator:
    """Tests for bilingual spoken response generation."""

    def test_add_response_english(self):
        res = generate_spoken_response(
            decision="EXECUTE",
            action="add",
            language="en",
            fields={"amount": 500, "category": "Food"},
        )
        assert "500" in res
        assert "Food" in res

    def test_add_response_malayalam(self):
        res = generate_spoken_response(
            decision="EXECUTE",
            action="add",
            language="ml",
            fields={"amount": 500, "category": "Food"},
        )
        assert "500" in res
        assert "ചേർത്തു" in res

    def test_confirmation_response_english(self):
        res = generate_spoken_response(
            decision="ASK_CONFIRMATION",
            action="delete",
            language="en",
            target_transaction={"amount": 350, "category_name": "Food"},
        )
        assert "Are you sure" in res
        assert "350" in res

    def test_confirmation_response_malayalam(self):
        res = generate_spoken_response(
            decision="ASK_CONFIRMATION",
            action="delete",
            language="ml",
            target_transaction={"amount": 350, "category_name": "Food"},
        )
        assert "350" in res
        assert "ഡിലീറ്റ് ചെയ്യണോ" in res

    def test_disambiguation_response_bilingual(self):
        res_en = generate_spoken_response(
            decision="ASK_DISAMBIGUATION",
            action="delete",
            language="en",
            matched_count=3,
        )
        assert "Multiple transactions match" in res_en

        res_ml = generate_spoken_response(
            decision="ASK_DISAMBIGUATION",
            action="delete",
            language="ml",
            matched_count=3,
        )
        assert "3" in res_ml
        assert "ഇടപാടുകൾ" in res_ml
