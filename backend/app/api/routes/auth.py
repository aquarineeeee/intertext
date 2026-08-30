from fastapi import APIRouter, Cookie, Depends, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.security import (
    hash_password,
    new_session_token,
    session_expiry,
    session_token_hash,
    sign_session_token,
    unsign_session_token,
    verify_password,
)
from app.db.session import get_db
from app.models.session import Session
from app.models.user import User
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest, UserResponse


router = APIRouter(prefix="/auth", tags=["auth"])


def set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.session_cookie_name,
        value=sign_session_token(token, settings),
        max_age=settings.session_ttl_seconds,
        expires=session_expiry(settings),
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
    )


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(payload: RegisterRequest, response: Response, db: DbSession = Depends(get_db)) -> AuthResponse:
    email = str(payload.email).lower()
    if db.scalar(select(User).where(User.email == email)) is not None:
        raise AppError(409, "user_already_exists", "该邮箱已注册")
    user = User(email=email, password_hash=hash_password(payload.password), display_name=payload.display_name)
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "user_already_exists", "该邮箱已注册") from None
    token = new_session_token()
    db.add(Session(user_id=user.id, token_hash=session_token_hash(token), expires_at=session_expiry(get_settings())))
    db.commit()
    db.refresh(user)
    set_session_cookie(response, token)
    return AuthResponse(user=user)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, response: Response, db: DbSession = Depends(get_db)) -> AuthResponse:
    email = str(payload.email).lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise AppError(401, "invalid_credentials", "邮箱或密码错误")
    if not user.is_active:
        raise AppError(403, "user_inactive", "用户已被停用")
    token = new_session_token()
    db.add(Session(user_id=user.id, token_hash=session_token_hash(token), expires_at=session_expiry(get_settings())))
    db.commit()
    set_session_cookie(response, token)
    return AuthResponse(user=user)


@router.post("/logout", status_code=204)
def logout(
    response: Response,
    db: DbSession = Depends(get_db),
    session_cookie: str | None = Cookie(default=None, alias=get_settings().session_cookie_name),
) -> Response:
    if session_cookie:
        raw_token = unsign_session_token(session_cookie, get_settings())
        if raw_token:
            session = db.scalar(select(Session).where(Session.token_hash == session_token_hash(raw_token)))
            if session:
                db.delete(session)
                db.commit()
    response.delete_cookie(key=get_settings().session_cookie_name, path="/")
    return response


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)) -> User:
    return user
