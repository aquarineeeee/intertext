from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


Transport = Literal["streamable-http", "sse"]


def _tools(value: list[str]) -> list[str]:
    if len(value) > 100:
        raise ValueError("allowlist 最多包含 100 个工具")
    if any(not item or len(item) > 255 for item in value):
        raise ValueError("工具名无效")
    return list(dict.fromkeys(value))


class MCPServerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    endpoint: str = Field(min_length=1, max_length=1000)
    transport: Transport = "streamable-http"
    token: str | None = Field(default=None, max_length=2000)
    tool_allowlist: list[str] = Field(default_factory=list)
    enabled: bool = True

    _validate_tools = field_validator("tool_allowlist")(_tools)


class MCPServerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    endpoint: str | None = Field(default=None, max_length=1000)
    transport: Transport | None = None
    token: str | None = Field(default=None, max_length=2000)
    tool_allowlist: list[str] | None = None
    enabled: bool | None = None

    _validate_tools = field_validator("tool_allowlist")(_tools)


class MCPServerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    endpoint: str
    transport: Transport
    has_token: bool
    tool_allowlist: list[str]
    capabilities: dict | None
    enabled: bool
    created_at: datetime
    updated_at: datetime


class MCPToolResponse(BaseModel):
    name: str
    description: str | None = None
    input_schema: dict = Field(default_factory=dict, alias="inputSchema")

    model_config = ConfigDict(populate_by_name=True)


class MCPCallRequest(BaseModel):
    tool_name: str = Field(min_length=1, max_length=255)
    arguments: dict = Field(default_factory=dict)


class MCPCallResponse(BaseModel):
    status: str
    tool_name: str
    result: object | None = None
    log_id: str
