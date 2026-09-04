import anyio
import httpx
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import Any

from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.client.streamable_http import streamable_http_client

from app.core.config import Settings
from app.core.exceptions import AppError
from app.models.mcp import MCPServer
from app.services.encryption import decrypt_secret
from app.services.mcp_security import validate_endpoint


class MCPClientError(Exception):
    pass


def _response_guard(max_bytes: int):
    async def guard(response: httpx.Response) -> None:
        if 300 <= response.status_code < 400:
            raise MCPClientError("MCP 重定向被拒绝")
        if response.headers.get("content-type", "").lower().startswith("text/event-stream"):
            length = response.headers.get("content-length")
            if length and int(length) > max_bytes:
                raise MCPClientError("MCP 响应超过大小限制")
            return
        body = await response.aread()
        if len(body) > max_bytes:
            raise MCPClientError("MCP 响应超过大小限制")
    return guard


@asynccontextmanager
async def _transport(server: MCPServer, settings: Settings, token: str | None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    guard = _response_guard(settings.mcp_max_response_bytes)
    timeout = httpx.Timeout(settings.mcp_request_timeout_seconds)
    if server.transport == "sse":
        def factory(**kwargs: Any):
            return httpx.AsyncClient(
                headers=kwargs.get("headers") or headers,
                auth=kwargs.get("auth"),
                timeout=kwargs.get("timeout") or timeout,
                follow_redirects=False,
                event_hooks={"response": [guard]},
            )
        async with sse_client(server.endpoint, headers=headers, timeout=settings.mcp_request_timeout_seconds, sse_read_timeout=settings.mcp_request_timeout_seconds, httpx_client_factory=factory) as streams:
            yield streams
    else:
        async with httpx.AsyncClient(headers=headers, timeout=timeout, follow_redirects=False, event_hooks={"response": [guard]}) as client:
            async with streamable_http_client(server.endpoint, http_client=client) as streams:
                yield streams


async def _request(server: MCPServer, settings: Settings, operation: str, tool_name: str | None = None, arguments: dict | None = None) -> Any:
    validate_endpoint(server.endpoint, settings.environment, resolve_dns=True)
    token = decrypt_secret(server.encrypted_token, settings)
    try:
        with anyio.fail_after(settings.mcp_request_timeout_seconds):
            async with _transport(server, settings, token) as (read_stream, write_stream, _):
                async with ClientSession(read_stream, write_stream, read_timeout_seconds=timedelta(seconds=settings.mcp_request_timeout_seconds)) as session:
                    await session.initialize()
                    if operation == "list_tools":
                        result = await session.list_tools()
                        return [tool.model_dump(by_alias=True, exclude_none=True) for tool in result.tools]
                    result = await session.call_tool(tool_name or "", arguments or {})
                    return result.model_dump(by_alias=True, exclude_none=True)
    except AppError:
        raise
    except (MCPClientError, httpx.HTTPError, TimeoutError) as exc:
        raise AppError(502, "mcp_call_failed", str(exc)[:500]) from exc
    except Exception as exc:
        raise AppError(502, "mcp_call_failed", "MCP Server 调用失败") from exc


def list_tools(server: MCPServer, settings: Settings) -> list[dict]:
    return anyio.run(_request, server, settings, "list_tools")


def call_tool(server: MCPServer, settings: Settings, tool_name: str, arguments: dict) -> dict:
    return anyio.run(_request, server, settings, "call_tool", tool_name, arguments)
