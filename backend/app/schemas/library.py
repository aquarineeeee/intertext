from datetime import datetime

from pydantic import BaseModel


class LibraryBookResponse(BaseModel):
    id: str
    title: str
    author: str | None
    status: str
    chapter_count: int
    last_read_chapter_id: str | None
    furthest_chapter_index: int | None
    progress_percent: int


class LibraryAnnotationResponse(BaseModel):
    id: str
    book_id: str
    book_title: str
    chapter_id: str
    chapter_index: int
    chapter_title: str
    selected_text: str
    note_content: str | None
    created_at: datetime


class LibraryAnnotationPage(BaseModel):
    items: list[LibraryAnnotationResponse]
    next_cursor: str | None


class LibraryExcerptResponse(BaseModel):
    id: str
    book_id: str
    book_title: str
    chapter_id: str
    chapter_index: int
    chapter_title: str
    selected_text: str
    created_at: datetime


class LibraryExcerptPage(BaseModel):
    items: list[LibraryExcerptResponse]
    next_cursor: str | None


class LibraryNoteResponse(BaseModel):
    id: str
    book_id: str
    book_title: str
    title: str
    content: str
    created_at: datetime
    updated_at: datetime


class LibraryNotePage(BaseModel):
    items: list[LibraryNoteResponse]
    next_cursor: str | None


class ReadingContextAnnotationResponse(BaseModel):
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


class ReadingContextExcerptResponse(BaseModel):
    id: str
    book_id: str
    chapter_id: str
    start_offset: int
    end_offset: int
    selected_text: str
    created_at: datetime
    updated_at: datetime


class ReadingContextConversationResponse(BaseModel):
    id: str
    book_id: str
    annotation_id: str | None
    title: str
    created_at: datetime
    updated_at: datetime


class ReadingContextTranscriptEntryResponse(BaseModel):
    entry_type: str
    payload: dict


class ReadingContextMessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    client_message_id: str | None
    model: str | None
    status: str
    created_at: datetime
    updated_at: datetime
    ai_run_id: str | None
    transcript: list[ReadingContextTranscriptEntryResponse]


class ReadingContextDiscussionResponse(BaseModel):
    annotation_id: str
    conversation: ReadingContextConversationResponse
    messages: list[ReadingContextMessageResponse]


class ReadingContextResponse(BaseModel):
    annotations: list[ReadingContextAnnotationResponse]
    excerpts: list[ReadingContextExcerptResponse]
    discussions: list[ReadingContextDiscussionResponse]
