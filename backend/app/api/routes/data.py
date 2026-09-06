from __future__ import annotations

import base64
import binascii
import json
import tempfile
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.db.session import get_db
from app.models.ai import AIProvider
from app.models.book import Book, ImportFile
from app.models.collaboration import Conversation, Message, Note
from app.models.document import Annotation, Chapter, DocumentChunk, Excerpt, ReadingProgress
from app.models.mcp import MCPServer
from app.models.user import User
from app.services.mcp_security import validate_endpoint
from app.storage import get_storage

router = APIRouter(tags=["data portability"])


def _json_value(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _row(item, fields: tuple[str, ...]) -> dict:
    return {field: _json_value(getattr(item, field)) for field in fields}


def _export_user(db: DbSession, user: User) -> dict:
    books = list(db.scalars(select(Book).where(Book.user_id == user.id).order_by(Book.created_at, Book.id)).all())
    storage = get_storage(get_settings())
    book_rows: list[dict] = []
    for book in books:
        imports = []
        for imported in book.import_files:
            file_content = None
            try:
                with storage.open_file(imported.storage_key) as source:
                    file_content = base64.b64encode(source.read()).decode("ascii")
            except Exception:
                # Metadata remains exportable even if an orphaned storage object is missing.
                file_content = None
            imports.append({**_row(imported, ("id", "file_name", "file_format", "file_size", "file_hash", "storage_key", "created_at")), "content_base64": file_content})
        chapters = list(db.scalars(select(Chapter).where(Chapter.book_id == book.id).order_by(Chapter.chapter_index)).all())
        chapter_rows = []
        for chapter in chapters:
            chapter_rows.append({
                **_row(chapter, ("id", "chapter_index", "title", "text", "text_length", "created_at")),
                "chunks": [_row(chunk, ("id", "chunk_index", "text", "start_offset", "end_offset")) for chunk in chapter.chunks],
            })
        progress = db.scalar(select(ReadingProgress).where(ReadingProgress.book_id == book.id, ReadingProgress.user_id == user.id))
        annotations = list(db.scalars(select(Annotation).where(Annotation.book_id == book.id, Annotation.user_id == user.id)).all())
        excerpts = list(db.scalars(select(Excerpt).where(Excerpt.book_id == book.id, Excerpt.user_id == user.id)).all())
        notes = list(db.scalars(select(Note).where(Note.book_id == book.id, Note.user_id == user.id)).all())
        conversations = list(db.scalars(select(Conversation).where(Conversation.book_id == book.id, Conversation.user_id == user.id)).all())
        conversation_rows = []
        for conversation in conversations:
            messages = list(db.scalars(select(Message).where(Message.conversation_id == conversation.id, Message.user_id == user.id).order_by(Message.created_at, Message.id)).all())
            conversation_rows.append({**_row(conversation, ("id", "annotation_id", "title", "created_at", "updated_at")), "messages": [_row(message, ("id", "role", "content", "client_message_id", "model", "status", "created_at", "updated_at")) for message in messages]})
        book_rows.append({
            **_row(book, ("id", "title", "status", "parse_error", "created_at", "updated_at")),
            "import_files": imports,
            "chapters": chapter_rows,
            "progress": _row(progress, ("id", "chapter_id", "updated_at")) if progress else None,
            "annotations": [_row(annotation, ("id", "chapter_id", "start_offset", "end_offset", "selected_text", "note_content", "color", "status", "location_error", "created_at", "updated_at")) for annotation in annotations],
            "excerpts": [_row(excerpt, ("id", "chapter_id", "start_offset", "end_offset", "selected_text", "created_at", "updated_at")) for excerpt in excerpts],
            "notes": [_row(note, ("id", "title", "content", "created_at", "updated_at")) for note in notes],
            "conversations": conversation_rows,
        })
    providers = [_row(provider, ("id", "name", "provider_type", "base_url", "model", "enabled", "created_at", "updated_at")) for provider in db.scalars(select(AIProvider).where(AIProvider.user_id == user.id)).all()]
    # MCP configuration is portable except for its encrypted token. Call logs are
    # deliberately omitted because they can contain arbitrary remote response data.
    mcp_servers = [_row(server, ("id", "name", "endpoint", "transport", "tool_allowlist", "capabilities", "enabled", "created_at", "updated_at")) for server in db.scalars(select(MCPServer).where(MCPServer.user_id == user.id)).all()]
    return {"format": "intertext-export", "schema_version": 2, "exported_at": datetime.utcnow().isoformat() + "Z", "user": {"email": user.email, "display_name": user.display_name}, "books": book_rows, "ai_providers": providers, "mcp_servers": mcp_servers}


def _new_id(value: object, db: DbSession, model) -> str:
    candidate = str(value) if value else ""
    if len(candidate) <= 36 and candidate and db.get(model, candidate) is None:
        return candidate
    return str(uuid4())


def _parse_payload(payload: object) -> dict:
    if not isinstance(payload, dict) or payload.get("format") != "intertext-export":
        raise AppError(422, "invalid_export", "导入文件不是有效的 Intertext 导出文件")
    if payload.get("schema_version") not in (1, 2):
        raise AppError(422, "unsupported_export_version", "导出文件版本不受支持")
    for field in ("books", "ai_providers", "mcp_servers"):
        if field in payload and not isinstance(payload[field], list):
            raise AppError(422, "invalid_export", f"导出文件字段 {field} 必须是数组")
    return payload


async def _request_payload(request: Request) -> object:
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        upload = form.get("file")
        if upload is None or not hasattr(upload, "read"):
            raise AppError(422, "import_file_missing", "请上传 JSON 导出文件")
        raw = await upload.read()
        if len(raw) > get_settings().max_import_size_bytes:
            raise AppError(413, "import_file_too_large", "导入文件超过大小限制")
    else:
        raw = await request.body()
        if len(raw) > get_settings().max_import_size_bytes:
            raise AppError(413, "import_file_too_large", "导入文件超过大小限制")
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AppError(422, "invalid_export_json", "导入文件必须是 UTF-8 JSON") from exc


def _import_data(db: DbSession, user: User, payload: dict) -> dict:
    storage = get_storage(get_settings())
    book_map: dict[str, str] = {}
    chapter_map: dict[str, str] = {}
    annotation_map: dict[str, str] = {}
    conversation_map: dict[str, str] = {}
    imported_books = 0
    duplicate_books = 0
    imported_records = 0
    staged_keys: list[str] = []
    try:
        for raw_book in payload.get("books", []):
            if not isinstance(raw_book, dict):
                continue
            raw_import = next((item for item in raw_book.get("import_files", []) if isinstance(item, dict)), None)
            if raw_import is None or not raw_import.get("file_hash"):
                raise AppError(422, "invalid_export", "书籍缺少文件哈希")
            digest = str(raw_import["file_hash"])
            existing_file = db.scalar(select(ImportFile).where(ImportFile.user_id == user.id, ImportFile.file_hash == digest))
            if existing_file is not None:
                target_book = existing_file.book
                duplicate_books += 1
            else:
                target_id = _new_id(raw_book.get("id"), db, Book)
                target_book = Book(id=target_id, user_id=user.id, title=str(raw_book.get("title") or "未命名书籍")[:500], status=str(raw_book.get("status") or "uploaded"), parse_error=raw_book.get("parse_error"))
                if target_book.status not in {"uploaded", "parsing", "ready", "failed"}:
                    target_book.status = "uploaded"
                db.add(target_book)
                db.flush()
                key = str(raw_import.get("storage_key") or f"{user.id}/{digest}.{raw_import.get('file_format', 'bin')}")
                content = raw_import.get("content_base64")
                if not content:
                    raise AppError(422, "invalid_export_file", "新书籍导入必须包含原始文件内容")
                if content:
                    try:
                        decoded = base64.b64decode(content, validate=True)
                    except (binascii.Error, ValueError) as exc:
                        raise AppError(422, "invalid_export_file", "原始文件内容不是有效的 Base64") from exc
                    with tempfile.NamedTemporaryFile(prefix="intertext-import-", delete=False) as temporary:
                        temporary.write(decoded)
                        temporary_path = Path(temporary.name)
                    try:
                        storage.put_file(temporary_path, key)
                        staged_keys.append(key)
                    finally:
                        temporary_path.unlink(missing_ok=True)
                db.add(ImportFile(id=_new_id(raw_import.get("id"), db, ImportFile), user_id=user.id, book_id=target_book.id, file_name=str(raw_import.get("file_name") or "imported"), file_format=str(raw_import.get("file_format") or "txt"), file_size=int(raw_import.get("file_size") or 0), file_hash=digest, storage_key=key))
                imported_books += 1
            book_map[str(raw_book.get("id"))] = target_book.id
            existing_chapters = {chapter.chapter_index: chapter for chapter in target_book.chapters}
            for raw_chapter in raw_book.get("chapters", []):
                if not isinstance(raw_chapter, dict):
                    continue
                chapter = existing_chapters.get(int(raw_chapter.get("chapter_index", 0)))
                if chapter is None:
                    chapter = Chapter(id=_new_id(raw_chapter.get("id"), db, Chapter), book_id=target_book.id, chapter_index=int(raw_chapter.get("chapter_index", 0)), title=str(raw_chapter.get("title") or "")[:500], text=str(raw_chapter.get("text") or ""), text_length=int(raw_chapter.get("text_length") or len(str(raw_chapter.get("text") or ""))))
                    db.add(chapter)
                    db.flush()
                    imported_records += 1
                chapter_map[str(raw_chapter.get("id"))] = chapter.id
                existing_chunks = {chunk.chunk_index for chunk in chapter.chunks}
                for raw_chunk in raw_chapter.get("chunks", []):
                    if not isinstance(raw_chunk, dict):
                        continue
                    if int(raw_chunk.get("chunk_index", 0)) in existing_chunks:
                        continue
                    db.add(DocumentChunk(id=_new_id(raw_chunk.get("id"), db, DocumentChunk), book_id=target_book.id, chapter_id=chapter.id, chunk_index=int(raw_chunk.get("chunk_index", 0)), text=str(raw_chunk.get("text") or ""), start_offset=int(raw_chunk.get("start_offset") or 0), end_offset=int(raw_chunk.get("end_offset") or 0)))
                    imported_records += 1
        # User-scoped records are imported after their parent ID maps exist.
        for raw_book in payload.get("books", []):
            target_book_id = book_map.get(str(raw_book.get("id")))
            if not target_book_id:
                continue
            for raw_progress in [raw_book.get("progress")]:
                if isinstance(raw_progress, dict):
                    progress = db.scalar(select(ReadingProgress).where(ReadingProgress.user_id == user.id, ReadingProgress.book_id == target_book_id))
                    if progress is None:
                        db.add(ReadingProgress(id=_new_id(raw_progress.get("id"), db, ReadingProgress), user_id=user.id, book_id=target_book_id, chapter_id=chapter_map.get(str(raw_progress.get("chapter_id")))))
            for raw_annotation in raw_book.get("annotations", []):
                if not isinstance(raw_annotation, dict):
                    continue
                source_annotation_id = str(raw_annotation.get("id"))
                existing_annotation = db.get(Annotation, source_annotation_id)
                if existing_annotation is not None:
                    annotation_map[source_annotation_id] = existing_annotation.id
                    continue
                target_chapter = chapter_map.get(str(raw_annotation.get("chapter_id")))
                if target_chapter:
                    annotation_id = _new_id(raw_annotation.get("id"), db, Annotation)
                    db.add(Annotation(id=annotation_id, user_id=user.id, book_id=target_book_id, chapter_id=target_chapter, start_offset=int(raw_annotation.get("start_offset") or 0), end_offset=int(raw_annotation.get("end_offset") or 1), selected_text=str(raw_annotation.get("selected_text") or ""), note_content=raw_annotation.get("note_content"), color=str(raw_annotation.get("color") or "yellow"), status=str(raw_annotation.get("status") or "active"), location_error=raw_annotation.get("location_error")))
                    annotation_map[source_annotation_id] = annotation_id
            for raw_excerpt in raw_book.get("excerpts", []):
                if not isinstance(raw_excerpt, dict) or db.get(Excerpt, str(raw_excerpt.get("id"))) is not None:
                    continue
                target_chapter = chapter_map.get(str(raw_excerpt.get("chapter_id")))
                if target_chapter:
                    db.add(Excerpt(id=_new_id(raw_excerpt.get("id"), db, Excerpt), user_id=user.id, book_id=target_book_id, chapter_id=target_chapter, start_offset=int(raw_excerpt.get("start_offset") or 0), end_offset=int(raw_excerpt.get("end_offset") or 1), selected_text=str(raw_excerpt.get("selected_text") or "")))
            for raw_note in raw_book.get("notes", []):
                if isinstance(raw_note, dict) and db.get(Note, str(raw_note.get("id"))) is None:
                    db.add(Note(id=_new_id(raw_note.get("id"), db, Note), user_id=user.id, book_id=target_book_id, title=str(raw_note.get("title") or "未命名")[:500], content=str(raw_note.get("content") or "")))
            for raw_conversation in raw_book.get("conversations", []):
                if not isinstance(raw_conversation, dict):
                    continue
                conversation = db.get(Conversation, str(raw_conversation.get("id")))
                if conversation is None:
                    conversation = Conversation(id=_new_id(raw_conversation.get("id"), db, Conversation), user_id=user.id, book_id=target_book_id, annotation_id=annotation_map.get(str(raw_conversation.get("annotation_id"))), title=str(raw_conversation.get("title") or "新对话")[:500])
                    db.add(conversation)
                    db.flush()
                conversation_map[str(raw_conversation.get("id"))] = conversation.id
                for raw_message in raw_conversation.get("messages", []):
                    if not isinstance(raw_message, dict) or db.get(Message, str(raw_message.get("id"))) is not None:
                        continue
                    if raw_message.get("client_message_id") is not None and db.scalar(select(Message).where(Message.conversation_id == conversation.id, Message.client_message_id == raw_message.get("client_message_id"))) is not None:
                        continue
                    db.add(Message(id=_new_id(raw_message.get("id"), db, Message), user_id=user.id, conversation_id=conversation.id, role=str(raw_message.get("role") or "user"), content=str(raw_message.get("content") or ""), client_message_id=raw_message.get("client_message_id"), model=raw_message.get("model"), status=str(raw_message.get("status") or "completed")))
        for raw_provider in payload.get("ai_providers", []):
            if isinstance(raw_provider, dict) and db.scalar(select(AIProvider).where(AIProvider.user_id == user.id, AIProvider.name == str(raw_provider.get("name") or ""))) is None:
                provider_type = str(raw_provider.get("provider_type") or "ollama")
                if provider_type not in {"openai", "anthropic", "ollama"}:
                    raise AppError(422, "invalid_export", "导出文件包含无效的 AI Provider 类型")
                db.add(AIProvider(id=_new_id(raw_provider.get("id"), db, AIProvider), user_id=user.id, name=str(raw_provider.get("name") or "Imported")[:100], provider_type=provider_type, base_url=raw_provider.get("base_url"), model=str(raw_provider.get("model") or "")[:100], enabled=bool(raw_provider.get("enabled", True))))
        for raw_server in payload.get("mcp_servers", []):
            if isinstance(raw_server, dict) and db.scalar(select(MCPServer).where(MCPServer.user_id == user.id, MCPServer.name == str(raw_server.get("name") or ""))) is None:
                transport = str(raw_server.get("transport") or "sse")
                if transport not in {"streamable-http", "sse"}:
                    raise AppError(422, "invalid_export", "导出文件包含无效的 MCP 传输类型")
                endpoint = str(raw_server.get("endpoint") or "")
                validate_endpoint(endpoint, get_settings().environment, resolve_dns=get_settings().environment != "development")
                db.add(MCPServer(id=_new_id(raw_server.get("id"), db, MCPServer), user_id=user.id, name=str(raw_server.get("name") or "Imported")[:100], endpoint=endpoint, transport=transport, tool_allowlist=list(raw_server.get("tool_allowlist") or []), capabilities=raw_server.get("capabilities"), enabled=bool(raw_server.get("enabled", True))))
        db.commit()
    except Exception:
        db.rollback()
        for key in staged_keys:
            try:
                storage.delete(key)
            except Exception:
                pass
        raise
    return {"imported_books": imported_books, "duplicate_books": duplicate_books, "imported_records": imported_records, "secrets_imported": False, "id_map": {"books": book_map, "chapters": chapter_map, "annotations": annotation_map, "conversations": conversation_map}}


@router.get("/data/export")
@router.get("/export")
def export_data(db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> JSONResponse:
    payload = _export_user(db, user)
    return JSONResponse(content=payload, headers={"Content-Disposition": 'attachment; filename="intertext-export.json"'})


@router.post("/data/import")
@router.post("/import")
async def import_data(request: Request, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    payload = _parse_payload(await _request_payload(request))
    return _import_data(db, user, payload)
