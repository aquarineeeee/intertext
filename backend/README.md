# Intertext 后端（阶段 1）

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

错误统一为 `{ "error": { "code": "...", "message": "...", "details": [...] } }`。开发环境可使用 `COOKIE_SECURE=false`；生产环境必须使用 HTTPS 并设置 `COOKIE_SECURE=true`。
