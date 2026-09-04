import asyncio
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.models.ai import AIProvider, AIRun, AIRunEvent
from app.models.collaboration import Conversation, Message
from app.services.ai_gateway import provider_for
from app.services.context import ContextBuilder
from app.services.encryption import decrypt_secret

_tasks: dict[str, asyncio.Task] = {}


def recover_ai_runs(db: DbSession) -> None:
    runs = list(db.scalars(select(AIRun).where(AIRun.status.in_(["queued", "running"]))).all())
    for run in runs:
        run.status = "partial" if run.last_sequence > 0 else "failed"
        run.error_message = "服务重启导致运行中断"
        message = db.get(Message, run.assistant_message_id)
        if message is not None:
            message.status = run.status
    if runs:
        db.commit()


def create_run(db: DbSession, user_id: str, conversation: Conversation, content: str, client_message_id: str | None, provider_id: str | None, model: str | None, chapter_id: str | None, selection: str | None) -> AIRun:
    if client_message_id:
        existing = db.scalar(select(Message).where(Message.conversation_id == conversation.id, Message.client_message_id == client_message_id))
        if existing is not None:
            run = db.scalar(select(AIRun).where(AIRun.user_message_id == existing.id))
            if run is not None:
                return run
            raise AppError(409, "message_conflict", "该客户端消息已保存但没有对应的 AI 运行")
    if provider_id is not None:
        configured = db.scalar(select(AIProvider).where(AIProvider.id == provider_id, AIProvider.user_id == user_id))
        if configured is None:
            raise AppError(404, "provider_not_found", "Provider 不存在")
    user_message = Message(user_id=user_id, conversation_id=conversation.id, role="user", content=content, client_message_id=client_message_id, status="completed")
    assistant_message = Message(user_id=user_id, conversation_id=conversation.id, role="assistant", content="", model=model, status="pending")
    db.add_all([user_message, assistant_message])
    db.flush()
    run = AIRun(user_id=user_id, conversation_id=conversation.id, user_message_id=user_message.id, assistant_message_id=assistant_message.id, provider_id=provider_id, status="queued")
    db.add(run)
    db.commit()
    db.refresh(run)
    task = asyncio.create_task(_execute(run.id, user_id, conversation.id, provider_id, model, chapter_id, selection))
    _tasks[run.id] = task
    return run


async def _execute(run_id: str, user_id: str, conversation_id: str, provider_id: str | None, requested_model: str | None, chapter_id: str | None, selection: str | None) -> None:
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        run = db.get(AIRun, run_id)
        if run is None:
            return
        provider = db.scalar(select(AIProvider).where(AIProvider.id == provider_id, AIProvider.user_id == user_id, AIProvider.enabled.is_(True))) if provider_id else db.scalar(select(AIProvider).where(AIProvider.user_id == user_id, AIProvider.enabled.is_(True)).order_by(AIProvider.created_at))
        if provider is None:
            _finish(db, run, "failed", "未配置可用的 AI Provider")
            return
        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        db.add(AIRunEvent(run_id=run.id, sequence=1, event_type="run_started", payload={}))
        run.last_sequence = 1
        db.commit()
        context = ContextBuilder(db, user_id).build_context(run.conversation.book_id, conversation_id, selection=selection, chapter_id=chapter_id)
        provider_impl = provider_for(provider.provider_type, decrypt_secret(provider.api_key_encrypted, get_settings()), provider.base_url)
        message = db.get(Message, run.assistant_message_id)
        output = ""
        sequence = run.last_sequence
        try:
            async with asyncio.timeout(120):
                async for delta in provider_impl.stream(context.messages, requested_model or provider.model, 120):
                    output += delta
                    if len(output) > 20_000:
                        output = output[:20_000]
                        raise AppError(422, "message_too_long", "助手消息不能超过 20,000 个字符")
                    sequence += 1
                    message.content = output
                    message.status = "streaming"
                    run.last_sequence = sequence
                    db.add(AIRunEvent(run_id=run.id, sequence=sequence, event_type="text_delta", payload={"text": delta}))
                    db.commit()
            _finish(db, run, "completed", None)
        except asyncio.CancelledError:
            _finish(db, run, "cancelled" if not output else "partial", "运行已取消")
        except Exception as exc:
            _finish(db, run, "partial" if output else "failed", str(exc)[:500])
    finally:
        db.close()
        _tasks.pop(run_id, None)


def _finish(db: DbSession, run: AIRun, status: str, error: str | None) -> None:
    message = db.get(Message, run.assistant_message_id)
    run.status, run.error_message, run.completed_at = status, error, datetime.now(timezone.utc)
    if message is not None:
        message.status = status
    run.last_sequence += 1
    event_type = "run_completed" if status == "completed" else status
    db.add(AIRunEvent(run_id=run.id, sequence=run.last_sequence, event_type=event_type, payload={"error": error} if error else {}))
    db.commit()


def cancel_run(run_id: str, db: DbSession, user_id: str) -> AIRun:
    run = db.scalar(select(AIRun).where(AIRun.id == run_id, AIRun.user_id == user_id))
    if run is None:
        raise AppError(404, "ai_run_not_found", "AI 运行不存在")
    task = _tasks.get(run_id)
    if task and not task.done():
        task.cancel()
    elif run.status in ("queued", "running"):
        _finish(db, run, "cancelled", "运行已取消")
    db.refresh(run)
    return run
