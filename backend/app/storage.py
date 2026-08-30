from __future__ import annotations

import shutil
from io import BytesIO
from pathlib import Path
from typing import BinaryIO, Protocol

from app.core.config import Settings


class Storage(Protocol):
    def put_file(self, source: Path, key: str) -> None: ...
    def open_file(self, key: str) -> BinaryIO: ...
    def delete(self, key: str) -> None: ...


class LocalStorage:
    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root not in path.parents:
            raise ValueError("invalid storage key")
        return path

    def put_file(self, source: Path, key: str) -> None:
        destination = self._path(key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(destination))

    def open_file(self, key: str) -> BinaryIO:
        return self._path(key).open("rb")

    def delete(self, key: str) -> None:
        path = self._path(key)
        try:
            path.unlink()
        except FileNotFoundError:
            pass


class S3Storage:
    """S3-compatible storage hook; install boto3 in production deployments."""

    def __init__(self, settings: Settings):
        if not settings.s3_endpoint_url or not settings.s3_bucket:
            raise RuntimeError("S3 storage requires S3_ENDPOINT_URL and S3_BUCKET")
        try:
            import boto3
        except ImportError as exc:
            raise RuntimeError("S3 storage requires boto3") from exc
        self.bucket = settings.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
        )

    def put_file(self, source: Path, key: str) -> None:
        self.client.upload_file(str(source), self.bucket, key)

    def open_file(self, key: str) -> BinaryIO:
        content = BytesIO()
        self.client.download_fileobj(self.bucket, key, content)
        content.seek(0)
        return content

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)


def get_storage(settings: Settings) -> Storage:
    if settings.storage_backend.lower() == "local":
        return LocalStorage(settings.storage_local_dir)
    if settings.storage_backend.lower() == "s3":
        return S3Storage(settings)
    raise RuntimeError(f"unsupported storage backend: {settings.storage_backend}")
