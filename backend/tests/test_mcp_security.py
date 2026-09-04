import pytest

from app.core.config import Settings
from app.core.exceptions import AppError
from app.services.mcp_security import redact_secrets, validate_endpoint


def test_mcp_requires_https_except_development_localhost() -> None:
    assert validate_endpoint("http://localhost:8787/mcp", "development", resolve_dns=False)
    with pytest.raises(AppError) as error:
        validate_endpoint("http://localhost:8787/mcp", "production", resolve_dns=False)
    assert error.value.code == "mcp_endpoint_insecure"


def test_mcp_rejects_private_literal_addresses() -> None:
    with pytest.raises(AppError) as error:
        validate_endpoint("https://10.0.0.4/mcp", "production", resolve_dns=False)
    assert error.value.code == "mcp_endpoint_private"


def test_mcp_arguments_are_redacted_for_logs() -> None:
    value = redact_secrets({"query": "x", "api_key": "secret", "nested": [{"authorization": "Bearer x"}]})
    assert value == {"query": "x", "api_key": "[REDACTED]", "nested": [{"authorization": "[REDACTED]"}]}


def test_mcp_settings_parse_global_allowlist() -> None:
    settings = Settings(mcp_allowed_tools='["memory_search"]')
    assert settings.mcp_allowed_tools == ["memory_search"]
