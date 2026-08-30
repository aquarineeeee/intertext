from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(self, status_code: int, code: str, message: str, details: Any = None):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


def error_payload(code: str, message: str, details: Any = None) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return {"error": error}


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=error_payload(exc.code, exc.message, exc.details))


async def http_error_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = "not_found" if exc.status_code == 404 else "http_error"
    message = exc.detail if isinstance(exc.detail, str) else "请求失败"
    return JSONResponse(status_code=exc.status_code, content=error_payload(code, message))


async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    details = [{"field": ".".join(str(part) for part in item["loc"]), "message": item["msg"]} for item in exc.errors()]
    return JSONResponse(status_code=422, content=error_payload("validation_error", "请求参数无效", details))


async def unhandled_error_handler(_: Request, __: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content=error_payload("internal_error", "服务器内部错误"))
