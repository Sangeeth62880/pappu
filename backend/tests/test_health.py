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
