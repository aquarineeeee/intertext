from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 - register all relationships before creating tables
from app.api.deps import get_current_user
from app.api.routes.collaboration import router as collaboration_router
from app.api.routes.library import router
from app.api.routes.reading import router as reading_router
from app.core.exceptions import AppError, app_error_handler
from app.db.base import Base
from app.db.session import get_db
from app.models.ai import AIRun, AIRunTranscriptEntry
from app.models.book import Book
from app.models.collaboration import Conversation, Message, Note
from app.models.document import Annotation, Chapter, Excerpt, ReadingProgress
from app.models.user import User


@pytest.fixture
def library_client() -> TestClient:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    now = datetime(2026, 9, 20, 10, 0, tzinfo=timezone.utc)
    with session_factory() as db:
        db.add_all(
            [
                User(id="user-1", email="reader@example.com", password_hash="hash"),
                User(id="user-2", email="other@example.com", password_hash="hash"),
                Book(id="book-1", user_id="user-1", title="Intertext", author="Author", status="ready", created_at=now),
                Book(id="book-2", user_id="user-2", title="Private", author=None, status="ready", created_at=now),
            ]
        )
        db.flush()
        db.add_all(
            [
                Chapter(id="chapter-1", book_id="book-1", chapter_index=0, title="One", text="alpha", text_length=5),
                Chapter(id="chapter-2", book_id="book-1", chapter_index=1, title="Two", text="beta", text_length=4),
                Chapter(id="private-chapter", book_id="book-2", chapter_index=0, title="Private", text="secret", text_length=6),
            ]
        )
        db.flush()
        db.add(
            ReadingProgress(
                id="progress-1",
                user_id="user-1",
                book_id="book-1",
                last_read_chapter_id="chapter-1",
                furthest_read_chapter_id="chapter-2",
            )
        )
        older = now - timedelta(hours=1)
        db.add_all(
            [
                Annotation(id="annotation-old", user_id="user-1", book_id="book-1", chapter_id="chapter-1", start_offset=0, end_offset=1, selected_text="a", note_content="older note", created_at=older, updated_at=older),
                Annotation(id="annotation-new", user_id="user-1", book_id="book-1", chapter_id="chapter-1", start_offset=1, end_offset=2, selected_text="l", note_content="searchable", created_at=now, updated_at=now),
                Annotation(id="annotation-other-chapter", user_id="user-1", book_id="book-1", chapter_id="chapter-2", start_offset=0, end_offset=1, selected_text="b", note_content=None, created_at=now, updated_at=now),
                Annotation(id="private-annotation", user_id="user-2", book_id="book-2", chapter_id="private-chapter", start_offset=0, end_offset=1, selected_text="s", note_content=None, created_at=now, updated_at=now),
                Excerpt(id="excerpt-1", user_id="user-1", book_id="book-1", chapter_id="chapter-1", start_offset=2, end_offset=3, selected_text="p", created_at=now, updated_at=now),
                Note(id="note-old", user_id="user-1", book_id="book-1", title="Old", content="first", created_at=older, updated_at=older),
                Note(id="note-new", user_id="user-1", book_id="book-1", title="New", content="find me", created_at=older, updated_at=now),
            ]
        )
        db.flush()
        conversation = Conversation(id="conversation-1", user_id="user-1", book_id="book-1", annotation_id="annotation-new", title="Discussion", created_at=now, updated_at=now)
        db.add(conversation)
        db.flush()
        user_message = Message(id="message-user", user_id="user-1", conversation_id=conversation.id, role="user", content="Question", status="completed", created_at=now, updated_at=now)
        assistant_message = Message(id="message-assistant", user_id="user-1", conversation_id=conversation.id, role="assistant", content="Answer", status="completed", created_at=now + timedelta(seconds=1), updated_at=now + timedelta(seconds=1))
        db.add_all([user_message, assistant_message])
        db.flush()
        run = AIRun(id="run-1", user_id="user-1", conversation_id=conversation.id, user_message_id=user_message.id, assistant_message_id=assistant_message.id, status="completed", created_at=now, updated_at=now)
        db.add(run)
        db.flush()
        db.add_all(
            [
                AIRunTranscriptEntry(id="transcript-1", run_id=run.id, sequence=1, entry_type="assistant", payload={"thinking": "Reason"}),
                AIRunTranscriptEntry(id="transcript-2", run_id=run.id, sequence=2, entry_type="tool_call", payload={"tool_name": "search"}),
            ]
        )
        db.commit()

    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.include_router(reading_router, prefix="/api/v1")
    app.include_router(collaboration_router, prefix="/api/v1")
    app.add_exception_handler(AppError, app_error_handler)

    def override_db():
        with session_factory() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id="user-1")
    with TestClient(app) as client:
        yield client
    engine.dispose()


def test_library_summary_and_timelines(library_client: TestClient) -> None:
    books = library_client.get("/api/v1/library/books")
    assert books.status_code == 200
    assert books.json() == [
        {
            "id": "book-1",
            "title": "Intertext",
            "author": "Author",
            "status": "ready",
            "chapter_count": 2,
            "last_read_chapter_id": "chapter-1",
            "furthest_chapter_index": 1,
            "progress_percent": 100,
        }
    ]

    first_page = library_client.get("/api/v1/library/annotations", params={"limit": 1})
    assert first_page.status_code == 200
    assert first_page.json()["items"][0]["id"] in {"annotation-new", "annotation-other-chapter"}
    assert first_page.json()["next_cursor"]
    second_page = library_client.get(
        "/api/v1/library/annotations",
        params={"limit": 1, "cursor": first_page.json()["next_cursor"]},
    )
    assert second_page.status_code == 200
    assert second_page.json()["items"][0]["id"] != first_page.json()["items"][0]["id"]

    searched_annotations = library_client.get("/api/v1/library/annotations", params={"q": "searchable"}).json()
    assert [item["id"] for item in searched_annotations["items"]] == ["annotation-new"]
    assert searched_annotations["items"][0]["first_user_message"] == "Question"
    searched_notes = library_client.get("/api/v1/library/notes", params={"q": "find me"}).json()
    assert [item["id"] for item in searched_notes["items"]] == ["note-new"]
    notes = library_client.get("/api/v1/library/notes").json()
    assert [item["id"] for item in notes["items"]] == ["note-new", "note-old"]
    excerpts = library_client.get("/api/v1/library/excerpts").json()
    assert [(item["id"], item["book_title"], item["chapter_title"]) for item in excerpts["items"]] == [("excerpt-1", "Intertext", "One")]


def test_reading_context_is_chapter_scoped_and_embeds_transcript(library_client: TestClient) -> None:
    response = library_client.get("/api/v1/books/book-1/chapters/chapter-1/reading-context")
    assert response.status_code == 200
    payload = response.json()
    assert {item["id"] for item in payload["annotations"]} == {"annotation-old", "annotation-new"}
    assert [item["id"] for item in payload["excerpts"]] == ["excerpt-1"]
    assert len(payload["discussions"]) == 1
    discussion = payload["discussions"][0]
    assert discussion["annotation_id"] == "annotation-new"
    assert [message["role"] for message in discussion["messages"]] == ["user", "assistant"]
    assert discussion["messages"][0]["transcript"] == []
    assert [entry["entry_type"] for entry in discussion["messages"][1]["transcript"]] == ["assistant", "tool_call"]

    assert library_client.get("/api/v1/books/book-2/chapters/private-chapter/reading-context").status_code == 404
    assert library_client.get("/api/v1/library/annotations", params={"cursor": "not-a-cursor"}).status_code == 400


def test_annotation_messages_are_complete_and_private(library_client: TestClient) -> None:
    annotations = library_client.get("/api/v1/books/book-1/annotations").json()
    current = next(item for item in annotations if item["id"] == "annotation-new")
    assert current["first_user_message"] == "Question"

    response = library_client.get("/api/v1/books/book-1/annotations/annotation-new/messages")
    assert response.status_code == 200
    assert [(message["role"], message["content"]) for message in response.json()] == [
        ("user", "Question"),
        ("assistant", "Answer"),
    ]
    assert library_client.get("/api/v1/books/book-2/annotations/private-annotation/messages").status_code == 404
