import io
import uuid
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import get_db, init_db
from app.stt.client import SarvamSTTClient, STTError
from app.schemas.stt import STTResponse
from tests.test_auth import create_test_es256_jwt, test_public_key, MockSigningKey

@pytest.fixture
def mock_jwks_client():
    mock = MagicMock()
    mock.get_signing_key_from_jwt.return_value = MockSigningKey(test_public_key)
    with patch("app.auth.jwks_client", mock):
        yield mock

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
        yield session
    finally:
        session.close()
        app.dependency_overrides.pop(get_db, None)

def test_stt_client_init_requires_api_key():
    with pytest.raises(ValueError, match="SARVAM_API_KEY is required"):
        SarvamSTTClient(api_key="")

def test_stt_client_empty_audio_raises_error():
    client = SarvamSTTClient(api_key="test_key")
    with pytest.raises(STTError, match="Audio data cannot be empty"):
        client.transcribe(audio_bytes=b"")

def test_stt_client_successful_english_transcription():
    client = SarvamSTTClient(api_key="test_key")
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "request_id": "req_123",
        "transcript": "I spent 500 on groceries today",
        "language_code": "en-IN",
        "language_probability": 0.95,
    }

    with patch("httpx.Client.post", return_value=mock_response):
        result = client.transcribe(
            audio_bytes=b"dummy_audio_data",
            filename="recording.wav",
            content_type="audio/wav",
            language_code="en-IN",
        )

        assert isinstance(result, STTResponse)
        assert result.transcript == "I spent 500 on groceries today"
        assert result.language_code == "en-IN"
        assert result.request_id == "req_123"

def test_stt_client_successful_malayalam_transcription():
    client = SarvamSTTClient(api_key="test_key")
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "request_id": "req_456",
        "transcript": "ഇന്ന് ചായയ്ക്ക് 50 രൂപ ചിലവായി",
        "language_code": "ml-IN",
        "language_probability": 0.98,
    }

    with patch("httpx.Client.post", return_value=mock_response):
        result = client.transcribe(
            audio_bytes=b"dummy_malayalam_audio",
            filename="recording.m4a",
            content_type="audio/m4a",
            language_code="ml-IN",
        )

        assert isinstance(result, STTResponse)
        assert result.transcript == "ഇന്ന് ചായയ്ക്ക് 50 രൂപ ചിലവായി"
        assert result.language_code == "ml-IN"

def test_stt_endpoint_unauthorized_without_token():
    client = TestClient(app)
    files = {"file": ("test.wav", io.BytesIO(b"audio_bytes"), "audio/wav")}
    response = client.post("/stt/transcribe", files=files)
    assert response.status_code == 401

def test_stt_endpoint_successful_transcription(mock_jwks_client):
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id=user_id)
    client = TestClient(app)

    mock_stt_res = STTResponse(
        transcript="Spent 200 on fuel",
        language_code="en-IN",
        language_probability=0.92,
        request_id="req_789",
    )

    with patch.object(SarvamSTTClient, "transcribe", return_value=mock_stt_res):
        files = {"file": ("test.wav", io.BytesIO(b"valid_audio_bytes"), "audio/wav")}
        data = {"language_code": "en-IN"}
        response = client.post(
            "/stt/transcribe",
            headers={"Authorization": f"Bearer {token}"},
            files=files,
            data=data,
        )

        assert response.status_code == 200
        res_json = response.json()
        assert res_json["transcript"] == "Spent 200 on fuel"
        assert res_json["language_code"] == "en-IN"

def test_stt_transcription_flows_to_intent_and_routing(mock_jwks_client, test_db_session):
    """
    Integration test: A transcribed string from STT flows through the exact
    intent -> routing pipeline built in Phases 3-5 without divergence.
    """
    user_id = str(uuid.uuid4())
    token = create_test_es256_jwt(user_id=user_id)
    client = TestClient(app)

    # 1. Mock STT transcription
    mock_stt_res = STTResponse(
        transcript="I paid 350 for lunch today",
        language_code="en-IN",
    )

    with patch.object(SarvamSTTClient, "transcribe", return_value=mock_stt_res):
        files = {"file": ("speech.wav", io.BytesIO(b"speech_bytes"), "audio/wav")}
        stt_resp = client.post(
            "/stt/transcribe",
            headers={"Authorization": f"Bearer {token}"},
            files=files,
        )
        assert stt_resp.status_code == 200
        transcribed_text = stt_resp.json()["transcript"]
        assert transcribed_text == "I paid 350 for lunch today"

    # 2. Pass transcribed text into intent parser
    intent_payload = {
        "action": "add",
        "language": "en",
        "fields": {"amount": 350, "category": "Food", "date": "2026-08-31"},
        "matched_transactions": [],
        "confidence": "high",
        "requires_confirmation": False,
        "missing_fields": [],
    }

    with patch("app.llm.client.SarvamLLMClient.parse_intent") as mock_parse:
        from app.schemas.intent import parse_and_validate_intent
        import json
        mock_parse.return_value = parse_and_validate_intent(json.dumps(intent_payload))

        parse_resp = client.post(
            "/intent/parse",
            headers={"Authorization": f"Bearer {token}"},
            json={"text": transcribed_text},
        )
        assert parse_resp.status_code == 200
        intent = parse_resp.json()["intent"]
        assert intent["action"] == "add"
        assert intent["fields"]["amount"] == 350

    # 3. Route the intent -> executes immediately in DB
    route_resp = client.post(
        "/intent/route",
        headers={"Authorization": f"Bearer {token}"},
        json={"intent": intent},
    )
    assert route_resp.status_code == 200
    route_data = route_resp.json()
    assert route_data["decision"] == "EXECUTE"
    assert route_data["execution_result"]["status"] == "created"
    assert route_data["execution_result"]["transaction"]["amount"] == 350.0
