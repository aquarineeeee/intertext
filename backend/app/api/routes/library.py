import base64
import json
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session as DbSession, aliased

from app.api.deps import get_current_user
from app.core.exceptions import AppError
from app.db.session import get_db
from app.models.ai import AIRun, AIRunTranscriptEntry
from app.models.book import Book
from app.models.collaboration import Conversation, Message, Note
from app.models.document import Annotation, Chapter, Excerpt, ReadingProgress
from app.models.user import User
from app.schemas.library import (
    LibraryAnnotationPage,
    LibraryBookResponse,
    LibraryExcerptPage,
    LibraryNotePage,
    ReadingContextResponse,
)

router = APIRouter(tags=["library"])


def _encode_cursor(timestamp: datetime, item_id: str) -> str:
    payload = json.dumps({"timestamp": timestamp.isoformat(), "id": item_id}, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(payload).decode().rstrip("=")


def _decode_cursor(cursor: str) -> tuple[datetime, str]:
    try:
        padding = "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode(cursor + padding))
        timestamp = datetime.fromisoformat(payload["timestamp"])
        item_id = payload["id"]
        if not isinstance(item_id, str) or not item_id:
            raise ValueError
        return timestamp, item_id
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise AppError(400, "invalid_cursor", "分页游标无效") from exc


def _before_cursor(timestamp_column, id_column, cursor: str | None):
    if cursor is None:
        return None
    timestamp, item_id = _decode_cursor(cursor)
    return or_(timestamp_column < timestamp, and_(timestamp_column == timestamp, id_column < item_id))


def _search_pattern(query: str | None) -> str | None:
    if query is None or not query.strip():
        return None
    escaped = query.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@router.get("/library/books", response_model=list[LibraryBookResponse])
def list_library_books(db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    chapter_counts = (
        select(Chapter.book_id.label("book_id"), func.count(Chapter.id).label("chapter_count"))
        .group_by(Chapter.book_id)
        .subquery()
    )
    furthest_chapter = aliased(Chapter)
    rows = db.execute(
        select(
            Book,
            func.coalesce(chapter_counts.c.chapter_count, 0),
            ReadingProgress.last_read_chapter_id,
            furthest_chapter.chapter_index,
        )
        .outerjoin(chapter_counts, chapter_counts.c.book_id == Book.id)
        .outerjoin(
            ReadingProgress,
            and_(ReadingProgress.book_id == Book.id, ReadingProgress.user_id == user.id),
        )
        .outerjoin(furthest_chapter, furthest_chapter.id == ReadingProgress.furthest_read_chapter_id)
        .where(Book.user_id == user.id)
        .order_by(Book.created_at.desc(), Book.id.desc())
    ).all()
    items = []
    for book, chapter_count, last_read_chapter_id, furthest_index in rows:
        count = int(chapter_count)
        completed_chapters = furthest_index + 1 if furthest_index is not None else 0
        progress_percent = min(100, (completed_chapters * 100 + count // 2) // count) if count else 0
        items.append(
            {
                "id": book.id,
                "title": book.title,
                "author": book.author,
                "status": book.status,
                "chapter_count": count,
                "last_read_chapter_id": last_read_chapter_id,
                "furthest_chapter_index": furthest_index,
                "progress_percent": progress_percent,
            }
        )
    return items


@router.get("/library/annotations", response_model=LibraryAnnotationPage)
def list_library_annotations(
    limit: int = Query(default=20, ge=1, le=100),
    book_id: str | None = Query(default=None, max_length=36),
    q: str | None = Query(default=None, max_length=200),
    cursor: str | None = Query(default=None, max_length=1000),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    statement = (
        select(Annotation, Book.title, Chapter.chapter_index, Chapter.title)
        .join(Book, Book.id == Annotation.book_id)
        .join(Chapter, Chapter.id == Annotation.chapter_id)
        .where(Annotation.user_id == user.id, Book.user_id == user.id)
    )
    if book_id is not None:
        statement = statement.where(Annotation.book_id == book_id)
    pattern = _search_pattern(q)
    if pattern is not None:
        statement = statement.where(
            or_(
                Annotation.selected_text.ilike(pattern, escape="\\"),
                Annotation.note_content.ilike(pattern, escape="\\"),
            )
        )
    cursor_filter = _before_cursor(Annotation.created_at, Annotation.id, cursor)
    if cursor_filter is not None:
        statement = statement.where(cursor_filter)
    rows = db.execute(statement.order_by(Annotation.created_at.desc(), Annotation.id.desc()).limit(limit + 1)).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    items = [
        {
            "id": annotation.id,
            "book_id": annotation.book_id,
            "book_title": book_title,
            "chapter_id": annotation.chapter_id,
            "chapter_index": chapter_index,
            "chapter_title": chapter_title,
            "selected_text": annotation.selected_text,
            "note_content": annotation.note_content,
            "created_at": annotation.created_at,
        }
        for annotation, book_title, chapter_index, chapter_title in rows
    ]
    next_cursor = _encode_cursor(rows[-1][0].created_at, rows[-1][0].id) if has_more else None
    return {"items": items, "next_cursor": next_cursor}


@router.get("/library/notes", response_model=LibraryNotePage)
def list_library_notes(
    limit: int = Query(default=10, ge=1, le=100),
    book_id: str | None = Query(default=None, max_length=36),
    q: str | None = Query(default=None, max_length=200),
    cursor: str | None = Query(default=None, max_length=1000),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    statement = (
        select(Note, Book.title)
        .join(Book, Book.id == Note.book_id)
        .where(Note.user_id == user.id, Book.user_id == user.id)
    )
    if book_id is not None:
        statement = statement.where(Note.book_id == book_id)
    pattern = _search_pattern(q)
    if pattern is not None:
        statement = statement.where(or_(Note.title.ilike(pattern, escape="\\"), Note.content.ilike(pattern, escape="\\")))
    cursor_filter = _before_cursor(Note.updated_at, Note.id, cursor)
    if cursor_filter is not None:
        statement = statement.where(cursor_filter)
    rows = db.execute(statement.order_by(Note.updated_at.desc(), Note.id.desc()).limit(limit + 1)).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    items = [
        {
            "id": note.id,
            "book_id": note.book_id,
            "book_title": book_title,
            "title": note.title,
            "content": note.content,
            "created_at": note.created_at,
            "updated_at": note.updated_at,
        }
        for note, book_title in rows
    ]
    next_cursor = _encode_cursor(rows[-1][0].updated_at, rows[-1][0].id) if has_more else None
    return {"items": items, "next_cursor": next_cursor}


@router.get("/library/excerpts", response_model=LibraryExcerptPage)
def list_library_excerpts(
    limit: int = Query(default=20, ge=1, le=100),
    book_id: str | None = Query(default=None, max_length=36),
    q: str | None = Query(default=None, max_length=200),
    cursor: str | None = Query(default=None, max_length=1000),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    statement = (
        select(Excerpt, Book.title, Chapter.chapter_index, Chapter.title)
        .join(Book, Book.id == Excerpt.book_id)
        .join(Chapter, Chapter.id == Excerpt.chapter_id)
        .where(Excerpt.user_id == user.id, Book.user_id == user.id)
    )
    if book_id is not None:
        statement = statement.where(Excerpt.book_id == book_id)
    pattern = _search_pattern(q)
    if pattern is not None:
        statement = statement.where(Excerpt.selected_text.ilike(pattern, escape="\\"))
    cursor_filter = _before_cursor(Excerpt.created_at, Excerpt.id, cursor)
    if cursor_filter is not None:
        statement = statement.where(cursor_filter)
    rows = db.execute(statement.order_by(Excerpt.created_at.desc(), Excerpt.id.desc()).limit(limit + 1)).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    items = [
        {
            "id": excerpt.id,
            "book_id": excerpt.book_id,
            "book_title": book_title,
            "chapter_id": excerpt.chapter_id,
            "chapter_index": chapter_index,
            "chapter_title": chapter_title,
            "selected_text": excerpt.selected_text,
            "created_at": excerpt.created_at,
        }
        for excerpt, book_title, chapter_index, chapter_title in rows
    ]
    next_cursor = _encode_cursor(rows[-1][0].created_at, rows[-1][0].id) if has_more else None
    return {"items": items, "next_cursor": next_cursor}


@router.get("/books/{book_id}/chapters/{chapter_id}/reading-context", response_model=ReadingContextResponse)
def get_reading_context(
    book_id: str,
    chapter_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    chapter_query = (
        select(Chapter)
        .join(Book, Book.id == Chapter.book_id)
        .where(Chapter.book_id == book_id, Book.user_id == user.id)
    )
    chapter_query = chapter_query.where(Chapter.chapter_index == int(chapter_id)) if chapter_id.isdigit() else chapter_query.where(Chapter.id == chapter_id)
    chapter = db.scalar(chapter_query)
    if chapter is None:
        book_exists = db.scalar(select(Book.id).where(Book.id == book_id, Book.user_id == user.id))
        if book_exists is None:
            raise AppError(404, "book_not_found", "书籍不存在")
        raise AppError(404, "chapter_not_found", "章节不存在")

    annotations = list(
        db.scalars(
            select(Annotation)
            .where(Annotation.user_id == user.id, Annotation.book_id == book_id, Annotation.chapter_id == chapter.id)
            .order_by(Annotation.start_offset, Annotation.created_at, Annotation.id)
        ).all()
    )
    excerpts = list(
        db.scalars(
            select(Excerpt)
            .where(Excerpt.user_id == user.id, Excerpt.book_id == book_id, Excerpt.chapter_id == chapter.id)
            .order_by(Excerpt.start_offset, Excerpt.created_at, Excerpt.id)
        ).all()
    )
    annotation_ids = [annotation.id for annotation in annotations]
    conversations = (
        list(
            db.scalars(
                select(Conversation)
                .where(
                    Conversation.user_id == user.id,
                    Conversation.book_id == book_id,
                    Conversation.annotation_id.in_(annotation_ids),
                )
                .order_by(Conversation.created_at, Conversation.id)
            ).all()
        )
        if annotation_ids
        else []
    )
    conversation_ids = [conversation.id for conversation in conversations]
    role_rank = case(
        (Message.role == "user", 0),
        (Message.role == "assistant", 1),
        else_=2,
    )
    messages = (
        list(
            db.scalars(
                select(Message)
                .where(Message.user_id == user.id, Message.conversation_id.in_(conversation_ids))
                .order_by(Message.created_at, role_rank, Message.id)
            ).all()
        )
        if conversation_ids
        else []
    )
    assistant_ids = [message.id for message in messages if message.role == "assistant"]
    runs = (
        list(
            db.scalars(
                select(AIRun)
                .where(AIRun.user_id == user.id, AIRun.assistant_message_id.in_(assistant_ids))
                .order_by(AIRun.created_at, AIRun.id)
            ).all()
        )
        if assistant_ids
        else []
    )
    run_by_message = {run.assistant_message_id: run for run in runs}
    run_ids = [run.id for run in runs]
    transcript_entries = (
        list(
            db.scalars(
                select(AIRunTranscriptEntry)
                .where(AIRunTranscriptEntry.run_id.in_(run_ids))
                .order_by(AIRunTranscriptEntry.run_id, AIRunTranscriptEntry.sequence)
            ).all()
        )
        if run_ids
        else []
    )
    transcript_by_run: dict[str, list[dict]] = {}
    for entry in transcript_entries:
        transcript_by_run.setdefault(entry.run_id, []).append({"entry_type": entry.entry_type, "payload": entry.payload})
    messages_by_conversation: dict[str, list[dict]] = {}
    for message in messages:
        run = run_by_message.get(message.id)
        messages_by_conversation.setdefault(message.conversation_id, []).append(
            {
                "id": message.id,
                "conversation_id": message.conversation_id,
                "role": message.role,
                "content": message.content,
                "client_message_id": message.client_message_id,
                "model": message.model,
                "status": message.status,
                "created_at": message.created_at,
                "updated_at": message.updated_at,
                "ai_run_id": run.id if run else None,
                "transcript": transcript_by_run.get(run.id, []) if run else [],
            }
        )
    discussions = [
        {
            "annotation_id": conversation.annotation_id,
            "conversation": conversation,
            "messages": messages_by_conversation.get(conversation.id, []),
        }
        for conversation in conversations
        if conversation.annotation_id is not None
    ]
    return {"annotations": annotations, "excerpts": excerpts, "discussions": discussions}
