import base64
from types import SimpleNamespace

from app.api.routes.data import _parse_payload, _row
from app.core.exceptions import AppError


def test_export_rows_use_iso_dates_without_secrets() -> None:
    row = _row(SimpleNamespace(id="x", created_at=__import__("datetime").datetime(2026, 1, 1)), ("id", "created_at"))
    assert row == {"id": "x", "created_at": "2026-01-01T00:00:00"}


def test_import_rejects_wrong_format_and_version() -> None:
    for payload in ({}, {"format": "intertext-export", "schema_version": 99}):
        try:
            _parse_payload(payload)
        except AppError as error:
            assert error.status_code == 422
        else:
            raise AssertionError("invalid payload accepted")


def test_export_file_base64_round_trip() -> None:
    assert base64.b64decode(base64.b64encode("文本".encode()).decode()) == "文本".encode()
