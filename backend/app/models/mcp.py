from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MCPServer(Base):
    __tablename__ = "mcp_servers"
    __table_args__ = (
        CheckConstraint("transport IN ('streamable-http', 'sse')", name="ck_mcp_servers_transport"),
        UniqueConstraint("user_id", "name", name="uq_mcp_servers_user_name"),
        Index("ix_mcp_servers_user_id", "user_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    endpoint: Mapped[str] = mapped_column(String(1000), nullable=False)
    transport: Mapped[str] = mapped_column(String(24), nullable=False)
    encrypted_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    capabilities: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="mcp_servers")
    call_logs = relationship("MCPCallLog", back_populates="server", passive_deletes=True)
    tool_configs = relationship("MCPToolConfig", back_populates="server", cascade="all, delete-orphan")


class MCPCallLog(Base):
    __tablename__ = "mcp_call_logs"
    __table_args__ = (Index("ix_mcp_call_logs_user_created", "user_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    mcp_server_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("mcp_servers.id", ondelete="SET NULL"), nullable=True)
    tool_name: Mapped[str] = mapped_column(String(255), nullable=False)
    request_params: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    response_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ai_run_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("ai_runs.id", ondelete="SET NULL"), nullable=True)
    provider_call_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    invocation_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    exposed_tool_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="mcp_call_logs")
    server = relationship("MCPServer", back_populates="call_logs")
    ai_run = relationship("AIRun")


class MCPToolConfig(Base):
    __tablename__ = "mcp_tool_configs"
    __table_args__ = (
        UniqueConstraint("mcp_server_id", "tool_name", name="uq_mcp_tool_configs_server_tool"),
        Index("ix_mcp_tool_configs_server_id", "mcp_server_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    mcp_server_id: Mapped[str] = mapped_column(String(36), ForeignKey("mcp_servers.id", ondelete="CASCADE"), nullable=False)
    tool_name: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    input_schema: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    server = relationship("MCPServer", back_populates="tool_configs")
