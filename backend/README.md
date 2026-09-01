# Intertext 后端（阶段 4）

这是 PostgreSQL 专用的 FastAPI 后端基础服务。认证使用 Argon2id 密码哈希、服务端会话表和签名的 HttpOnly Cookie；客户端不能提交或覆盖 `user_id`。

## 启动

1. 创建 PostgreSQL 数据库和用户，并复制 `.env.example` 为 `.env`，填写 `DATABASE_URL` 和随机 `SECRET_KEY`。
2. 安装依赖：`python -m pip install -r requirements.txt`
3. 执行迁移：`alembic upgrade head`
4. 启动服务：`uvicorn app.main:app --reload --port 8000`

接口：

- `GET /health`、`GET /api/v1/health`：数据库就绪检查
- `POST /api/v1/auth/register`：注册并建立登录会话
- `POST /api/v1/auth/login`：登录并建立登录会话
- `POST /api/v1/auth/logout`：注销当前会话
- `GET /api/v1/auth/me`：读取当前用户（需要 Cookie）
- `POST /api/v1/books/import`：上传 EPUB/TXT 原始文件（需要 Cookie）
- `GET /api/v1/books`、`GET /api/v1/books/{book_id}`：读取当前用户的书籍元数据
- `DELETE /api/v1/books/{book_id}`：删除书籍及原始文件
- `POST /api/v1/books/{book_id}/parse`：重新解析书籍
- `GET /api/v1/books/{book_id}/chapters`：读取章节列表
- `GET /api/v1/books/{book_id}/chapters/{chapter_id}`：读取章节正文及段落块（也支持 `/content` 后缀）
- `GET/PUT /api/v1/books/{book_id}/progress`：读取或保存当前用户最近阅读的章节
- `GET/POST /api/v1/books/{book_id}/annotations`：读取或创建章节批注
- `PATCH/DELETE /api/v1/books/{book_id}/annotations/{annotation_id}`：编辑或删除批注

上传文件默认保存到进程当前工作目录下的 `storage/`（该目录已被 Git 忽略）。导入成功后会同步解析为章节和段落块；解析失败时书籍状态为 `failed`，可通过解析接口重试。章节正文统一使用 LF 换行，段落块的 `start_offset`/`end_offset` 是 UTF-16 code unit 偏移。单个文件最大 20 MiB；当前用户上传过相同 SHA-256 文件时会返回 `duplicate_file`。生产环境可将 `STORAGE_BACKEND` 设为 `s3` 并配置对应的 S3 兼容端点和凭据（同时安装 `boto3`）。

批注选区使用章节正文的 UTF-16 code unit 偏移，并保存选中文本用于定位校验；正文变化后会尝试唯一原文匹配，无法唯一定位时标记为 `orphaned` 并返回 `location_error`。已存在批注的书籍禁止重新解析，以避免偏移失效。

错误统一为 `{ "error": { "code": "...", "message": "...", "details": [...] } }`。开发环境可使用 `COOKIE_SECURE=false`；生产环境必须使用 HTTPS 并设置 `COOKIE_SECURE=true`。
