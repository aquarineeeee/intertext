import asyncio
import io
import zipfile

import pytest
from fastapi import UploadFile

from app.core.config import Settings
from app.core.exceptions import AppError
from app.services.book_import import stage_upload


def upload(name: str, content: bytes, content_type: str) -> UploadFile:
    return UploadFile(filename=name, file=io.BytesIO(content), headers={"content-type": content_type})


def test_upload_rejects_unknown_extension() -> None:
    with pytest.raises(AppError) as error:
        asyncio.run(stage_upload(upload("book.pdf", b"data", "application/pdf"), Settings()))
    assert error.value.code == "unsupported_file_format"


def test_upload_rejects_mismatched_mime() -> None:
    with pytest.raises(AppError) as error:
        asyncio.run(stage_upload(upload("book.txt", b"data", "application/pdf"), Settings()))
    assert error.value.code == "invalid_file_mime"


def test_upload_enforces_size_limit() -> None:
    with pytest.raises(AppError) as error:
        asyncio.run(stage_upload(upload("book.txt", b"1234", "text/plain"), Settings(max_upload_size_bytes=3)))
    assert error.value.code == "file_too_large"


def test_valid_epub_is_staged() -> None:
    content = io.BytesIO()
    with zipfile.ZipFile(content, "w") as archive:
        archive.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        archive.writestr("META-INF/container.xml", '<container><rootfile full-path="OEBPS/content.opf"/></container>')
        archive.writestr("OEBPS/content.opf", "<package/>")
    content.seek(0)
    path, fmt, size, digest = asyncio.run(
        stage_upload(UploadFile(filename="book.epub", file=content, headers={"content-type": "application/epub+zip"}), Settings())
    )
    try:
        assert fmt == "epub"
        assert size > 0
        assert len(digest) == 64
    finally:
        path.unlink(missing_ok=True)
