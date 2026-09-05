import json
import re
import threading
import time

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.db.session import get_db
from app.models.mcp import MCPCallLog, MCPServer
from app.models.user import User
from app.schemas.mcp import MCPCallRequest, MCPCallResponse, MCPServerCreate, MCPServerResponse, MCPServerUpdate
from app.services.encryption import encrypt_secret
from app.services.mcp_client import call_tool, list_tools
from app.services.mcp_security import redact_secrets, validate_endpoint


router = APIRouter(prefix="/mcp", tags=["mcp"])
_concurrency = threading.BoundedSemaphore(get_settings().mcp_max_concurrent_calls)
_WRITE_NAME = re.compile(r"(?:^|[_.\-])(create|delete|remove|update|write|set|put|post|patch|insert|upsert|append|execute|send)(?:$|[_ .\-])", re.I)


def _view(server: MCPServer) -> dict:
    return {
        "id": server.id,
        "name": server.name,
        "endpoint": server.endpoint,
        "transport": server.transport,
        "has_token": bool(server.encrypted_token),
        "tool_allowlist": server.tool_allowlist or [],
        "capabilities": server.capabilities,
        "enabled": server.enabled,
        "created_at": server.created_at,
        "updated_at": server.updated_at,
    }


def _server(db: DbSession, user: User, server_id: str) -> MCPServer:
    item = db.scalar(select(MCPServer).where(MCPServer.id == server_id, MCPServer.user_id == user.id))
    if item is None:
        raise AppError(404, "mcp_server_not_found", "MCP Server 不存在")
    return item


def _log_view(log: MCPCallLog) -> dict:
    return {
        "id": log.id,
        "mcp_server_id": log.mcp_server_id,
        "tool_name": log.tool_name,
        "request_params": log.request_params,
        "response_content": log.response_content,
        "status": log.status,
        "error_message": log.error_message,
        "duration_ms": log.duration_ms,
        "created_at": log.created_at,
    }


def _ensure_readonly(name: str, allowlist: list[str], global_allowlist: list[str] | None = None) -> None:
    if name not in allowlist:
        raise AppError(403, "mcp_tool_not_allowed", "该 MCP 工具不在只读 allowlist 中")
    if global_allowlist and name not in global_allowlist:
        raise AppError(403, "mcp_tool_not_allowed", "该 MCP 工具不在服务端安全 allowlist 中")
    if _WRITE_NAME.search(name):
        raise AppError(403, "mcp_tool_not_readonly", "只允许调用只读 MCP 工具")


@router.get("/servers", response_model=list[MCPServerResponse])
def list_servers(db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    return [_view(item) for item in db.scalars(select(MCPServer).where(MCPServer.user_id == user.id).order_by(MCPServer.created_at)).all()]


@router.post("/servers", response_model=MCPServerResponse, status_code=201)
def create_server(payload: MCPServerCreate, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    validate_endpoint(payload.endpoint, get_settings().environment, resolve_dns=False)
    item = MCPServer(user_id=user.id, name=payload.name, endpoint=payload.endpoint, transport=payload.transport, encrypted_token=encrypt_secret(payload.token, get_settings()) if payload.token else None, tool_allowlist=payload.tool_allowlist, enabled=payload.enabled)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _view(item)


@router.patch("/servers/{server_id}", response_model=MCPServerResponse)
def update_server(server_id: str, payload: MCPServerUpdate, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = _server(db, user, server_id)
    if payload.endpoint is not None:
        validate_endpoint(payload.endpoint, get_settings().environment, resolve_dns=False)
        item.endpoint = payload.endpoint
    for field in ("name", "transport", "tool_allowlist", "enabled"):
        value = getattr(payload, field)
        if value is not None:
            setattr(item, field, value)
    if payload.token is not None:
        item.encrypted_token = encrypt_secret(payload.token, get_settings())
    db.commit()
    db.refresh(item)
    return _view(item)


@router.delete("/servers/{server_id}", status_code=204)
def delete_server(server_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = _server(db, user, server_id)
    db.delete(item)
    db.commit()
    return Response(status_code=204)


@router.post("/servers/{server_id}/tools", response_model=list[dict])
def discover_tools(server_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = _server(db, user, server_id)
    if not item.enabled:
        raise AppError(409, "mcp_server_disabled", "MCP Server 已停用")
    tools = list_tools(item, get_settings())
    global_allowlist = get_settings().mcp_allowed_tools
    allowed = [tool for tool in tools if tool.get("name") in (item.tool_allowlist or []) and (not global_allowlist or tool.get("name") in global_allowlist) and not _WRITE_NAME.search(tool.get("name", ""))]
    item.capabilities = {"tools": tools}
    db.commit()
    return allowed


@router.post("/servers/{server_id}/tools/call", response_model=MCPCallResponse)
def invoke_tool(server_id: str, payload: MCPCallRequest, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = _server(db, user, server_id)
    if not item.enabled:
        raise AppError(409, "mcp_server_disabled", "MCP Server 已停用")
    _ensure_readonly(payload.tool_name, item.tool_allowlist or [], get_settings().mcp_allowed_tools)
    safe_args = redact_secrets(payload.arguments)
    log = MCPCallLog(user_id=user.id, mcp_server_id=item.id, tool_name=payload.tool_name, request_params=safe_args, status="running")
    db.add(log)
    db.commit()
    started = time.monotonic()
    acquired = _concurrency.acquire(timeout=get_settings().mcp_request_timeout_seconds)
    if not acquired:
        log.status = "rejected"
        log.error_message = "并发调用数已达到上限"
        log.duration_ms = int((time.monotonic() - started) * 1000)
        db.commit()
        raise AppError(429, "mcp_concurrency_limit", "MCP 并发调用数已达到上限")
    try:
        result = call_tool(item, get_settings(), payload.tool_name, payload.arguments)
        # Persist only a redacted copy. The live response may contain arbitrary
        # remote data, including credentials returned by a tool.
        serialized = json.dumps(redact_secrets(result), ensure_ascii=False, separators=(",", ":"))
        if len(serialized.encode("utf-8")) > get_settings().mcp_max_response_bytes:
            raise AppError(502, "mcp_response_too_large", "MCP 响应超过大小限制")
        log.status = "success"
        log.response_content = serialized
        log.duration_ms = int((time.monotonic() - started) * 1000)
        db.commit()
        return {"status": "success", "tool_name": payload.tool_name, "result": result, "log_id": log.id}
    except AppError as exc:
        log.status = "failed"
        log.error_message = exc.message[:500]
        log.duration_ms = int((time.monotonic() - started) * 1000)
        db.commit()
        raise
    finally:
        _concurrency.release()


@router.get("/servers/{server_id}/logs", response_model=list[dict])
def list_logs(server_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    _server(db, user, server_id)
    logs = db.scalars(select(MCPCallLog).where(MCPCallLog.user_id == user.id, MCPCallLog.mcp_server_id == server_id).order_by(MCPCallLog.created_at.desc()).limit(100)).all()
    return [_log_view(log) for log in logs]
