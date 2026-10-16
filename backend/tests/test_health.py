from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_endpoint():
    with patch("app.main.check_db_connection", return_value=True):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "database": "connected"}

def test_health_endpoint_db_failure():
    with patch("app.main.check_db_connection", return_value=False):
        response = client.get("/health")
        assert response.status_code == 500
        assert response.json() == {"detail": "Database connection check failed"}

def test_cors_headers_and_preflight():
    with patch("app.main.check_db_connection", return_value=True):
        # Test CORS headers on simple GET
        response = client.get("/health", headers={"Origin": "http://localhost:8081"})
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") in ["*", "http://localhost:8081"]

        # Test CORS preflight OPTIONS
        options_response = client.options(
            "/summary",
            headers={
                "Origin": "http://localhost:8081",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        assert options_response.status_code == 200
        assert options_response.headers.get("access-control-allow-origin") in ["*", "http://localhost:8081"]
        assert "authorization" in options_response.headers.get("access-control-allow-headers", "").lower()
