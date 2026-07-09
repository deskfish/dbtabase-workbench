# Ops Console 合并功能与 UI 审计

日期：2026-07-09  
范围：`database-workbench` + `log-lens` 合并后的 Go 单服务、React 前端、PostgreSQL/Redis 运行环境。

## 结论

合并后的方向是对的：一个服务、一个容器入口、统一登录/团队/连接库、日志能力进入同一套权限体系。当前这轮已经补齐了日志页最明显的功能洞：本地上传、SSH 远程文件导入、SSH 远程目录浏览、实时 tail、tail 行落库检索。

但 UI 还没有达到“完全统一设计系统”的状态。主要问题不是页面不可用，而是历史页面仍保留了许多直接写在业务组件里的原生 `input` / `textarea` / `checkbox` 和 inline style。它们有些被 CSS 包住了，有些仍然像从旧项目临时搬过来。这会造成不同页面的交互手感、聚焦态、密度和错误提示不一致。

## 功能迁移完整度

| 模块 | 当前状态 | 证据/说明 |
| --- | --- | --- |
| 单服务/单容器 | 已迁移 | 根 `Dockerfile` 由 Node 构建前端，再复制到 Go embed，最终只运行 `/ops-console`。 |
| PostgreSQL + Redis 运行依赖 | 已迁移 | `deploy/compose.yml` 只有 `app/postgres/redis` 三个服务；身份、连接、日志走 PostgreSQL，登录会话走 Redis。 |
| 登录/用户/团队 | 已迁移 | 支持用户创建/编辑、团队创建/编辑/删除、成员添加/编辑/删除、最后管理员保护。 |
| 团队数据隔离 | 已迁移 | 日志会话、连接库都按 personal/team scope 授权；团队成员可读团队资源，团队管理员可写。 |
| 数据库连接库 | 已迁移 | 统一 registry 支持 database/ssh 两类连接，密钥加密保存，列表响应不泄露 secret。 |
| 本地日志上传/索引/搜索 | 已迁移 | 日志会话可上传 `.log/.txt`，写入 `log_entries`，支持关键字、级别、服务/节点树。 |
| SSH 连接用于日志 | 已迁移 | 日志模块通过 `/api/logs/ssh-connections` 复用统一连接库中的 `kind=ssh` 连接。 |
| SSH 远程目录浏览 | 已迁移 | 后端使用 SFTP 浏览目录，前端可进入目录/返回上级。 |
| SSH 远程文件导入 | 已迁移 | `/api/logs/sessions/{id}/ssh/import` 通过 SFTP 流式读取远程文件并索引。 |
| SSH tail | 已迁移 | `/api/logs/sessions/{id}/tail` 执行远端 `tail -F`，SSE 返回实时行，并写入日志索引。 |
| 远程递归扫描日志 | 已迁移 | `/api/logs/ssh/scan` 通过 SFTP 递归查找日志文件，限制最大深度和最大结果数。 |
| 批量远程导入 | 已迁移 | 前端支持扫描/浏览结果中的“导入全部”，逐个远程文件导入索引。 |
| Log Lens 旧异步 worker 队列 | 未保留为独立服务 | 当前合并方案把导入/索引放进 Go 服务同步处理；如果未来要处理超大日志/长时间批量任务，需要补后台任务队列和进度 UI。 |

## UI 审计

### 主要合理之处

- 信息架构比原两个项目更清晰：连接、工作台、日志、设置进入同一个 app shell。
- 日志页现在从“迁移占位页”变成真实工作台：会话、上传、SSH、tail、搜索在一页闭环。
- 团队/成员管理已经和业务权限形成实际关系，不再只是静态管理页。

### 主要不合理之处

1. 日志页信息密度偏高

   上传、SSH 导入/tail、搜索都在同一页，对新用户是完整的，但视觉上需要后续加分段导航或折叠策略。当前可用，但不是最终 10/10。

2. 原生控件残留较多

   扫描发现残留集中在：

   - `web/src/pages/ConnectionsPage.tsx`
   - `web/src/pages/SettingsPage.tsx`
   - `web/src/pages/LogsPage.tsx`
   - `web/src/features/redis/*`
   - `web/src/features/mongo/*`
   - `web/src/features/schema/*`
   - `web/src/features/table/*`
   - `web/src/features/connections/*`

   根因：合并优先保证功能可用，旧 workbench 的表格/编辑器/弹窗组件大多是业务内联实现；只做了 `SelectControl` / `ComboboxControl` 的统一，未建立完整 `TextField`、`TextArea`、`Checkbox`、`FilePicker`、`DialogForm` 组件层。

3. inline style 仍然破坏设计一致性

   Redis/Mongo 相关页面还有不少 `style={{...}}`，这会绕过 token、响应式和暗色主题控制。视觉上容易出现“某一块不是同一个产品”的感觉。

4. 文件上传仍是原生 file input

   这不是功能问题，但体验不像产品级日志工具。建议下一轮改成统一 Dropzone：拖拽、文件名、大小、状态、错误提示一体化。

5. 长任务反馈还不够

   SSH 导入和本地大文件索引现在可用，但缺少旧 Log Lens 那种后台任务进度条。大日志时用户会感觉“卡住”。这是功能完整度之后最该补的体验层。

## 为什么还有原生前端组件？

不是浏览器自己给的，也不是框架限制，而是历史实现没有抽出统一表单组件。当前项目里存在三类控件：

- 已统一：自定义 `SelectControl`、`ComboboxControl`。
- 半统一：普通 `input` 被页面 CSS 包住，视觉接近但交互/错误/焦点不完全统一。
- 未统一：`textarea`、`checkbox`、file input、部分 Redis/Mongo inline style。

这次我没有一口气替换所有原生控件，因为这会触碰数据库表格编辑、Mongo/Redis 编辑器、schema 设计器等高风险交互，容易影响功能。更稳妥的路径是先把日志功能补齐并上线，再按组件层逐步替换。

## 推荐后续 UI 整改顺序

1. 抽 `TextField/TextArea/Checkbox/FilePicker/FormRow` 五个基础组件。
2. 先替换日志页和连接页表单，因为它们是合并后最常用入口。
3. 再替换设置页团队/成员表单，确保权限管理体验一致。
4. 最后处理 Redis/Mongo/Schema/Table 编辑器，因为这些区域最容易引入功能回归。
5. 给 SSH 导入、本地上传和批量导入补后台任务进度。

## 当前验证

- `go test ./...` 通过。
- `npm test -- --run src/pages/LogsPage.test.tsx` 通过。
- `npm run build` 通过。
- `make web-assets` 已把最新前端产物同步到 Go embed 目录。
