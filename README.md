# Database Workbench

一个面向公司内网的匿名 MySQL/PostgreSQL 网页工作台。用户在浏览器中输入自己的数据库账号；服务器直接连接目标数据库，但不会把凭证写入磁盘或日志。

## 功能

- 浏览数据库、Schema、表、字段和唯一键
- Monaco SQL 编辑、多标签式工作区、查询取消与结果分页
- CSV 导出、浏览器本地历史与收藏
- 显式事务与未提交事务离开提醒
- 受保护的单行插入、更新与删除
- 无 `WHERE` 写操作以及 `DROP`/`TRUNCATE` 二次确认
- IndexedDB 加密保存连接：PBKDF2-SHA-256 600,000 次 + AES-256-GCM
- CIDR、域名后缀和端口目标允许列表，防止服务成为网络扫描跳板

## 本地验证

```bash
make verify
```

启动开发服务：

```bash
cd api && DBW_ALLOWED_CIDRS=10.0.0.0/8 go run ./cmd/server
cd web && npm run dev
```

生产部署见 [docs/deployment.md](docs/deployment.md)，安全边界见 [docs/security.md](docs/security.md)。
