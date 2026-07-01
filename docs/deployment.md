# 部署指南

## 前置要求

- 一台能够访问目标 MySQL/PostgreSQL 的 Linux 服务器
- Docker Engine 与 Docker Compose v2
- 服务器开放 TCP 443 给公司内网
- 最好准备公司内网域名和受信任 TLS 证书

## 首次部署

```bash
cp deploy/.env.example deploy/.env
```

编辑 `deploy/.env`：

- `SITE_ADDRESS`：同事访问的 IP 或域名。
- `DBW_ALLOWED_CIDRS`：API 可以连接的数据库网段。不要使用 `0.0.0.0/0`。
- `DBW_ALLOWED_PORTS`：通常只保留 `3306,5432`。
- `DBW_ALLOWED_SUFFIXES`：可选的数据库域名后缀，例如 `.corp.example`。

启动：

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
docker compose --env-file deploy/.env -f deploy/compose.yml ps
curl -kfsS https://127.0.0.1/health/ready
```

默认配置使用 Caddy 内部 CA。首次使用时浏览器不会信任该证书。正式开放前，应把 Caddy 根证书安全分发到公司终端的信任库，或者替换为公司 CA/受信任域名证书。不要为了消除证书提示而改用 HTTP，因为页面会传输数据库密码。

## 更新与回滚

```bash
git pull --ff-only
docker compose --env-file deploy/.env -f deploy/compose.yml build
docker compose --env-file deploy/.env -f deploy/compose.yml up -d
```

回滚时检出上一个已知良好提交并重复构建。服务端没有用户数据或数据库凭证需要迁移；浏览器本地保存的连接采用版本化加密格式。

## 公网数据库

公网目标默认会被 CIDR 规则拒绝。只将明确的数据库公网 IP 以 `/32` 或 `/128` 加入允许列表，并在数据库防火墙中只允许本服务器出口 IP。不要加入整个公网网段。

## 健康检查

- 存活：`GET /health/live`
- 就绪：`GET /health/ready`
- 日志：`docker compose -f deploy/compose.yml logs --since=10m api proxy`

日志不应包含数据库密码、连接串或 SQL 参数。匿名会话、数据库连接和事务均在服务进程内存中；服务重启会主动失效。
