from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


ProviderType = Literal["openai", "anthropic", "ollama"]


class AIProviderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    provider_type: ProviderType
    model: str = Field(min_length=1, max_length=100)
    base_url: str | None = Field(default=None, max_length=500)
    api_key: str | None = Field(default=None, max_length=500)
    enabled: bool = True


class AIProviderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    model: str | None = Field(default=None, min_length=1, max_length=100)
    base_url: str | None = Field(default=None, max_length=500)
    api_key: str | None = Field(default=None, max_length=500)
    enabled: bool | None = None


class AIProviderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    provider_type: ProviderType
    model: str
    base_url: str | None
    enabled: bool
    has_api_key: bool
    created_at: datetime
    updated_at: datetime


class AIRunCreate(BaseModel):
    content: str = Field(min_length=1, max_length=20_000)
    client_message_id: str | None = Field(default=None, min_length=1, max_length=128)
    provider_id: str | None = None
    model: str | None = Field(default=None, max_length=100)
    chapter_id: str | None = None
    selection: str | None = Field(default=None, max_length=500)


class AIRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    conversation_id: str
    user_message_id: str
    assistant_message_id: str
    provider_id: str | None
    status: Literal["queued", "running", "completed", "failed", "cancelled", "partial"]
    last_sequence: int
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AIRunEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    sequence: int
    event_type: str
    payload: dict
    created_at: datetime


class SearchBookRequest(BaseModel):
    book_id: str
    chapter_id: str | None = None
    query: str = Field(min_length=1, max_length=2_000)
    limit: int = Field(default=6, ge=1, le=6)
