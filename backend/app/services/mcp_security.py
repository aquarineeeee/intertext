import ipaddress
import socket
from urllib.parse import urlparse

from app.core.exceptions import AppError


BLOCKED_PORTS = {22, 23, 25, 110, 143, 389, 445, 5432, 6379, 9200, 11211, 2375, 2376}
METADATA_ADDRESSES = {"169.254.169.254", "100.100.100.200", "fd00:ec2::254"}


def _blocked_ip(value: str) -> bool:
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return True
    return value in METADATA_ADDRESSES or address.is_private or address.is_loopback or address.is_link_local or address.is_reserved or address.is_multicast or address.is_unspecified


def validate_endpoint(endpoint: str, environment: str = "development", *, resolve_dns: bool = True) -> str:
    parsed = urlparse(endpoint)
    if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username or parsed.password:
        raise AppError(422, "mcp_endpoint_invalid", "MCP 地址必须是有效的 HTTPS 地址")
    host = parsed.hostname.rstrip(".").lower()
    is_localhost = host in {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme != "https" and not (environment == "development" and is_localhost):
        raise AppError(422, "mcp_endpoint_insecure", "生产环境只允许 HTTPS MCP 地址")
    try:
        port = parsed.port
    except ValueError as exc:
        raise AppError(422, "mcp_endpoint_invalid", "MCP 地址端口无效") from exc
    if port in BLOCKED_PORTS:
        raise AppError(422, "mcp_endpoint_blocked", "MCP 地址使用了被禁止的管理端口")
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is not None and _blocked_ip(host) and not (environment == "development" and is_localhost):
        raise AppError(422, "mcp_endpoint_private", "MCP 地址不能指向内网或云元数据地址")
    if is_localhost and environment != "development":
        raise AppError(422, "mcp_endpoint_private", "生产环境不允许连接本机 MCP 地址")
    if resolve_dns and literal is None and not (environment == "development" and is_localhost):
        try:
            addresses = {item[4][0] for item in socket.getaddrinfo(host, port or 443, type=socket.SOCK_STREAM)}
        except OSError as exc:
            raise AppError(422, "mcp_dns_failed", "无法解析 MCP 地址") from exc
        if not addresses or any(_blocked_ip(address) for address in addresses):
            raise AppError(422, "mcp_endpoint_private", "MCP 地址解析到了内网或受保护地址")
    return endpoint


def redact_secrets(value: object) -> object:
    """Remove credentials from user-supplied arguments before permanent logging."""
    secret_words = ("token", "authorization", "api_key", "apikey", "secret", "password")
    if isinstance(value, dict):
        return {key: "[REDACTED]" if any(word in str(key).lower() for word in secret_words) else redact_secrets(item) for key, item in value.items()}
    if isinstance(value, list):
        return [redact_secrets(item) for item in value]
    return value
