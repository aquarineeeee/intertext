import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.session import get_db
from app.main import create_app


TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="set TEST_DATABASE_URL to a dedicated PostgreSQL test database")


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    assert TEST_DATABASE_URL
    engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_db() -> Generator[DbSession, None, None]:
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app = create_app()
    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    Base.metadata.drop_all(engine)
    engine.dispose()


def test_register_me_logout(client: TestClient) -> None:
    response = client.post("/api/v1/auth/register", json={"email": "reader@example.com", "password": "password-123", "display_name": "Reader"})
    assert response.status_code == 201
    assert response.json()["user"]["email"] == "reader@example.com"
    assert "intertext_session=" in response.headers["set-cookie"]

    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["display_name"] == "Reader"

    logout = client.post("/api/v1/auth/logout")
    assert logout.status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401


def test_duplicate_registration_and_invalid_login(client: TestClient) -> None:
    payload = {"email": "reader@example.com", "password": "password-123"}
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    duplicate = client.post("/api/v1/auth/register", json=payload)
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "user_already_exists"

    client.post("/api/v1/auth/logout")
    invalid = client.post("/api/v1/auth/login", json={"email": payload["email"], "password": "wrong-password"})
    assert invalid.status_code == 401
    assert invalid.json()["error"]["code"] == "invalid_credentials"


def test_validation_error_is_uniform(client: TestClient) -> None:
    response = client.post("/api/v1/auth/register", json={"email": "not-an-email", "password": "short"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
