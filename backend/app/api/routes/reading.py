from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.api.deps import get_current_user
from app.core.exceptions import AppError
from app.db.session import get_db
from app.models.book import Book
from app.models.document import Annotation, Chapter, Excerpt, ReadingProgress
from app.models.user import User
from app.schemas.reading import (
    AnnotationCreateRequest,
    AnnotationResponse,
    AnnotationUpdateRequest,
    ExcerptCreateRequest,
    ExcerptResponse,
    ReadingProgressRequest,
    ReadingProgressResponse,
)
from app.services.book_parser import utf16_length

router = APIRouter(prefix="/books", tags=["reading"])


def _book(db: DbSession, book_id: str, user: User) -> Book:
    book = db.scalar(select(Book).where(Book.id == book_id, Book.user_id == user.id))
    if book is None:
        raise AppError(404, "book_not_found", "书籍不存在")
    return book


def _chapter(db: DbSession, book_id: str, chapter_id: str) -> Chapter:
    query = select(Chapter).where(Chapter.book_id == book_id)
    query = query.where(Chapter.chapter_index == int(chapter_id)) if chapter_id.isdigit() else query.where(Chapter.id == chapter_id)
    chapter = db.scalar(query)
    if chapter is None:
        raise AppError(404, "chapter_not_found", "章节不存在")
    return chapter


def _python_index_for_utf16(value: str, offset: int) -> int | None:
    if offset < 0 or offset > utf16_length(value):
        return None
    units = 0
    for index, char in enumerate(value):
        if units == offset:
            return index
        units += 2 if ord(char) > 0xFFFF else 1
        if units > offset:
            return None
    return len(value) if units == offset else None


def _validate_selection(chapter: Chapter, payload: AnnotationCreateRequest | ExcerptCreateRequest) -> None:
    if payload.end_offset <= payload.start_offset:
        raise AppError(422, "invalid_selection", "选区结束偏移必须大于开始偏移")
    start = _python_index_for_utf16(chapter.text, payload.start_offset)
    end = _python_index_for_utf16(chapter.text, payload.end_offset)
    if start is None or end is None:
        raise AppError(422, "invalid_selection", "选区偏移超出章节正文范围")
    actual = chapter.text[start:end]
    if actual != payload.selected_text:
        raise AppError(422, "selection_mismatch", "选区文本与章节正文不一致")


def _sync_location(annotation: Annotation, chapter: Chapter) -> None:
    start = _python_index_for_utf16(chapter.text, annotation.start_offset)
    end = _python_index_for_utf16(chapter.text, annotation.end_offset)
    actual = chapter.text[start:end] if start is not None and end is not None else None
    if actual == annotation.selected_text:
        annotation.status = "active"
        annotation.location_error = None
        return
    occurrences: list[int] = []
    cursor = chapter.text.find(annotation.selected_text)
    while cursor >= 0:
        occurrences.append(cursor)
        cursor = chapter.text.find(annotation.selected_text, cursor + 1)
    if len(occurrences) == 1:
        annotation.status = "active"
        annotation.location_error = None
        return
    if not occurrences:
        annotation.status = "orphaned"
        annotation.location_error = "选区无法在当前章节正文中定位"
    else:
        annotation.status = "orphaned"
        annotation.location_error = "原文存在多个匹配位置，无法确定批注定位"


@router.get("/{book_id}/progress", response_model=ReadingProgressResponse | None)
def get_progress(book_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> ReadingProgress | None:
    _book(db, book_id, user)
    return db.scalar(select(ReadingProgress).where(ReadingProgress.book_id == book_id, ReadingProgress.user_id == user.id))


@router.put("/{book_id}/progress", response_model=ReadingProgressResponse)
def save_progress(book_id: str, payload: ReadingProgressRequest, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> ReadingProgress:
    book = _book(db, book_id, user)
    chapter = _chapter(db, book.id, payload.chapter_id)
    progress = db.scalar(select(ReadingProgress).where(ReadingProgress.book_id == book.id, ReadingProgress.user_id == user.id))
    if progress is None:
        progress = ReadingProgress(user_id=user.id, book_id=book.id)
        db.add(progress)
    progress.chapter_id = chapter.id
    db.commit()
    db.refresh(progress)
    return progress


@router.get("/{book_id}/annotations", response_model=list[AnnotationResponse])
def list_annotations(book_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> list[Annotation]:
    _book(db, book_id, user)
    annotations = list(db.scalars(select(Annotation).where(Annotation.book_id == book_id, Annotation.user_id == user.id).order_by(Annotation.created_at)).all())
    chapters = {chapter.id: chapter for chapter in db.scalars(select(Chapter).where(Chapter.book_id == book_id)).all()}
    changed = False
    for annotation in annotations:
        chapter = chapters.get(annotation.chapter_id)
        if chapter is not None:
            previous = (annotation.status, annotation.location_error)
            _sync_location(annotation, chapter)
            changed |= previous != (annotation.status, annotation.location_error)
    if changed:
        db.commit()
    return annotations


@router.post("/{book_id}/annotations", response_model=AnnotationResponse, status_code=201)
def create_annotation(book_id: str, payload: AnnotationCreateRequest, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Annotation:
    _book(db, book_id, user)
    chapter = _chapter(db, book_id, payload.chapter_id)
    _validate_selection(chapter, payload)
    annotation = Annotation(user_id=user.id, book_id=book_id, chapter_id=chapter.id, start_offset=payload.start_offset, end_offset=payload.end_offset, selected_text=payload.selected_text, note_content=payload.note_content, color=payload.color)
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    return annotation


@router.get("/{book_id}/excerpts", response_model=list[ExcerptResponse])
def list_excerpts(book_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> list[Excerpt]:
    _book(db, book_id, user)
    return list(db.scalars(select(Excerpt).where(Excerpt.book_id == book_id, Excerpt.user_id == user.id).order_by(Excerpt.created_at, Excerpt.id)).all())


@router.post("/{book_id}/excerpts", response_model=ExcerptResponse, status_code=201)
def create_excerpt(book_id: str, payload: ExcerptCreateRequest, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Excerpt:
    _book(db, book_id, user)
    chapter = _chapter(db, book_id, payload.chapter_id)
    _validate_selection(chapter, payload)
    excerpt = Excerpt(user_id=user.id, book_id=book_id, chapter_id=chapter.id, start_offset=payload.start_offset, end_offset=payload.end_offset, selected_text=payload.selected_text)
    db.add(excerpt)
    db.commit()
    db.refresh(excerpt)
    return excerpt


@router.delete("/{book_id}/excerpts/{excerpt_id}", status_code=204)
def delete_excerpt(book_id: str, excerpt_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Response:
    _book(db, book_id, user)
    excerpt = db.scalar(select(Excerpt).where(Excerpt.id == excerpt_id, Excerpt.book_id == book_id, Excerpt.user_id == user.id))
    if excerpt is None:
        raise AppError(404, "excerpt_not_found", "收藏不存在")
    db.delete(excerpt)
    db.commit()
    return Response(status_code=204)


@router.patch("/{book_id}/annotations/{annotation_id}", response_model=AnnotationResponse)
def update_annotation(book_id: str, annotation_id: str, payload: AnnotationUpdateRequest, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Annotation:
    _book(db, book_id, user)
    annotation = db.scalar(select(Annotation).where(Annotation.id == annotation_id, Annotation.book_id == book_id, Annotation.user_id == user.id))
    if annotation is None:
        raise AppError(404, "annotation_not_found", "批注不存在")
    if payload.note_content is not None or "note_content" in payload.model_fields_set:
        annotation.note_content = payload.note_content
    if payload.color is not None:
        annotation.color = payload.color
    db.commit()
    db.refresh(annotation)
    return annotation


@router.delete("/{book_id}/annotations/{annotation_id}", status_code=204)
def delete_annotation(book_id: str, annotation_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Response:
    _book(db, book_id, user)
    annotation = db.scalar(select(Annotation).where(Annotation.id == annotation_id, Annotation.book_id == book_id, Annotation.user_id == user.id))
    if annotation is None:
        raise AppError(404, "annotation_not_found", "批注不存在")
    db.delete(annotation)
    db.commit()
    return Response(status_code=204)
