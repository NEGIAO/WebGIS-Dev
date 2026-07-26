# L2 管理员面板对齐（配置架构计划·阶段 3 完成）

## 日期和时间

2026-07-26 18:31（北京时间）

## 事件逻辑链条分析

- **核心症状**：三层配置模型中 L2（Admin + DB）缺一张权威对照表——运营/接手者无法快速回答「某个 L2 项在哪个菜单改、存在哪张表、后端从哪读」；管理员在面板内**看不到 L3 环境密钥是否已配置**（判断 OAuth/SMTP/Agent 可用性需要去 HF 控制台或翻启动日志）；面板文案未与根 `.env.example` 分层清单交叉引用，存在双源脱节风险。
- **根本原因**：L2 能力（api_keys 池、system_config、公告等）是多次迭代累加的，从未统一盘点；阶段 2 之前没有统一 loader，无法安全地把 L3 状态（仅布尔）暴露给管理端。
- **受影响模块**：后端 admin 概览接口、前端管理员控制台与 API 密钥管理面板、配置文档与根清单。
- **解决思路**：先盘点（代码级枚举 system_config keys / api_keys key_names / Admin UI 卡片与端点）→ 后端基于阶段 2 的 `config.get_settings()` 输出 8 项布尔 → 前端只读徽章展示 + 文案交叉链接 → 对照表落档 `configuration.md`。

## 修改内容

1. **后端 `api/admin.py`**：新增 `_get_l3_env_status()`（SUPER_USER、OAUTH_STATE_SECRET、Google OAuth、GitHub OAuth、SMTP、AGENT_API_KEY(环境)、AMAP(环境)、Supabase 共 8 项布尔，取自统一 loader，函数级注释明确「仅布尔、绝不回显明文」）；`GET /api/admin/overview` 响应新增 `l3_env_status` 字段（增量、向后兼容）。
2. **前端 `AdminControlPanel.vue`**：overview 状态新增 `l3_env_status` 默认值与 `L3_STATUS_LABELS` 映射；概览卡下方新增「🔐 环境密钥状态（L3 · HF Secrets · 只读）」卡片（徽章绿=已配置/橙=未配置），说明文案指向根 `.env.example` 与 configuration.md；「LLM 对话参数配置」描述补充 L2 优先级与 [L2] 段登记引用；新增 `.env-status-*` 样式（随刷新概览按钮一起更新）。
3. **前端 `ApiKeysManagementPanel.vue`**：头部新增 `layer-note` 说明——密钥池存于 `api_keys` 表（L2，优先于环境变量），L3 绝密不进本面板，键名登记见根 `.env.example` [L2] 段；配套小字样式。
4. **文档 `configuration.md`**：新增「L2 对照表（配置项 ↔ Admin 菜单 ↔ 存储位置 ↔ 后端读取）」12 行全量表（天地图/Cesium/高德/Agent key 池、默认 AI、Agent 参数、配额、默认底图、联系方式、公告、管理员头像），并注明「仅 env」例外清单与 L3 状态可见性来源。
5. **根 `.env.example`**：[L2] 段补充各组配置的 Admin 菜单位置注释、`L2_AMAP_KEY`/`L2_AGENT_API_KEY` 池条目（优先于 L3 env 的语义标注）与对照表链接。
6. **计划文档**：`configuration-architecture-plan.md` 标注阶段 3 完成（见文件头状态行与阶段标题）。

## 修改原因

执行配置架构计划第 3 步（阶段 3）：让「运营改 token/模型只走 Admin」有据可查，绝密与运营项边界在 UI 层可见、可自检；消除 L2 知识只存在于代码里的状态。

## 影响范围

admin 概览接口（响应新增字段，兼容旧前端）、管理员控制台 UI（新增只读卡片，不改既有交互）、API 密钥管理 UI（仅文案）、配置文档与根清单。**不改变**：任何 L2 读写逻辑、数据库 schema、普通用户可见接口（l3_env_status 仅 admin 鉴权可见）。

## 优化解决方案

L3 状态布尔由后端统一 loader 单点产出（复用阶段 2 的 `BackendSettings`，含别名解析），避免前端或 admin.py 重复拼装 env 判断；徽章卡片与 API 密钥面板的 DB `is_set` 徽章形成互补视图（env 侧 vs DB 池侧），文案明确「DB 池优先于环境变量」的解析顺序，防止运营误判生效来源。

## 性能指标

非性能任务。overview 接口新增 8 个布尔计算（读取 lru_cache 快照），开销可忽略。

## 测试方案

- **静态**：`python -m py_compile api/admin.py` 通过；两个 Vue 组件 `eslint` 零告警。
- **逻辑断言**：隔离复刻 `_get_l3_env_status` 逻辑（沙盒无 fastapi），验证真值/假值场景（设 SUPER_USER/SMTP → true，未设 OAuth → false）、全字段布尔类型、序列化输出无明文泄漏，全部通过。
- **待实机回归**：admin 登录 → 管理员控制台应出现「环境密钥状态」卡片且与 HF Secrets 实际一致；`curl -H "Authorization: Bearer <admin-token>" /api/admin/overview` 返回 `l3_env_status`；API 密钥管理页头部出现分层说明；非 admin 访问 overview 仍 403。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\backend\api\admin.py
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\UserCenter\AdminControlPanel.vue
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\UserCenter\ApiKeysManagementPanel.vue
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\configuration.md
- D:\Dev\GitHub\WebGIS-Dev\.env.example
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\configuration-architecture-plan.md
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.8，三处 + 版本表裁剪至最新三条）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.8 条目）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-admin-panel-l2-alignment-phase3.md（本日志）

> 备注：本次无文件增删，三个文件树文档无需变更；未执行任何 git 操作，提交由用户决策。
