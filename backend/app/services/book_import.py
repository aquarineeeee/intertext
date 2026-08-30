from __future__ import annotations

import hashlib
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from uuid import uuid4
from xml.etree import ElementTree

from fastapi import UploadFile

from app.core.exceptions import AppError
from app.core.config import Settings

ALLOWED_MIME_TYPES = {
    "epub": {"application/epub+zip", "application/zip", "application/octet-stream"},
    "txt": {"text/plain", "application/octet-stream"},
}


def file_format(file_name: str) -> str:
    suffix = Path(file_name).suffix.lower()
    if suffix == ".epub":
        return "epub"
    if suffix == ".txt":
        return "txt"
    raise AppError(415, "unsupported_file_format", "仅支持 EPUB 和 TXT 文件")


def validate_epub(path: Path) -> None:
    try:
        with zipfile.ZipFile(path) as archive:
            if archive.testzip() is not None:
                raise AppError(422, "invalid_file", "EPUB 文件损坏")
            names = archive.namelist()
            if not names or names[0] != "mimetype" or archive.getinfo("mimetype").compress_type != zipfile.ZIP_STORED:
                raise AppError(422, "invalid_file", "EPUB 文件结构无效")
            if archive.read("mimetype") != b"application/epub+zip":
                raise AppError(422, "invalid_file", "EPUB MIME 标识无效")
            container = archive.read("META-INF/container.xml")
            root = ElementTree.fromstring(container)
            rootfiles = [
                element.attrib.get("full-path")
                for element in root.iter()
                if element.tag.rsplit("}", 1)[-1] == "rootfile" and element.attrib.get("full-path")
            ]
            if not rootfiles:
                raise AppError(422, "invalid_file", "EPUB 缺少有效的 rootfile")
            rootfile = PurePosixPath(rootfiles[0])
            if rootfile.is_absolute() or ".." in rootfile.parts or str(rootfile) not in names:
                raise AppError(422, "invalid_file", "EPUB rootfile 不存在")
    except KeyError as exc:
        raise AppError(422, "invalid_file", "EPUB 缺少必要文件") from exc
    except (zipfile.BadZipFile, ElementTree.ParseError) as exc:
        raise AppError(422, "invalid_file", "EPUB 文件结构无效") from exc


def validate_mime(file: UploadFile, fmt: str) -> None:
    content_type = (file.content_type or "").lower().split(";", 1)[0].strip()
    if content_type and content_type not in ALLOWED_MIME_TYPES[fmt]:
        raise AppError(415, "invalid_file_mime", "文件 MIME 类型与扩展名不匹配")


async def stage_upload(file: UploadFile, settings: Settings) -> tuple[Path, str, int, str]:
    name = Path(file.filename or "").name
    if not name or "\x00" in name or len(name) > 500:
        raise AppError(422, "invalid_file_name", "文件名无效或过长")
    fmt = file_format(name)
    validate_mime(file, fmt)
    temporary = tempfile.NamedTemporaryFile(prefix="intertext-upload-", suffix="." + fmt, delete=False)
    path = Path(temporary.name)
    digest = hashlib.sha256()
    size = 0
    try:
        with temporary:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.max_upload_size_bytes:
                    raise AppError(413, "file_too_large", "文件大小超过 20 MiB 限制")
                digest.update(chunk)
                temporary.write(chunk)
        if size == 0:
            raise AppError(422, "invalid_file", "文件不能为空")
        if fmt == "epub":
            validate_epub(path)
        return path, fmt, size, digest.hexdigest()
    except Exception:
        path.unlink(missing_ok=True)
        raise


def storage_key(user_id: str, file_hash: str, fmt: str) -> str:
    return f"{user_id}/{file_hash[:2]}/{uuid4()}-{file_hash}.{fmt}"


def default_title(file_name: str) -> str:
    title = Path(file_name).stem.strip()
    return title or "未命名书籍"
