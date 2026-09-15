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
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest, UserResponse, UserSettingsResponse, UserSettingsUpdate


router = APIRouter(prefix="/auth", tags=["auth"])
DEFAULT_PROMPTS = {
    "guided": "You are a thoughtful reading guide. Lead with open-ended questions, invite close reading, and help the reader discover their own interpretation before offering yours.",
    "discussion": "You are a thoughtful reading companion. Engage deeply with texts, offer interpretive perspectives, and ask questions that open new lines of thought rather than closing them.",
    "concise": "You are a concise reading companion. Answer directly in a few focused sentences, cite the relevant text when useful, and avoid unnecessary preamble.",
}


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


@router.get("/settings", response_model=UserSettingsResponse)
def get_user_settings(user: User = Depends(get_current_user)) -> dict[str, str]:
    style = user.companion_style or "discussion"
    return {"style": style, "prompt": user.companion_prompt or DEFAULT_PROMPTS[style]}


@router.patch("/settings", response_model=UserSettingsResponse)
def update_settings(payload: UserSettingsUpdate, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, str]:
    if payload.style is not None:
        user.companion_style = payload.style
        if payload.prompt is None and user.companion_prompt is None:
            user.companion_prompt = DEFAULT_PROMPTS[payload.style]
    if payload.prompt is not None:
        user.companion_prompt = payload.prompt.strip()
    db.commit()
    return {"style": user.companion_style or "discussion", "prompt": user.companion_prompt or DEFAULT_PROMPTS[user.companion_style or "discussion"]}
