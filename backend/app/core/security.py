import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from itsdangerous import BadSignature, URLSafeTimedSerializer
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError

from app.core.config import Settings


password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    try:
        return password_hash.verify(password, encoded)
    except (ValueError, TypeError, UnknownHashError):
        return False


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def session_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def sign_session_token(token: str, settings: Settings) -> str:
    return URLSafeTimedSerializer(settings.secret_key, salt="session-cookie").dumps(token)


def unsign_session_token(value: str, settings: Settings) -> str | None:
    try:
        return URLSafeTimedSerializer(settings.secret_key, salt="session-cookie").loads(value, max_age=settings.session_ttl_seconds)
    except BadSignature:
        return None


def session_expiry(settings: Settings) -> datetime:
    return datetime.now(timezone.utc) + timedelta(seconds=settings.session_ttl_seconds)
