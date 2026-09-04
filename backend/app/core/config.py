import json
from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Intertext API"
    environment: str = "development"
    database_url: str = "postgresql+psycopg://intertext:change-me@localhost:5432/intertext"
    secret_key: str = "change-me-in-development"
    encryption_key: str | None = None
    session_cookie_name: str = "intertext_session"
    session_ttl_seconds: int = 60 * 60 * 24 * 30
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    allowed_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    storage_backend: str = "local"
    storage_local_dir: str = "storage"
    max_upload_size_bytes: int = 20 * 1024 * 1024
    s3_endpoint_url: str | None = None
    s3_bucket: str | None = None
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_region: str | None = None
    # MCP is deliberately disabled by default until a user configures an allowlist.
    mcp_request_timeout_seconds: float = 10.0
    mcp_max_response_bytes: int = 1_048_576
    mcp_max_concurrent_calls: int = 4
    mcp_max_redirects: int = 3
    mcp_allowed_tools: Annotated[list[str], NoDecode] = []

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, list):
                    return parsed
            except json.JSONDecodeError:
                pass
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("mcp_allowed_tools", mode="before")
    @classmethod
    def parse_mcp_tools(cls, value: object) -> object:
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, list):
                    return parsed
            except json.JSONDecodeError:
                pass
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
