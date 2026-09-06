from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ReadingProgressRequest(BaseModel):
    chapter_id: str = Field(min_length=1, max_length=36)


class ReadingProgressResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    book_id: str
    chapter_id: str | None
    updated_at: datetime


class AnnotationCreateRequest(BaseModel):
    chapter_id: str = Field(min_length=1, max_length=36)
    start_offset: int = Field(ge=0)
    end_offset: int = Field(gt=0)
    selected_text: str = Field(min_length=1)
    note_content: str | None = None
    color: str = Field(default="yellow", min_length=1, max_length=32)


class AnnotationUpdateRequest(BaseModel):
    note_content: str | None = None
    color: str | None = Field(default=None, min_length=1, max_length=32)


class AnnotationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    book_id: str
    chapter_id: str
    start_offset: int
    end_offset: int
    selected_text: str
    note_content: str | None
    color: str
    status: str
    location_error: str | None
    created_at: datetime
    updated_at: datetime


class ExcerptCreateRequest(BaseModel):
    chapter_id: str = Field(min_length=1, max_length=36)
    start_offset: int = Field(ge=0)
    end_offset: int = Field(gt=0)
    selected_text: str = Field(min_length=1)


class ExcerptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    book_id: str
    chapter_id: str
    start_offset: int
    end_offset: int
    selected_text: str
    created_at: datetime
    updated_at: datetime
