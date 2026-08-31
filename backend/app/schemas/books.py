from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ImportFileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file_name: str
    file_format: str
    file_size: int
    file_hash: str
    created_at: datetime


class BookResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    status: str
    parse_error: str | None
    created_at: datetime
    updated_at: datetime
    import_file: ImportFileResponse


class ChapterSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    chapter_index: int
    title: str
    text_length: int


class DocumentChunkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    chunk_index: int
    text: str
    start_offset: int
    end_offset: int


class ChapterResponse(ChapterSummaryResponse):
    text: str
    chunks: list[DocumentChunkResponse]
