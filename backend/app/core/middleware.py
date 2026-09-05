from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import Settings
from app.services.mcp_security import redact_secrets

logger = logging.getLogger("intertext.http")


class SecurityMiddleware(BaseHTTPMiddleware):
    """Small, dependency-free request guard for the single-process API worker."""

    def __init__(self, app, settings: Settings):
        super().__init__(app)
        self.settings = settings
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _rate_limited(self, key: str) -> bool:
        limit = max(0, self.settings.rate_limit_requests)
        window = max(1, self.settings.rate_limit_window_seconds)
        if limit == 0:
            return False
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] >= window:
                hits.popleft()
            if len(hits) >= limit:
                return True
            hits.append(now)
            return False

    def _csrf_failed(self, request: Request) -> bool:
        if not self.settings.csrf_enabled or request.method in {"GET", "HEAD", "OPTIONS", "TRACE"}:
            return False
        # Cookie-authenticated unsafe requests must carry an allowed Origin. Requests
        # without an Origin are retained for CLI/server-to-server clients.
        if not request.cookies:
            return False
        origin = request.headers.get("origin")
        if origin is None:
            referer = request.headers.get("referer")
            if referer:
                origin = referer.split("/", 3)[:3]
                origin = "/".join(origin) if isinstance(origin, list) else origin
        if not origin:
            return False
        allowed = {item.rstrip("/") for item in self.settings.allowed_origins}
        return origin.rstrip("/") not in allowed

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        client_host = request.client.host if request.client else "unknown"
        if not request.url.path.endswith("/health") and self._rate_limited(client_host):
            return JSONResponse(
                status_code=429,
                content={"error": {"code": "rate_limited", "message": "请求过于频繁"}},
                headers={"Retry-After": str(max(1, self.settings.rate_limit_window_seconds))},
            )
        if self._csrf_failed(request):
            return JSONResponse(status_code=403, content={"error": {"code": "csrf_failed", "message": "请求来源校验失败"}})

        started = time.perf_counter()
        response: Response
        try:
            response = await call_next(request)
        except Exception:
            logger.exception("request failed", extra={"request": redact_secrets({"method": request.method, "path": request.url.path})})
            raise
        duration_ms = round((time.perf_counter() - started) * 1000)
        logger.info("request", extra={"request": redact_secrets({"method": request.method, "path": request.url.path, "status": response.status_code, "duration_ms": duration_ms})})
        if self.settings.security_headers_enabled:
            response.headers.setdefault("Content-Security-Policy", "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'")
            response.headers.setdefault("X-Content-Type-Options", "nosniff")
            response.headers.setdefault("X-Frame-Options", "DENY")
            response.headers.setdefault("Referrer-Policy", "same-origin")
            if request.url.scheme == "https":
                response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response
