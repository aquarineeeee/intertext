from pathlib import Path

from fastapi import APIRouter, Depends, File, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.db.session import get_db
from app.models.book import Book, ImportFile
from app.models.document import Chapter
from app.models.user import User
from app.schemas.books import BookResponse, ChapterResponse, ChapterSummaryResponse
from app.services.book_parser import parse_book
from app.services.book_import import default_title, stage_upload, storage_key
from app.storage import get_storage

router = APIRouter(prefix="/books", tags=["books"])


@router.post("/import", response_model=BookResponse, status_code=201)
async def import_book(
    response: Response,
    file: UploadFile = File(...),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Book:
    settings = get_settings()
    staged, fmt, size, digest = await stage_upload(file, settings)
    existing = db.scalar(select(ImportFile).where(ImportFile.user_id == user.id, ImportFile.file_hash == digest))
    if existing is not None:
        staged.unlink(missing_ok=True)
        raise AppError(409, "duplicate_file", "相同文件已经导入", {"book_id": existing.book_id})
    key = storage_key(user.id, digest, fmt)
    safe_name = Path(file.filename or "").name.strip() or "unnamed." + fmt
    book = Book(user_id=user.id, title=default_title(safe_name), status="uploaded")
    imported = ImportFile(
        user_id=user.id,
        book=book,
        file_name=safe_name,
        file_format=fmt,
        file_size=size,
        file_hash=digest,
        storage_key=key,
    )
    storage = None
    try:
        storage = get_storage(settings)
        storage.put_file(staged, key)
        staged.unlink(missing_ok=True)
        db.add(book)
        db.add(imported)
        db.commit()
        db.refresh(book)
    except IntegrityError:
        db.rollback()
        if storage is not None:
            storage.delete(key)
        raise AppError(409, "duplicate_file", "相同文件已经导入") from None
    except Exception:
        db.rollback()
        if storage is not None:
            storage.delete(key)
        staged.unlink(missing_ok=True)
        raise
    response.headers["Location"] = f"/api/v1/books/{book.id}"
    # Parsing is synchronous for now; the persisted status still makes the operation recoverable.
    parse_book(db, book.id, storage)
    db.refresh(book)
    return book


@router.get("", response_model=list[BookResponse])
def list_books(db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> list[Book]:
    return list(db.scalars(select(Book).where(Book.user_id == user.id).order_by(Book.created_at.desc())).all())


@router.get("/{book_id}", response_model=BookResponse)
def get_book(book_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Book:
    book = db.scalar(select(Book).where(Book.id == book_id, Book.user_id == user.id))
    if book is None:
        raise AppError(404, "book_not_found", "书籍不存在")
    return book


@router.post("/{book_id}/parse", response_model=BookResponse)
def reparse_book(book_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Book:
    book = db.scalar(select(Book).where(Book.id == book_id, Book.user_id == user.id))
    if book is None:
        raise AppError(404, "book_not_found", "书籍不存在")
    return parse_book(db, book.id, get_storage(get_settings()))


@router.get("/{book_id}/chapters", response_model=list[ChapterSummaryResponse])
def list_chapters(book_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> list[Chapter]:
    book = db.scalar(select(Book).where(Book.id == book_id, Book.user_id == user.id))
    if book is None:
        raise AppError(404, "book_not_found", "书籍不存在")
    return list(db.scalars(select(Chapter).where(Chapter.book_id == book.id).order_by(Chapter.chapter_index)).all())


@router.get("/{book_id}/chapters/{chapter_id}", response_model=ChapterResponse)
def get_chapter(book_id: str, chapter_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Chapter:
    book = db.scalar(select(Book).where(Book.id == book_id, Book.user_id == user.id))
    if book is None:
        raise AppError(404, "book_not_found", "书籍不存在")
    query = select(Chapter).where(Chapter.book_id == book.id)
    if chapter_id.isdigit():
        query = query.where(Chapter.chapter_index == int(chapter_id))
    else:
        query = query.where(Chapter.id == chapter_id)
    chapter = db.scalar(query)
    if chapter is None:
        raise AppError(404, "chapter_not_found", "章节不存在")
    return chapter


@router.get("/{book_id}/chapters/{chapter_id}/content", response_model=ChapterResponse)
def get_chapter_content(book_id: str, chapter_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Chapter:
    return get_chapter(book_id, chapter_id, db, user)


@router.delete("/{book_id}", status_code=204)
def delete_book(book_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Response:
    book = db.scalar(select(Book).where(Book.id == book_id, Book.user_id == user.id))
    if book is None:
        raise AppError(404, "book_not_found", "书籍不存在")
    storage = get_storage(get_settings())
    keys = [item.storage_key for item in book.import_files]
    db.delete(book)
    db.commit()
    for key in keys:
        try:
            storage.delete(key)
        except Exception:
            pass
    return Response(status_code=204)
