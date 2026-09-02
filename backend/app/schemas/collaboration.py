from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class NoteCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    content: str = Field(default="", max_length=100_000)


class NoteUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    content: str | None = Field(default=None, max_length=100_000)


class NoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    book_id: str
    title: str
    content: str
    created_at: datetime
    updated_at: datetime


class ConversationCreateRequest(BaseModel):
    title: str = Field(default="新对话", min_length=1, max_length=500)


class ConversationUpdateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=500)


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    book_id: str
    title: str
    created_at: datetime
    updated_at: datetime


MessageRole = Literal["user", "assistant", "system"]
MessageStatus = Literal["pending", "streaming", "completed", "failed", "cancelled", "partial"]


class MessageCreateRequest(BaseModel):
    role: MessageRole = "user"
    content: str = Field(max_length=20_000)
    client_message_id: str | None = Field(default=None, min_length=1, max_length=128)
    model: str | None = Field(default=None, max_length=100)
    status: MessageStatus = "completed"

    @model_validator(mode="after")
    def validate_client_id(self) -> "MessageCreateRequest":
        if self.client_message_id and self.role != "user":
            raise ValueError("client_message_id 只允许用于用户消息")
        return self


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    role: MessageRole
    content: str
    client_message_id: str | None
    model: str | None
    status: MessageStatus
    created_at: datetime
    updated_at: datetime
