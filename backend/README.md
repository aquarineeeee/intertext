# Intertext 后端（阶段 8）

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
- `GET/POST /api/v1/books/{book_id}/notes`：读取或创建整本书的 Note
- `GET/PATCH/DELETE /api/v1/books/{book_id}/notes/{note_id}`：读取、保存或删除 Note
- `GET/POST /api/v1/books/{book_id}/conversations`：读取或创建对话
- `GET/PATCH/DELETE /api/v1/books/{book_id}/conversations/{conversation_id}`：读取、重命名或删除对话（删除时级联删除消息）
- `GET/POST /api/v1/books/{book_id}/conversations/{conversation_id}/messages`：读取或持久化消息；用户消息可带 `client_message_id` 幂等提交
- `GET/POST/PATCH/DELETE /api/v1/ai/providers`：管理当前用户的 AI Provider（API Key 只返回 `has_api_key`）
- `POST /api/v1/books/{book_id}/search`：受所有权和 PGroonga 约束的书籍检索
- `POST /api/v1/books/{book_id}/conversations/{conversation_id}/runs`：创建可恢复 AI 运行
- `GET /api/v1/ai/runs/{run_id}`、`POST /api/v1/ai/runs/{run_id}/cancel`：查看或取消运行
- `GET /api/v1/ai/runs/{run_id}/events`：SSE 事件流，支持 `Last-Event-ID` 或 `after` 续传
- `GET/POST/PATCH/DELETE /api/v1/mcp/servers`：配置当前用户的 MCP Server（Token 只返回 `has_token`）
- `POST /api/v1/mcp/servers/{server_id}/tools`：通过服务端发现并筛选 allowlist 中的只读工具
- `POST /api/v1/mcp/servers/{server_id}/tools/call`：调用 allowlist 中的只读工具并写入审计日志
- `GET /api/v1/mcp/servers/{server_id}/logs`：读取当前用户的 MCP 调用日志
- `GET /api/v1/export`（或 `/api/v1/data/export`）：导出当前用户数据为 UTF-8 JSON 下载；原始文件以 Base64 包含在导出中，Provider/MCP 密钥永不导出
- `POST /api/v1/import`（或 `/api/v1/data/import`）：导入 JSON 请求体或 multipart 的 `file`；按当前用户的文件 SHA-256 去重并返回导入统计

上传文件默认保存到进程当前工作目录下的 `storage/`（该目录已被 Git 忽略）。导入成功后会同步解析为章节和段落块；解析失败时书籍状态为 `failed`，可通过解析接口重试。章节正文统一使用 LF 换行，段落块的 `start_offset`/`end_offset` 是 UTF-16 code unit 偏移。单个文件最大 20 MiB；当前用户上传过相同 SHA-256 文件时会返回 `duplicate_file`。生产环境可将 `STORAGE_BACKEND` 设为 `s3` 并配置对应的 S3 兼容端点和凭据（同时安装 `boto3`）。

批注选区使用章节正文的 UTF-16 code unit 偏移，并保存选中文本用于定位校验；正文变化后会尝试唯一原文匹配，无法唯一定位时标记为 `orphaned` 并返回 `location_error`。已存在批注的书籍禁止重新解析，以避免偏移失效。

Note 内容最多 100,000 个字符，消息内容最多 20,000 个字符。服务端不保存 Note 草稿，只有创建或更新请求才会写入数据库。消息的 `client_message_id` 仅允许用于用户消息；同一对话内重复提交该 ID 返回原消息（HTTP 200），不会创建重复记录。助手消息的状态支持 `pending`、`streaming`、`completed`、`failed`、`cancelled` 和 `partial`。

阶段 6 需要 PostgreSQL 安装并启用 PGroonga（迁移 `0007_ai_gateway` 会显式创建扩展和索引）。AI Provider 支持 OpenAI、Anthropic 和 Ollama-compatible；API Key 使用服务端 Fernet 密文保存，任何响应和日志都不会返回明文。运行事件持久化后通过 SSE 增量发送，断线可按事件序号续传；服务重启会将未完成运行标记为 `partial` 或 `failed`。

错误统一为 `{ "error": { "code": "...", "message": "...", "details": [...] } }`。开发环境可使用 `COOKIE_SECURE=false`；生产环境必须使用 HTTPS 并设置 `COOKIE_SECURE=true`。

MCP 请求只由服务端发起，支持 Streamable HTTP 和 SSE。配置时仅允许 HTTPS（开发环境可使用 localhost），每次连接会重新解析域名并拒绝内网、环回、链路本地和云元数据地址，同时禁用重定向。服务器 Token 使用与 AI Provider 相同的 Fernet 加密存储，响应和日志不会返回 Token。工具调用必须同时出现在该 Server 的 allowlist 中且通过只读名称检查；MCP 永远不会获得写入本应用数据库的接口权限。调用受超时、响应大小和并发限制，`mcp_call_logs` 按用户永久保留。

## 阶段 8 运维

应用默认启用 CORS、Cookie 请求的 Origin/Referer CSRF 校验、按客户端地址的滑动窗口速率限制，以及 CSP、`X-Content-Type-Options`、`X-Frame-Options`、Referrer-Policy 和 HTTPS HSTS 响应头。通过 `CSRF_ENABLED`、`RATE_LIMIT_REQUESTS`、`RATE_LIMIT_WINDOW_SECONDS` 和 `SECURITY_HEADERS_ENABLED` 调整。速率限制存于进程内，当前 Docker 模板按单个 API worker 部署；若扩展为多 worker/多副本，应在网关或 Redis 层再加共享限流。生产环境必须使用 HTTPS、`COOKIE_SECURE=true`、强随机 `SECRET_KEY`/`ENCRYPTION_KEY`，并将 `ALLOWED_ORIGINS` 设置为实际前端来源。

仓库根目录的 `docker-compose.yml` 使用带 PGroonga 的 PostgreSQL 镜像；部署前复制并填写 `backend/.env`，再执行 `docker compose up -d --build`。Caddy 和 systemd 示例位于 `deploy/`。备份命令为 `powershell -File backend/scripts/backup.ps1` 或 `sh backend/scripts/backup.sh`，恢复命令为 `powershell -File backend/scripts/restore.ps1 -BackupDir <目录>` 或 `sh backend/scripts/restore.sh <目录>`；恢复后必须执行 `alembic upgrade head`、健康检查和完整测试，再切换流量。当前代码未连接任何远程服务器，真实发布需要目标主机、部署方式、域名/证书和数据库连接信息。
