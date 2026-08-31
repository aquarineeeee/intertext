from datetime import datetime
from uuid import uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Book(Base):
    __tablename__ = "books"
    __table_args__ = (
        Index("ix_books_user_id", "user_id"),
        CheckConstraint("status IN ('uploaded', 'parsing', 'ready', 'failed')", name="ck_books_status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="uploaded")
    parse_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="books")
    import_files = relationship("ImportFile", back_populates="book", cascade="all, delete-orphan")
    chapters = relationship("Chapter", back_populates="book", cascade="all, delete-orphan", order_by="Chapter.chapter_index")
    document_chunks = relationship("DocumentChunk", back_populates="book", cascade="all, delete-orphan")

    @property
    def import_file(self) -> "ImportFile | None":
        return self.import_files[0] if self.import_files else None


class ImportFile(Base):
    __tablename__ = "import_files"
    __table_args__ = (UniqueConstraint("user_id", "file_hash", name="uq_import_files_user_hash"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    book_id: Mapped[str] = mapped_column(String(36), ForeignKey("books.id", ondelete="CASCADE"), nullable=False)
    file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    file_format: Mapped[str] = mapped_column(String(10), nullable=False)
    file_size: Mapped[int] = mapped_column(nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="import_files")
    book = relationship("Book", back_populates="import_files")
