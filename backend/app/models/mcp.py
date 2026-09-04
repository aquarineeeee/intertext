from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MCPServer(Base):
    __tablename__ = "mcp_servers"
    __table_args__ = (
        CheckConstraint("transport IN ('streamable-http', 'sse')", name="ck_mcp_servers_transport"),
        Index("ix_mcp_servers_user_id", "user_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    endpoint: Mapped[str] = mapped_column(String(1000), nullable=False)
    transport: Mapped[str] = mapped_column(String(24), nullable=False)
    encrypted_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    tool_allowlist: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    capabilities: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="mcp_servers")
    call_logs = relationship("MCPCallLog", back_populates="server", passive_deletes=True)


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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="mcp_call_logs")
    server = relationship("MCPServer", back_populates="call_logs")
