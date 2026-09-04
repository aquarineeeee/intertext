import asyncio
import json

from fastapi import APIRouter, Depends, Header, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.api.deps import get_current_user
from app.core.exceptions import AppError
from app.db.session import get_db
from app.models.ai import AIProvider, AIRun, AIRunEvent
from app.models.collaboration import Conversation, Message
from app.models.user import User
from app.schemas.ai import AIProviderCreate, AIProviderResponse, AIProviderUpdate, AIRunCreate, AIRunEventResponse, AIRunResponse, SearchBookRequest
from app.services.ai_runs import cancel_run, create_run
from app.services.context import ContextBuilder
from app.services.encryption import encrypt_secret
from app.services.search import search_book

router = APIRouter(prefix="/books", tags=["ai"])
ai_router = APIRouter(prefix="/ai", tags=["ai"])


def _provider_view(item: AIProvider) -> dict:
    return {"id": item.id, "name": item.name, "provider_type": item.provider_type, "model": item.model, "base_url": item.base_url, "enabled": item.enabled, "has_api_key": bool(item.api_key_encrypted), "created_at": item.created_at, "updated_at": item.updated_at}


@ai_router.get("/providers", response_model=list[AIProviderResponse])
def list_providers(db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    return [_provider_view(item) for item in db.scalars(select(AIProvider).where(AIProvider.user_id == user.id).order_by(AIProvider.created_at)).all()]


@ai_router.post("/providers", response_model=AIProviderResponse, status_code=201)
def create_provider(payload: AIProviderCreate, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = AIProvider(user_id=user.id, name=payload.name, provider_type=payload.provider_type, model=payload.model, base_url=payload.base_url, api_key_encrypted=encrypt_secret(payload.api_key, __import__('app.core.config', fromlist=['get_settings']).get_settings()) if payload.api_key else None, enabled=payload.enabled)
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "provider_exists", "Provider 名称已存在") from None
    db.refresh(item)
    return _provider_view(item)


@ai_router.patch("/providers/{provider_id}", response_model=AIProviderResponse)
def update_provider(provider_id: str, payload: AIProviderUpdate, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.scalar(select(AIProvider).where(AIProvider.id == provider_id, AIProvider.user_id == user.id))
    if item is None:
        raise AppError(404, "provider_not_found", "Provider 不存在")
    for field in ("name", "model", "base_url", "enabled"):
        value = getattr(payload, field)
        if value is not None:
            setattr(item, field, value)
    if payload.api_key is not None:
        item.api_key_encrypted = encrypt_secret(payload.api_key, __import__('app.core.config', fromlist=['get_settings']).get_settings())
    db.commit(); db.refresh(item)
    return _provider_view(item)


@ai_router.delete("/providers/{provider_id}", status_code=204)
def delete_provider(provider_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.scalar(select(AIProvider).where(AIProvider.id == provider_id, AIProvider.user_id == user.id))
    if item is None:
        raise AppError(404, "provider_not_found", "Provider 不存在")
    db.delete(item); db.commit(); return Response(status_code=204)


@router.post("/{book_id}/search", response_model=list[dict])
def search(book_id: str, payload: SearchBookRequest, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    if payload.book_id != book_id:
        raise AppError(400, "book_id_mismatch", "检索书籍 ID 不匹配")
    return [item.as_dict() for item in search_book(db, user.id, book_id, payload.query, payload.chapter_id, payload.limit)]


@ai_router.post("/search", response_model=list[dict])
def search_any_book(payload: SearchBookRequest, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    return [item.as_dict() for item in search_book(db, user.id, payload.book_id, payload.query, payload.chapter_id, payload.limit)]


@router.post("/{book_id}/conversations/{conversation_id}/runs", response_model=AIRunResponse, status_code=201)
async def start_run(book_id: str, conversation_id: str, payload: AIRunCreate, response: Response, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    conversation = db.scalar(select(Conversation).where(Conversation.id == conversation_id, Conversation.book_id == book_id, Conversation.user_id == user.id))
    if conversation is None:
        raise AppError(404, "conversation_not_found", "对话不存在")
    existing = None
    if payload.client_message_id:
        prior_message = db.scalar(select(Message).where(Message.conversation_id == conversation.id, Message.client_message_id == payload.client_message_id))
        if prior_message is not None:
            existing = db.scalar(select(AIRun).where(AIRun.user_message_id == prior_message.id))
    run = create_run(db, user.id, conversation, payload.content, payload.client_message_id, payload.provider_id, payload.model, payload.chapter_id, payload.selection)
    if existing is not None:
        response.status_code = 200
    return run


@ai_router.get("/runs/{run_id}", response_model=AIRunResponse)
def get_run(run_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    run = db.scalar(select(AIRun).where(AIRun.id == run_id, AIRun.user_id == user.id))
    if run is None: raise AppError(404, "ai_run_not_found", "AI 运行不存在")
    return run


@ai_router.post("/runs/{run_id}/cancel", response_model=AIRunResponse)
def stop_run(run_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    return cancel_run(run_id, db, user.id)


@ai_router.get("/runs/{run_id}/events")
async def stream_events(run_id: str, after: int = Query(default=0, ge=0), last_event_id: str | None = Header(default=None, alias="Last-Event-ID"), db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    run = db.scalar(select(AIRun).where(AIRun.id == run_id, AIRun.user_id == user.id))
    if run is None: raise AppError(404, "ai_run_not_found", "AI 运行不存在")
    try:
        last_cursor = int(last_event_id or 0)
    except ValueError:
        last_cursor = 0
    cursor = max(after, last_cursor)

    async def generate():
        nonlocal cursor
        idle = 0
        while idle < 30:
            rows = list(db.scalars(select(AIRunEvent).where(AIRunEvent.run_id == run_id, AIRunEvent.sequence > cursor).order_by(AIRunEvent.sequence)).all())
            if rows:
                idle = 0
                for event in rows:
                    cursor = event.sequence
                    yield f"id: {event.sequence}\nevent: {event.event_type}\ndata: {json.dumps(event.payload, ensure_ascii=False)}\n\n"
                db.expire(run)
                if run.status in ("completed", "failed", "cancelled", "partial"): return
            else:
                idle += 1
                if idle == 15:
                    yield ": heartbeat\n\n"
                await asyncio.sleep(1)

    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
