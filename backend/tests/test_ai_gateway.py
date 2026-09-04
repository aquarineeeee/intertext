import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.exceptions import AppError
from app.schemas.ai import AIRunCreate
from app.services.ai_gateway import provider_for
from app.services.encryption import decrypt_secret, encrypt_secret


def test_provider_secret_is_encrypted_and_round_trips() -> None:
    settings = Settings(secret_key="unit-test-secret")
    encrypted = encrypt_secret("sk-test", settings)
    assert encrypted != "sk-test"
    assert decrypt_secret(encrypted, settings) == "sk-test"


def test_provider_secret_never_accepts_empty_value() -> None:
    with pytest.raises(AppError) as error:
        encrypt_secret("", Settings(secret_key="unit-test-secret"))
    assert error.value.code == "secret_empty"


def test_selection_limit_is_enforced() -> None:
    with pytest.raises(ValidationError):
        AIRunCreate(content="question", selection="x" * 501)


def test_openai_requires_key_and_ollama_does_not() -> None:
    with pytest.raises(AppError) as error:
        provider_for("openai", None, None)
    assert error.value.code == "provider_key_missing"
    assert provider_for("ollama", None, None).__class__.__name__ == "OllamaProvider"
