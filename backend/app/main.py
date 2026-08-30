from fastapi import Depends, FastAPI
from fastapi.exceptions import RequestValidationError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session as DbSession
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes.auth import router as auth_router
from app.core.config import get_settings
from app.core.exceptions import AppError, app_error_handler, http_error_handler, unhandled_error_handler, validation_error_handler
from app.db.session import get_db


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0")
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
    # Keep the versioned API canonical while retaining the short /api paths for local clients.
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(auth_router, prefix="/api")

    @app.get("/health", tags=["system"])
    def health(db: DbSession = Depends(get_db)) -> dict[str, str]:
        try:
            db.execute(text("SELECT 1"))
        except SQLAlchemyError as exc:
            raise AppError(503, "database_unavailable", "数据库暂不可用") from exc
        return {"status": "ok"}

    @app.get("/api/v1/health", tags=["system"])
    def api_health(db: DbSession = Depends(get_db)) -> dict[str, str]:
        try:
            db.execute(text("SELECT 1"))
        except SQLAlchemyError as exc:
            raise AppError(503, "database_unavailable", "数据库暂不可用") from exc
        return {"status": "ok"}

    @app.get("/api/health", tags=["system"])
    def short_api_health(db: DbSession = Depends(get_db)) -> dict[str, str]:
        try:
            db.execute(text("SELECT 1"))
        except SQLAlchemyError as exc:
            raise AppError(503, "database_unavailable", "数据库暂不可用") from exc
        return {"status": "ok"}

    return app


app = create_app()
