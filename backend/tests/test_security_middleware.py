from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.middleware import SecurityMiddleware


def _client(settings: Settings) -> TestClient:
    app = FastAPI()
    app.add_middleware(SecurityMiddleware, settings=settings)

    @app.get("/ping")
    def ping() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/write")
    def write() -> dict[str, str]:
        return {"status": "ok"}

    return TestClient(app)


def test_security_headers_and_rate_limit() -> None:
    with _client(Settings(rate_limit_requests=1, rate_limit_window_seconds=60)) as client:
        first = client.get("/ping")
        assert first.status_code == 200
        assert first.headers["content-security-policy"].startswith("default-src")
        second = client.get("/ping")
        assert second.status_code == 429
        assert second.json()["error"]["code"] == "rate_limited"


def test_cookie_unsafe_request_rejects_untrusted_origin() -> None:
    with _client(Settings(allowed_origins=["http://localhost:3000"])) as client:
        client.cookies.set("intertext_session", "signed")
        response = client.post("/write", headers={"Origin": "https://attacker.example"})
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "csrf_failed"
