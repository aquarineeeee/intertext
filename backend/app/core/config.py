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
    session_cookie_name: str = "intertext_session"
    session_ttl_seconds: int = 60 * 60 * 24 * 30
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    allowed_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
