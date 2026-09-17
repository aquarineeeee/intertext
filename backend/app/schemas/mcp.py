from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


Transport = Literal["streamable-http", "sse"]


class MCPServerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    endpoint: str = Field(min_length=1, max_length=1000)
    transport: Transport = "streamable-http"
    token: str | None = Field(default=None, max_length=2000)
    enabled: bool = True


class MCPServerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    endpoint: str | None = Field(default=None, max_length=1000)
    transport: Transport | None = None
    token: str | None = Field(default=None, max_length=2000)
    enabled: bool | None = None


class MCPServerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    endpoint: str
    transport: Transport
    has_token: bool
    capabilities: dict | None
    enabled: bool
    created_at: datetime
    updated_at: datetime


class MCPToolResponse(BaseModel):
    name: str
    description: str | None = None
    input_schema: dict = Field(default_factory=dict, alias="inputSchema")
    enabled: bool = True

    model_config = ConfigDict(populate_by_name=True)


class MCPToolUpdate(BaseModel):
    enabled: bool


class MCPCallRequest(BaseModel):
    tool_name: str = Field(min_length=1, max_length=255)
    arguments: dict = Field(default_factory=dict)


class MCPCallResponse(BaseModel):
    status: str
    tool_name: str
    result: object | None = None
    log_id: str
