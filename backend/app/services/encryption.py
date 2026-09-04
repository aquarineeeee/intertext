import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import Settings
from app.core.exceptions import AppError


def _fernet(settings: Settings) -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256((settings.encryption_key or settings.secret_key).encode("utf-8")).digest())
    return Fernet(key)


def encrypt_secret(value: str, settings: Settings) -> str:
    if not value:
        raise AppError(422, "secret_empty", "密钥不能为空")
    return _fernet(settings).encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str | None, settings: Settings) -> str | None:
    if not value:
        return None
    try:
        return _fernet(settings).decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, UnicodeError) as exc:
        raise AppError(500, "secret_unavailable", "Provider 密钥无法解密") from exc
