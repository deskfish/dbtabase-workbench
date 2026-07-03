# MongoDB & Redis 工作台扩展设计

## 问题

现有 Database Workbench 仅支持 MySQL/PostgreSQL，围绕 `*sql.DB` + SQL 工作流构建。团队需要在同一壳层内支持 MongoDB 文档浏览/聚合查询/索引管理，以及 Redis 键浏览/命令台/键 CRUD。

## 目标

- 扩展 `driver` 为 `mysql | postgres | mongodb | redis`，连接侧栏、团队分享、加密存储、安全链路保持不变。
- MongoDB：库 → 集合树、文档浏览（Filter + 分页 + CRUD）、聚合查询、集合结构（推断字段 + 索引 + Validator 只读）。
- Redis：DB 0–15 切换、SCAN 键列表、按类型键详情编辑、命令台（禁止 FLUSHALL/CONFIG/DEBUG）。
- 通过连接级 `capabilities` 驱动 UI 显隐，前端不猜测驱动能力。

## 非目标

- 不实现 MongoDB 跨库 JOIN、GridFS 管理、Change Streams。
- 不实现 Redis Cluster 槽迁移、Pub/Sub 订阅、Lua 脚本管理。
- 不改变 MySQL/PostgreSQL 现有 SQL/Schema 行为。

## 架构

### 连接抽象

```go
type Handle struct {
    Driver Driver
    Config ConnectionInput
    SQL    *sql.DB           // mysql/postgres
    Mongo  *mongo.Client     // mongodb
    Redis  *redis.Client     // redis
}
```

`session.Store` 存储 `*Handle`；SQL 路由通过 `Handle.SQLDB()` 获取；Mongo/Redis 走专属端点。

### Capabilities

```json
{
  "queryLanguage": "sql | mongo | redis",
  "documentBrowse": true,
  "aggregateQuery": true,
  "indexEdit": true,
  "schemaEdit": false,
  "keyBrowse": true,
  "commandConsole": true,
  "rowEdit": true,
  "supportsTransactions": true
}
```

### API 端点（新增）

| 端点 | 驱动 | 用途 |
|------|------|------|
| `GET .../capabilities` | 全部 | 返回连接能力 |
| `POST .../mongo/find` | mongodb | 文档查询 |
| `POST .../mongo/aggregate` | mongodb | 聚合管道 |
| `POST .../mongo/documents` | mongodb | insert/update/delete |
| `GET .../mongo/collections/{name}` | mongodb | 集合详情 |
| `POST .../mongo/collections/{name}/indexes/preview` | mongodb | 索引预览 |
| `POST .../mongo/collections/{name}/indexes/execute` | mongodb | 索引执行 |
| `GET .../redis/keys` | redis | SCAN 分页 |
| `GET .../redis/keys/{key}` | redis | 键详情 |
| `PUT .../redis/keys/{key}` | redis | 保存键值 |
| `DELETE .../redis/keys/{key}` | redis | 删除键 |
| `POST .../redis/keys/{key}/ttl` | redis | 设置 TTL |
| `POST .../redis/commands` | redis | 命令台 |

### 前端工作区

| 驱动 | 对象树 | 工作区 Tab |
|------|--------|-----------|
| MongoDB | 库 → 集合 | 文档 · 聚合查询 · 集合结构 |
| Redis | DB → 键 | 键详情 · 命令台 |

## 安全

- 默认端口白名单增加 27017、6379。
- MongoDB：禁止 `dropDatabase` 无确认；文档修改必须带 `_id`。
- Redis：命令黑名单 `FLUSHALL FLUSHDB CONFIG DEBUG SHUTDOWN`；SCAN 代替 KEYS；单次 SCAN count ≤ 500。
- 查询/命令超时 30s；Mongo 结果最大 10,000 文档；Redis 命令单次响应最大 1MB。

## 分期（本次全部交付）

P0+P1 完整功能：Mongo 文档 CRUD + 聚合 + 索引；Redis 键 CRUD + 命令台 + 全类型值编辑。
