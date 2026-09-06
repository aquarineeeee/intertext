from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.api.deps import get_current_user
from app.core.exceptions import AppError
from app.db.session import get_db
from app.models.book import Book
from app.models.collaboration import Conversation, Message, Note
from app.models.document import Annotation
from app.models.user import User
from app.schemas.collaboration import (
    ConversationCreateRequest,
    ConversationResponse,
    ConversationUpdateRequest,
    MessageCreateRequest,
    MessageResponse,
    NoteCreateRequest,
    NoteResponse,
    NoteUpdateRequest,
)

router = APIRouter(prefix="/books", tags=["notes and conversations"])


def _book(db: DbSession, book_id: str, user: User) -> Book:
    book = db.scalar(select(Book).where(Book.id == book_id, Book.user_id == user.id))
    if book is None:
        raise AppError(404, "book_not_found", "书籍不存在")
    return book


def _conversation(db: DbSession, book_id: str, conversation_id: str, user: User) -> Conversation:
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.book_id == book_id,
            Conversation.user_id == user.id,
        )
    )
    if conversation is None:
        raise AppError(404, "conversation_not_found", "对话不存在")
    return conversation


@router.get("/{book_id}/notes", response_model=list[NoteResponse])
def list_notes(book_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> list[Note]:
    _book(db, book_id, user)
    return list(db.scalars(select(Note).where(Note.book_id == book_id, Note.user_id == user.id).order_by(Note.created_at, Note.id)).all())


@router.post("/{book_id}/notes", response_model=NoteResponse, status_code=201)
def create_note(book_id: str, payload: NoteCreateRequest, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Note:
    _book(db, book_id, user)
    note = Note(user_id=user.id, book_id=book_id, title=payload.title, content=payload.content)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.get("/{book_id}/notes/{note_id}", response_model=NoteResponse)
def get_note(book_id: str, note_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Note:
    _book(db, book_id, user)
    note = db.scalar(select(Note).where(Note.id == note_id, Note.book_id == book_id, Note.user_id == user.id))
    if note is None:
        raise AppError(404, "note_not_found", "Note 不存在")
    return note


@router.patch("/{book_id}/notes/{note_id}", response_model=NoteResponse)
def update_note(book_id: str, note_id: str, payload: NoteUpdateRequest, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Note:
    note = get_note(book_id, note_id, db, user)
    if payload.title is not None:
        note.title = payload.title
    if payload.content is not None:
        note.content = payload.content
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{book_id}/notes/{note_id}", status_code=204)
def delete_note(book_id: str, note_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Response:
    note = get_note(book_id, note_id, db, user)
    db.delete(note)
    db.commit()
    return Response(status_code=204)


@router.get("/{book_id}/conversations", response_model=list[ConversationResponse])
def list_conversations(book_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> list[Conversation]:
    _book(db, book_id, user)
    return list(db.scalars(select(Conversation).where(Conversation.book_id == book_id, Conversation.user_id == user.id).order_by(Conversation.updated_at.desc(), Conversation.id)).all())


@router.post("/{book_id}/conversations", response_model=ConversationResponse, status_code=201)
def create_conversation(book_id: str, payload: ConversationCreateRequest, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Conversation:
    _book(db, book_id, user)
    annotation_id = payload.annotation_id
    if annotation_id is not None:
        annotation = db.scalar(select(Annotation).where(Annotation.id == annotation_id, Annotation.book_id == book_id, Annotation.user_id == user.id))
        if annotation is None:
            raise AppError(404, "annotation_not_found", "批注不存在")
    conversation = Conversation(user_id=user.id, book_id=book_id, annotation_id=annotation_id, title=payload.title)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


@router.get("/{book_id}/conversations/{conversation_id}", response_model=ConversationResponse)
def get_conversation(book_id: str, conversation_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Conversation:
    _book(db, book_id, user)
    return _conversation(db, book_id, conversation_id, user)


@router.patch("/{book_id}/conversations/{conversation_id}", response_model=ConversationResponse)
def update_conversation(book_id: str, conversation_id: str, payload: ConversationUpdateRequest, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Conversation:
    conversation = _conversation(db, book_id, conversation_id, user)
    conversation.title = payload.title
    db.commit()
    db.refresh(conversation)
    return conversation


@router.delete("/{book_id}/conversations/{conversation_id}", status_code=204)
def delete_conversation(book_id: str, conversation_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Response:
    conversation = _conversation(db, book_id, conversation_id, user)
    db.delete(conversation)
    db.commit()
    return Response(status_code=204)


@router.get("/{book_id}/conversations/{conversation_id}/messages", response_model=list[MessageResponse])
def list_messages(book_id: str, conversation_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> list[Message]:
    _conversation(db, book_id, conversation_id, user)
    return list(db.scalars(select(Message).where(Message.conversation_id == conversation_id, Message.user_id == user.id).order_by(Message.created_at, Message.id)).all())


@router.post("/{book_id}/conversations/{conversation_id}/messages", response_model=MessageResponse, status_code=201)
def create_message(book_id: str, conversation_id: str, payload: MessageCreateRequest, response: Response, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> Message:
    conversation = _conversation(db, book_id, conversation_id, user)
    if payload.client_message_id is not None:
        existing = db.scalar(select(Message).where(Message.conversation_id == conversation.id, Message.client_message_id == payload.client_message_id))
        if existing is not None:
            response.status_code = 200
            return existing
    message = Message(
        user_id=user.id,
        conversation_id=conversation.id,
        role=payload.role,
        content=payload.content,
        client_message_id=payload.client_message_id,
        model=payload.model,
        status=payload.status,
    )
    conversation.updated_at = func.now()
    db.add(message)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if payload.client_message_id is not None:
            existing = db.scalar(select(Message).where(Message.conversation_id == conversation.id, Message.client_message_id == payload.client_message_id))
            if existing is not None:
                response.status_code = 200
                return existing
        raise AppError(409, "message_conflict", "消息保存冲突") from None
    db.refresh(message)
    return message
