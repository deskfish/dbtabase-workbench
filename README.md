# Database Workbench

面向公司内网的多数据库网页工作台，支持 **MySQL**、**PostgreSQL**、**MongoDB** 和 **Redis**。用户在浏览器中输入自己的数据库账号，服务端直连目标实例，凭证仅保存在内存中，不会写入磁盘或日志。

## 功能概览

### 关系型数据库（MySQL / PostgreSQL）

- 浏览数据库、Schema、表、字段和索引
- Monaco SQL 编辑器、多标签工作区、查询取消与结果分页
- 表数据浏览、筛选、单行增删改
- Schema 设计：建表、改列、索引管理
- 显式事务与未提交事务离开提醒
- 无 `WHERE` 写操作及 `DROP` / `TRUNCATE` 二次确认

### MongoDB

- 浏览数据库与集合
- 文档视图与集合 Schema 推断
- MongoDB 查询编辑器

### Redis

- 按前缀分层的 Key 浏览
- Key 详情与 TTL 查看
- Redis 命令控制台

### 通用能力

- CSV 导出、浏览器本地查询历史与收藏
- IndexedDB 加密保存连接：PBKDF2-SHA-256（600,000 次）+ AES-256-GCM
- 团队连接模板复制与同步
- 可选 CIDR、域名后缀、端口目标允许列表（默认不限制，按需收紧）

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React、TypeScript、Vite、Monaco Editor |
| 后端 | Go |
| 部署 | Docker Compose、Caddy（HTTPS 反向代理） |

## 项目结构

```
database-workbench/
├── api/          # Go API 服务（连接、查询、元数据、Schema）
├── web/          # React 前端
├── deploy/       # Docker Compose 与部署配置
└── docs/         # 部署指南、安全模型、设计文档
```

## 快速开始

### 前置要求

- Go 1.22+
- Node.js 20+
- （可选）Docker Engine + Docker Compose v2

### 本地开发

```bash
# 启动 API（默认 http://localhost:8080）
cd api && go run ./cmd/server

# 另开终端，启动前端（默认 http://localhost:5173）
cd web && npm install && npm run dev
```

### 运行测试与构建

```bash
make verify    # 单元测试 + 构建 + race 检测 + 依赖审计
make test      # 仅运行测试
make build     # 仅构建
```

### Docker 部署

```bash
cp deploy/.env.example deploy/.env
# 编辑 deploy/.env 中的 SITE_ADDRESS 等配置

docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
curl -kfsS https://127.0.0.1/health/ready
```

详细步骤见 [docs/deployment.md](docs/deployment.md)。

## 安全说明

- 站点本身无登录体系，需由公司网络、VPN 或反向代理控制访问
- 数据库账号权限是最终安全边界，日常查询建议使用只读账号
- 浏览器本地加密不能防御已在页面执行的恶意脚本，请勿加载第三方脚本

完整安全模型见 [docs/security.md](docs/security.md)。

## 许可证

内部项目，仅供公司内网使用。
