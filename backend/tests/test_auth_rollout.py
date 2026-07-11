from __future__ import annotations

from fastapi.testclient import TestClient


def test_auth_off_exposes_limited_development_principal():
    from config.settings import settings
    from main import app

    previous = settings.AUTH_MODE
    settings.AUTH_MODE = "off"
    try:
        response = TestClient(app).get("/api/v1/auth/me")
    finally:
        settings.AUTH_MODE = previous

    assert response.status_code == 200
    payload = response.json()
    permissions = payload["data"]["permissions"]
    assert "graph:search:view" in permissions
    assert "system:monitor:view" not in permissions


def test_auth_enforce_rejects_missing_token_before_database_access():
    from config.settings import settings
    from main import app

    previous = settings.AUTH_MODE
    previous_enabled = settings.AUTH_ENABLED
    settings.AUTH_ENABLED = True
    settings.AUTH_MODE = "enforce"
    try:
        response = TestClient(app).get("/api/v1/admin/users")
    finally:
        settings.AUTH_MODE = previous
        settings.AUTH_ENABLED = previous_enabled

    assert response.status_code == 401
    assert response.json()["code"] == 401
