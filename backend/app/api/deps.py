from datetime import datetime, timezone

from fastapi import Cookie, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.security import session_token_hash, unsign_session_token
from app.db.session import get_db
from app.models.session import Session
from app.models.user import User


def get_current_user(
    db: DbSession = Depends(get_db),
    session_cookie: str | None = Cookie(default=None, alias=get_settings().session_cookie_name),
) -> User:
    settings = get_settings()
    if not session_cookie:
        raise AppError(401, "authentication_required", "请先登录")
    raw_token = unsign_session_token(session_cookie, settings)
    if not raw_token:
        raise AppError(401, "invalid_session", "登录状态无效或已过期")
    session = db.scalar(select(Session).where(Session.token_hash == session_token_hash(raw_token)))
    now = datetime.now(timezone.utc)
    if session is None or session.expires_at <= now:
        raise AppError(401, "invalid_session", "登录状态无效或已过期")
    if not session.user.is_active:
        raise AppError(403, "user_inactive", "用户已被停用")
    session.last_seen_at = now
    db.commit()
    return session.user
