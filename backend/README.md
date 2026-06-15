---
title: WebGIS
emoji: 🌍
colorFrom: blue
colorTo: green
sdk: docker
pinned: false
---

!!!!!!!!!!开头不可以改变，否则服务器罢工！！！！！！！！！！

# WebGIS Backend
Powered by FastAPI and Docker.

WebGIS 后端服务，当前包含五大核心能力：
- Google 瓦片代理：GET /api/tile/{z}/{x}/{y}
- 通用流式代理：GET /proxy/{target_url:path}（Provider Agnostic）
- 访客地理统计：POST /api/log-visit
- 真实用户登录系统：/api/auth/*（邮箱账号、旧用户绑定迁移、三类身份）
- Agent 对话后端代理：/api/agent/chat/*（按身份配额）
- 运行时地图 Token 配置：GET /api/runtime-config/map-tokens 下发天地图/Cesium 主备 token 池，前端直连第三方服务
- 🆕 在线底图下载：POST /api/download/tasks（异步任务 + GeoTIFF 输出）
- 🆕 GCJ-02 实时纠偏：GET /proxy/gcj2wgs/* 和 /proxy/wgs2gcj/*
- 🆕 空间分析 API：POST /api/v1/spatial/analysis（缓冲区/叠加/凸包/泰森多边形/空间聚合/多环缓冲区/几何简化/渔网分析），统一 EPSG:3857 平面坐标系，基于 Shapely 2.x + pyproj

## 0. 项目结构（2026-06-15 更新）

### V3.3.5 (2026-06-15) - 运行时地图 Token 池 + 四类 API 备用 Token

**后端变更：**
- `api_keys_management.py` 新增 `api_key_backups` 表，支持高德、Agent、天地图、Cesium Ion 四类 API 的任意数量备用 token
- 新增 `/api/admin/api-keys/{key_name}/backups` 系列接口，用于管理员追加、替换、删除备用 token
- `/api/runtime-config/map-tokens` 返回天地图 TK 与 Cesium Ion Token 池，前端启动读取一次后直连第三方服务
- 高德外部代理按主 token → 备用 token 顺序调用，遇到 key 无效、权限或配额类 infocode 自动尝试下一枚
- Agent 平台上游调用与模型列表请求接入管理员平台 key 候选池，主 key 不可用时自动尝试备用 key

**安全说明：**
- 浏览器直连 token 无法完全隐藏，必须在天地图/Cesium ion 服务商后台限制域名、Referer、权限与配额
- 可选环境变量 `RUNTIME_CONFIG_ALLOWED_ORIGINS` 可限制哪些前端 Origin/Referer 允许读取运行时地图 token 池

详见 [`../Docs/26-06/26-06-15/2026-06-15-readme-structure-sync-v335.md`](../Docs/26-06/26-06-15/2026-06-15-readme-structure-sync-v335.md)

### V3.3.4 (2026-06-14) - Cesium 三维分析控制面板增强 + 掩膜分析（水体模拟）

> 本次版本为前端 Cesium 三维模块增强，后端 API 与后端文件结构无变更。本 README 按项目规范同步版本与结构说明。

> 2026-06-14 补充说明：前端已修复高德 AOI 手动粘贴时 `@` 分隔独立区域的解析问题；本次仍无后端文件结构变更。

> 2026-06-14 追加说明：前端又新增了纯坐标串 AOI 注入能力，仍不涉及后端文件结构变更。

**前端同步记录（本次无后端结构变更）：**
- Cesium 三维模块统一控制面板继续集成场景导航、高级视觉特效、风场和水体模拟参数
- 图层 tab 中底图源、地形、叠加层改为可折叠卡片，升级后初始状态默认收起
- 地形新增 ArcGIS World Elevation 3D；叠加层新增 ArcGIS Open3D Buildings 3DObject SceneServer 图层开关
- 流体参数新增 `?` 悬浮说明，解释阈值、混合、光强、水位、水色等控制含义
- 水体模拟支持水色调色板，颜色变化实时写入 WebGL shader uniform
- 水体外包盒高度改为按捕捉区域高程最低点到最高点动态计算，不再使用固定高度
- 鼠标点击点三维坐标高程作为初始水位，并参与初始外包盒高程范围
- 水位滑杆值域来自采样高程范围，拖动后重置并重新计算流体模拟
- 流体运行时恢复顶部薄层动画水面效果，保留绝对水位模式下的顶层动态表现
- 本次前端同步修改 `frontend/src/components/Cesium/CesiumToolPanel.vue`、`frontend/src/components/Cesium/composables/useCesiumToolModules.js`、`frontend/src/components/Cesium/FluidSimulation/FluidSimulationPanel.vue`、`frontend/src/components/Cesium/FluidSimulation/fluidRuntime.js`、`frontend/src/components/Map/MapContainer.vue`

详见 [`../Docs/26-06/26-06-14/2026-06-14-cesium-tool-panel-fluid-simulation-v334.md`](../Docs/26-06/26-06-14/2026-06-14-cesium-tool-panel-fluid-simulation-v334.md)

### V3.3.3 (2026-06-11) - Auth 中间件收敛 + 调试接口清理

**修改文件：**

| 文件 | 说明 |
|------|------|
| `app.py` | `check_startup_state` 中间件重构：白名单前置 + 正常路径幂等 `init_auth_storage()` |
| `api/auth/dependencies.py` | 移除 `require_login` / `require_api_access_or_guest` 中重复的 `init_auth_storage()` |
| `api/auth/routes.py` | 移除 7 个路由中的 `init_auth_storage()` + 删除 `/storage-path` 调试接口 |

**功能说明：**
- `init_auth_storage()` 调用从 9 处收敛到 1 处中间件，路由函数回归纯业务逻辑
- 白名单路径（`/`、`/health`、`/docs`、`/redoc`、`/openapi.json`、`/api/info`）直接放行，不触发数据库检查
- 正常路径幂等检查：`_auth_storage_ready=True` 时直接返回，无额外开销
- 降级路径保持原有自动恢复逻辑

详见 [`../Docs/26-06/26-06-11/2026-06-11-cesium-tool-panel-fluid-simulation.md`](../Docs/26-06/26-06-11/2026-06-11-cesium-tool-panel-fluid-simulation.md)

### V3.3.3 (2026-06-11) - 邮箱账号化与旧用户绑定迁移

**运行版本说明：**
- Dockerfile 使用 `python:3.12-slim` 作为后端运行镜像。
- `pyproject.toml` 的 `requires-python = ">=3.9"` 表示代码语法保持最低兼容线，不代表当前 Docker 运行时是 Python 3.9。

**修改文件：**

| 文件 | 说明 |
|------|------|
| `api/auth/constants.py` | 增加昵称、邮箱、密码校验辅助函数 |
| `api/auth/models.py` | 注册改为 `email + email_code + display_name + password`，新增绑定邮箱和修改昵称请求模型 |
| `api/auth/db.py` | 邮箱账号迁移前自动备份旧认证数据库主文件与 WAL/SHM |
| `api/auth/schema.py` | 旧库备份后原地新增 `users.display_name` 与 `sessions.requires_email_binding` 迁移 |
| `api/auth/user.py` | 邮箱账号创建、旧 `username` 兼容键生成、昵称更新 |
| `api/auth/session.py` | 会话绑定状态、邮箱用户查询、受限 session 识别 |
| `api/auth/dependencies.py` | 受限绑定 session 返回 `403 EMAIL_BINDING_REQUIRED` |
| `api/auth/routes.py` | 邮箱注册/登录/绑定/重置、泛化重置提示、统一用户响应字段 |
| `api/auth/system_config.py` | 系统配置读写，含管理员头像索引持久化读取 |
| `api/statistics.py` | 用户中心统计接口补齐昵称、邮箱、头像和绑定状态字段，避免覆盖认证用户对象 |
| `api/auth/__init__.py` | 导出新增请求模型和认证辅助函数 |

**功能说明：**
- 新注册用户必须完成邮箱验证码校验，邮箱为唯一登录账号。
- `username` 保留为内部兼容键，继续支撑历史表关联；`display_name` 用作昵称，可重复、可修改。
- 无邮箱旧用户可用旧用户名和密码登录一次，但只获得受限 session，用于绑定邮箱。
- 旧数据库无需强制重建；首次检测到旧 schema 时会先备份到 `migration_backups/`，再通过 `ALTER TABLE` 原地迁移并回填昵称。
- 绑定邮箱成功后注销该账号所有旧 token 并签发完整 session；后续使用邮箱登录和密码重置。
- 用户中心统计接口返回完整认证用户字段，中文昵称和自定义头像索引不会被聚合刷新覆盖。
- 管理员头像索引从 `system_config.admin_avatar_index` 统一回读，避免保存后被刷新回默认头像。
- 游客 `user/123` 和管理员账号流程保持兼容。

详见 [`../Docs/26-06/26-06-11/2026-06-11-email-account-auth-migration.md`](../Docs/26-06/26-06-11/2026-06-11-email-account-auth-migration.md) | [`../Docs/26-06/26-06-11/2026-06-11-fix-display-name-avatar-persistence.md`](../Docs/26-06/26-06-11/2026-06-11-fix-display-name-avatar-persistence.md)

### V3.3.2 (2026-06-09) - SQLite 恢复修复 + 北京时间日志 + 整点报时 + 前端天气图表/罗盘 HUD UI

**新增文件：**

| 文件 | 说明 |
|------|------|
| `utils/__init__.py` | 工具包初始化 |
| `utils/time_utils.py` | 北京时间获取函数 + 整点报时异步任务（含异常保护）+ BeijingTimeFormatter |

**修改文件：**

| 文件 | 说明 |
|------|------|
| `api/auth/db.py` | 恢复机制增强：`.dump` INSERT 校验 + 数据暂存导入 + WAL 清理 + 连接泄漏修复 + SQL 标识符引用 |
| `app.py` | 路由注册日志追加北京时间后缀；lifespan 启动/关闭阶段日志附带北京时间；创建整点报时后台任务；日志配置使用 BeijingTimeFormatter |
| `api/monitor.py` | SSE 日志流广播使用 BeijingTimeFormatter |

**前端同步记录（本次无后端结构变更）：**
- 天气看板风力图改为上下 50% 分区，上半区仅显示轻量风力仪表，下半区独立显示预报风级柱线图
- 气温趋势图恢复最高/最低温度标注，白天与晚间两条曲线均显示标注
- 预报风级纵轴改为按返回数据值域动态计算，避免低风级数据被固定 0-8 级范围压扁
- 城市解析查询优先使用正地理编码返回的 adcode，并避免 store watcher 与手动加载重复触发天气请求
- 天气图表基于容器真实宽高动态计算 ECharts legend/grid/字号/仪表半径
- 罗盘固定屏幕 HUD 新增小尺寸专用渲染配置，按 HUD 尺寸缩放刻度、字体、天池半径和天心十字线，减少塌陷折叠
- 地图 HUD 浮层增加圆形背景、响应式边距、drop shadow 和 SVG overflow 保护，控制面板 HUD 尺寸范围与 store 限制对齐
- 外部 HTTP(S) 瓦片请求直连优先，直连失败后兜底请求既有 `/proxy/{URL}` 后端代理，解决 `maps-for-free.com` 等图源缺少 CORS 响应头导致的加载失败
- 代理触发时通过全局 Message 组件弹出 toast 通知（fallback 模式提示"已自动切换至后端代理"，always 模式提示"已启用后端代理模式"），5s 防抖去重避免快速切换时重复弹窗
- 本次前端同步修改 `frontend/src/components/Weather/WeatherChartPanel.vue`、`frontend/src/composables/weather/useWeatherCharts.js`、`frontend/src/composables/weather/useWeatherData.js`、`frontend/src/components/Weather/WeatherLiveCards.vue`、`frontend/src/stores/useCompassStore.ts`、`frontend/src/components/Map/MapContainer.vue`、`frontend/src/components/Compass/CompassControlPanel.vue`、`frontend/src/composables/tileSource/tileLifecycle.ts`、`frontend/.env.example`，后端文件树无新增/删除

**功能说明：**
- 自定义 `BeijingTimeFormatter` 重写 `formatTime` 方法，使用 `get_beijing_now()` 获取北京时间
- 日志格式统一为：`2026-06-09 15:30:00,123 [北京时间] - logger - LEVEL - message`
- 解决海外服务器（如 HuggingFace Space）日志时间显示为 UTC 的问题
- 所有日志输出（控制台 + SSE 广播）时间统一为北京时间（UTC+8）
- 所有路由注册日志附带 `[北京时间: YYYY-MM-DD HH:MM:SS]` 后缀
- lifespan startup 阶段启动整点报时后台任务，精确 sleep 到下一整点
- lifespan shutdown 阶段安全取消整点报时任务
- 整点报时任务内置 `try/except` 异常保护，单次异常不会终止整个任务
- 启动时自动清理孤立的 `-wal`/`-shm` 文件，防止外部替换 db 后读到旧数据
- 数据库损坏恢复完整链路：备份 → `.dump`/逐表恢复 → 暂存 → 删除 → 重建 schema → 导入恢复数据

---

### V3.3.0 (2026-06-05) - Chat Function Calling GIS

**修改文件：**

| 文件 | 说明 |
|------|------|
| `api/agent_chat/schemas.py` | 新增 tools/tool_choice 字段（Function Calling 支持） |
| `api/agent_chat/upstream.py` | 透传 tools 给上游 LLM + 提取 tool_calls |
| `api/agent_chat/routes.py` | 支持 tool_calls 返回 |

**功能说明：**
- 支持 OpenAI Function Calling 格式的 tools 参数透传
- 支持从上游 LLM 响应中提取 tool_calls
- 支持 tool_calls 与文本回复的同时返回

---

### V3.2.7 (2026-06-04) - Agent Chat 默认 AI 专属配置

**新增端点：**

| 方法 | 路由 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/admin/agent/default-ai-config` | admin | 管理员读取默认 AI 配置（含 api_key） |
| POST | `/api/admin/agent/default-ai-config` | admin | 管理员更新默认 AI 配置 |
| GET | `/api/agent/default-ai-config` | login | 公开读取默认 AI 配置（不含 api_key） |
| POST | `/api/agent/chat/default-proxy` | login | 使用默认 AI 配置代理聊天 |

**新增函数：**
- `db.py::_get_default_ai_config_sync()` — 读取管理员配置的默认 AI 专属配置
- `db.py::_set_default_ai_config_sync()` — 更新默认 AI 配置到 system_config 表

**配置键：**
- `default_ai_api_key` — 管理员配置的专属 API Key
- `default_ai_base_url` — LLM 端点地址
- `default_ai_model` — 默认模型名称



```text
backend/
├── api/                                           # API 路由模块
│   ├── __init__.py                                # 路由注册入口
│   ├── admin.py                                   # 管理员相关接口
│   ├── agent_chat/                                # AI 对话代理（模块化拆分）
│   │   ├── __init__.py                            # 门面 re-export
│   │   ├── constants.py                           # 常量、环境变量
│   │   ├── schemas.py                             # Pydantic 模型
│   │   ├── utils.py                               # 纯工具函数
│   │   ├── db.py                                  # DB schema、config CRUD
│   │   ├── quota.py                               # 配额管理
│   │   ├── upstream.py                            # 上游 LLM API 调用
│   │   └── routes.py                              # 路由处理函数
│   ├── auth/                                      # 鉴权模块（模块化拆分）
│   │   ├── __init__.py                            # 门面 re-export
│   │   ├── constants.py                           # 常量、角色、邮箱/昵称/密码校验常量
│   │   ├── db.py                                  # 数据库连接工厂 + 损坏自动恢复 + WAL 清理
│   │   ├── schema.py                              # DDL 建表与邮箱账号迁移
│   │   ├── password.py                            # 密码哈希/验证
│   │   ├── models.py                              # Pydantic 请求模型（邮箱账号/绑定/昵称）
│   │   ├── user.py                                # 用户 CRUD + 旧 username 兼容键
│   │   ├── session.py                             # 会话管理、邮箱与受限绑定 session
│   │   ├── email_service.py                       # 阿里云邮件推送 SMTP 代理转发服务
│   │   ├── verification.py                        # 验证码生成/存储/校验/频率限制
│   │   ├── preferences.py                         # 用户偏好
│   │   ├── quota.py                               # 配额追踪
│   │   ├── system_config.py                       # 系统配置
│   │   ├── dependencies.py                        # FastAPI 依赖注入 + EMAIL_BINDING_REQUIRED 拦截
│   │   └── routes.py                              # 认证路由（邮箱注册/登录/绑定/重置）
│   ├── spatial/                                   # 空间分析 API（模块化拆分，统一 EPSG:3857）
│   │   ├── __init__.py                            # 门面 re-export router
│   │   ├── models.py                              # Pydantic 请求/响应模型
│   │   ├── utils.py                               # 坐标重投影（pyproj）+ 几何格式转换 + MAX_GRID_CELLS 常量
│   │   ├── router.py                              # 路由 + 端点分发 + CRS 统一转换
│   │   └── operations/                            # 分析操作实现（纯 EPSG:3857）
│   │       ├── __init__.py                        # re-export 所有 do_* 函数
│   │       ├── buffer.py                          # 缓冲区分析
│   │       ├── overlay.py                         # 叠加分析（交集/并集/差集）
│   │       ├── convex_hull.py                     # 凸包分析
│   │       ├── voronoi.py                         # 泰森多边形
│   │       ├── aggregation.py                     # 空间聚合（网格化/蜂窝化）
│   │       ├── multi_ring_buffer.py               # 多环缓冲区
│   │       ├── simplify.py                        # 几何简化
│   │       └── fishnet.py                         # 渔网分析
│   ├── api_keys_management.py                     # API 主/备密钥管理 + 运行时地图 token 池下发
│   ├── api_management.py                          # API 使用管理接口
│   ├── external_proxy.py                          # 外部代理接口
│   ├── location.py                                # 定位相关接口
│   ├── monitor.py                                 # 日志监控接口
│   ├── proxy.py                                   # 通用代理 + GCJ-02 纠偏
│   └── statistics.py                              # 访问统计接口
│
├── utils/                                         # 通用工具模块
│   ├── __init__.py                                # 包初始化
│   └── time_utils.py                              # 北京时间工具 + 整点报时后台任务
│
├── core/                                          # 核心业务逻辑
│   ├── tile_engine.py                             # 瓦片下载 + GeoTIFF 拼接
│   └── task_scheduler.py                          # 过期任务清理调度器
│
├── models/                                        # 数据模型
│   └── download_task.py                           # SQLModel 下载任务表
│
├── download_xyz/                                  # 在线底图下载模块
│   ├── download.py                                # 下载逻辑
│   ├── download_task.py                           # 下载任务
│   ├── task_scheduler.py                          # 任务调度器
│   └── tile_engine.py                             # 瓦片引擎
│
├── gcj_rectify/                                   # GCJ-02 坐标纠偏模块
│   ├── __init__.py                                # 模块入口
│   ├── fetch.py                                   # 数据获取
│   ├── rectify.py                                 # 纠偏逻辑
│   ├── transform.py                               # 坐标转换
│   ├── url_template.py                            # URL 模板
│   └── utils.py                                   # 工具函数
│
├── app.py                                         # FastAPI 主入口
├── Dockerfile                                     # Docker 构建文件
├── docker-compose.yml                             # Docker Compose 配置
├── pyproject.toml                                 # Python 项目依赖
├── uv.lock                                        # uv 依赖锁定文件
├── .env.example                                   # 环境变量模板
├── .dockerignore                                  # Docker 忽略文件
└── README.md                                      # 本文件
```

## 0.0 前端 404 兜底页面 (2026-06-05)

> 本次更新仅涉及前端，后端无变更。

**前端新增：**
- ✅ `NotFoundView.vue`：404 错误页面组件（自动倒计时返回首页）
- ✅ 路由配置添加 catch-all 路由 `/:pathMatch(.*)*`

详见 [前端开发日志](../Docs/26-06-05/2026-06-05-frontend-404-fallback.md)

---

## 0.1 GCJ-02 纠偏模块优化记录 (2026-06-03)

### 优化概览

| 优先级 | 问题 | 优化措施 | 预期收益 |
|--------|------|----------|----------|
| P0 | `fetch_tile()` 递归调用 | 改为循环+重试（MAX_RETRIES=2） | 避免栈溢出风险 |
| P1 | 缓存读取双重转换 | 直接 `read_bytes()` 返回 | -50% I/O |
| P1 | 瓦片获取无异常处理 | 单个失败返回空白瓦片 | 提高可用性 |
| P2 | 代码质量 | 命名/文档/类型注解改进 | 可维护性提升 |

### 关键变更

**1. fetch.py - 重试机制**
```python
# 之前：递归调用（危险）
async def fetch_tile(url, client=None):
    ...
    return await fetch_tile(url, client=None)  # 递归！

# 之后：循环重试（安全）
for attempt in range(MAX_RETRIES + 1):
    try:
        ...
    except Exception:
        if is_event_loop_error and attempt < MAX_RETRIES:
            reset_async_client()
            continue
        raise
```

**2. rectify.py - 缓存优化**
```python
# 之前：解码+编码（浪费）
if tile_path.exists():
    with Image.open(tile_path) as image:
        image.load()
        return image_to_bytes(image)

# 之后：直接返回字节（高效）
if tile_path.exists():
    return tile_path.read_bytes()
```

**3. transform.py - 代码质量**
```python
# 之前：魔法数字
a = 6378245.0
f = 1 / 298.3
ee = 1 - (b * b) / (a * a)

# 之后：命名常量
WGS84_SEMI_MAJOR_AXIS = 6378245.0
WGS84_FLATTENING = 1 / 298.3
WGS84_ECCENTRICITY_SQ = 1 - (WGS84_SEMI_MINOR_AXIS ** 2) / (WGS84_SEMI_MAJOR_AXIS ** 2)
```

详见：[GCJ-02 Code Review 报告](../Docs/26-06/2026-06-03-gcj-rectify-code-review.md)

## 1. 认证系统

### 1.1 三类登录身份

1. 游客
- 用户名：user
- 密码：123
- 角色：guest
- 说明：必须手动输入密码 123 才能登录

2. 注册用户
- 用户自行注册邮箱账号、昵称和密码
- 角色：registered
- 说明：新账号必须完成邮箱验证码校验；昵称仅用于展示，可重复、可修改

3. 超级管理员
- 账号与密码由数据库 users 表维护
- 推荐用户名：super_admin
- 角色：super_admin
- 说明：管理员密码不在后端代码和前端提示中出现

### 1.2 持久化存储（HF Space /data）

认证信息存储使用 SQLite，默认路径：
- /data/webgis_auth.db

这意味着在 Hugging Face Space 挂载持久化卷后，容器重启不会丢失注册用户与会话数据。

当 /data 不可写时，服务会自动回退到本地目录：
- ./data/webgis_auth.db

### 1.2.1 管理员账号 SQL 初始化

管理员账号建议通过 SQL 直接写入 users 表，并设置 role='super_admin'。

```sql
INSERT INTO users (username, password_hash, role, created_at)
VALUES ('super_admin', '<pbkdf2_salt_hex$pbkdf2_digest_hex>', 'super_admin', datetime('now'));
```

### 1.3 认证相关接口

1) 注册普通用户
```bash
curl -X POST "http://localhost:8000/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","email_code":"123456","display_name":"Demo","password":"abc12345"}'
```

2) 邮箱账号登录
```bash
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"abc12345"}'
```

3) 旧用户名登录并绑定邮箱
```bash
# 仅适用于无已验证邮箱的旧用户；返回 requires_email_binding=true 的受限 session
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"old_username","password":"<old_password>"}'

# 使用受限 session 绑定邮箱，成功后返回新 token
curl -X POST "http://localhost:8000/api/auth/bind-email" \
  -H "Authorization: Bearer <restricted_token>" \
  -H "Content-Type: application/json" \
  -d '{"email":"old-user@example.com","code":"123456","current_password":"<old_password>"}'
```

4) 游客登录
```bash
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"123"}'
```

5) 超级管理员登录
```bash
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"super_admin","password":"<admin_password_from_db>"}'
```

6) 查询当前登录用户
```bash
curl "http://localhost:8000/api/auth/me" \
  -H "Authorization: Bearer <token>"
```

7) 退出登录
```bash
curl -X POST "http://localhost:8000/api/auth/logout" \
  -H "Authorization: Bearer <token>"
```

8) 修改当前账号密码
```bash
curl -X POST "http://localhost:8000/api/auth/change-password" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"current_password":"<old_password>","new_password":"<new_password>"}'
```

9) 修改昵称
```bash
curl -X POST "http://localhost:8000/api/auth/change-display-name" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"display_name":"新的昵称"}'
```

## 2. 现有 API 如何使用

这两个接口的使用示例也已写在对应后端文件顶部注释中：
- api/proxy.py
- api/statistics.py

### 2.1 瓦片代理 API

接口：
- GET /api/tile/{z}/{x}/{y}?lyrs=s

示例：
```bash
# 默认卫星图层
curl "http://localhost:8000/api/tile/16/53576/25999"

# 指定混合图层
curl "http://localhost:8000/api/tile/16/53576/25999?lyrs=y"
```

前端模板 URL：
```text
http://localhost:8000/api/tile/{z}/{x}/{y}?lyrs=s
```

### 2.1.1 GCJ/WGS 纠偏瓦片代理

接口：
- GET /proxy/gcj2wgs/{target_url:path}
- GET /proxy/wgs2gcj/{target_url:path}

示例：
```bash
# GCJ02 -> WGS84
curl "http://localhost:8000/proxy/gcj2wgs/mt1.google.com/vt?x=53576&y=25999&z=16&lyrs=s"

# WGS84 -> GCJ02
curl "http://localhost:8000/proxy/wgs2gcj/mt1.google.com/vt?x=53576&y=25999&z=16&lyrs=s"
```

### 2.2 访客统计 API

接口：
- POST /api/log-visit
- 需要登录 token（Authorization: Bearer <token>）

示例：
```bash
curl -X POST "http://localhost:8000/api/log-visit" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

可选模拟代理 IP：
```bash
curl -X POST "http://localhost:8000/api/log-visit" \
  -H "Authorization: Bearer <token>" \
  -H "X-Forwarded-For: 8.8.8.8" \
  -H "User-Agent: Mozilla/5.0" \
  -d '{}'
```

## 3. 受保护接口

以下接口已强制登录校验（防止跳过登录直接使用 URL）：
- GET /api/news
- GET /api/process-points
- GET /api/data
- GET /api/info
- POST /api/log-visit
- GET /api/agent/chat/config
- POST /api/agent/chat/completions

公开接口：
- GET /
- GET /health
- GET /api/tile/{z}/{x}/{y}
- POST /api/auth/send-code
- POST /api/auth/verify-code
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/reset-password

受限绑定 session 可访问：
- POST /api/auth/bind-email

登录后可访问：
- GET /api/auth/me
- POST /api/auth/logout
- POST /api/auth/change-password
- POST /api/auth/change-avatar
- POST /api/auth/change-display-name

## 4. 环境变量

最少需要：
- SUPABASE_URL
- SUPABASE_KEY

认证与登录可选配置：
- AUTH_DB_PATH=/data/webgis_auth.db
- AUTH_SESSION_EXPIRE_HOURS=72
- AUTH_PASSWORD_HASH_ITERATIONS=120000

Agent 对话可选配置：
- AGENT_API_KEY=your_agent_key (optional env fallback; prefer admin panel/database)
- AGENT_BASE_URL=https://api.qnaigc.com/v1
- AGENT_MODEL=deepseek-V3-0324
- AGENT_CHAT_GUEST_DAILY_QUOTA=10
- AGENT_CHAT_REGISTERED_DAILY_QUOTA=100

代理安全可选配置：
- PROXY_VERIFY_SSL=true
- PROXY_ALLOW_PRIVATE_HOSTS=false

运行时地图 Token 可选配置：
- RUNTIME_CONFIG_ALLOWED_ORIGINS=https://negiao.github.io,https://your-domain.com

示例（.env）：
```bash
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-anon-public-key
AUTH_DB_PATH=/data/webgis_auth.db
```

## 5. 🆕 在线底图下载 API

### 功能概述
支持从任意 Web Mercator (EPSG:3857) 瓦片源异步下载指定范围的底图，并输出为地理参考的 GeoTIFF 格式。

#### API 端点

| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/api/download/tasks` | 创建下载任务 |
| GET | `/api/download/tasks/{task_id}` | 查询任务状态 |
| GET | `/api/download/tasks/{task_id}/file` | 下载生成的 GeoTIFF 文件 |

#### 请求示例

```bash
# 1. 创建下载任务
curl -X POST http://localhost:8000/api/download/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "tile_url_template": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    "bbox": {
      "minLon": 114.2,
      "minLat": 29.5,
      "maxLon": 114.3,
      "maxLat": 29.6
    },
    "crs": "EPSG:4326",
    "resolution_m": 30,
    "format": "GeoTIFF"
  }'

# 返回
{
  "task_id": "abc123",
  "status": "pending",
  "progress": 0,
  "message": "Task created"
}

# 2. 轮询任务状态
curl http://localhost:8000/api/download/tasks/abc123

# 3. 下载 GeoTIFF
curl -O http://localhost:8000/api/download/tasks/abc123/file
```

#### 核心实现细节

- **并发控制**：使用 `asyncio.Semaphore(10)` 限制并发瓦片下载数
- **内存优化**：Rasterio Window streaming，无需一次性加载全部瓦片
- **坐标转换**：自动支持 EPSG:3857 (Web Mercator) 范围计算
- **任务持久化**：SQLite 数据库记录任务历史
- **自动清理**：后台调度器每分钟清理超过 30 分钟的过期任务

---

## 6. 🆕 GCJ-02 实时纠偏代理

### 功能概述
针对中国境内地图数据的坐标系转换代理，支持实时转换请求。

#### API 端点

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/proxy/gcj2wgs/{lon}/{lat}` | GCJ-02 → WGS84（火星坐标 → 真实坐标）|
| GET | `/proxy/wgs2gcj/{lon}/{lat}` | WGS84 → GCJ-02（真实坐标 → 火星坐标）|

#### 使用场景

1. **GCJ-02 瓦片转 WGS84**：
   ```javascript
   // 高德地图瓦片 → 标准 GPS
   fetch('/proxy/gcj2wgs/116.4074/39.9042')
     .then(r => r.json())
     .then(data => console.log(data)) 
     // { lon: 116.3974, lat: 39.8932 }
   ```

2. **WGS84 数据上传至高德地图**：
   ```javascript
   // 用户标记的 GPS 点 → 高德坐标系
   fetch('/proxy/wgs2gcj/116.3974/39.8932')
     .then(r => r.json())
     .then(data => {
       // 用转换后的坐标添加到高德地图
       amap.add(new AMap.Marker({
         position: [data.lon, data.lat]
       }))
     })
   ```

#### 技术细节

- 采用 Everyhing 算法或等效坐标系转换库
- 前端透明调用，无需修改业务逻辑
- 支持单点转换和批量转换（后期扩展）

---

## 7. 本地启动

```bash
cd backend
uv sync
uv run uvicorn app:app --reload --port 8000
```

文档地址：
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 8. Docker Compose 一键启动（推荐）

```bash
# 项目根目录执行
docker-compose up -d

# 检查服务状态
docker-compose ps

# 查看日志
docker-compose logs -f backend
docker-compose logs -f frontend

# 停止服务
docker-compose down
```

服务地址：
- 前端：http://localhost:5173
- 后端 API：http://localhost:8000
- 后端文档：http://localhost:8000/docs

---

## 9. 前端联调要点

前端请求受保护接口时，请在请求头中带上 token：
```http
Authorization: Bearer <token>
```

当前前端已接入：
- 登录页真实调用 /api/auth/login 和 /api/auth/register
- 路由守卫拦截未登录访问 /home
- API 客户端自动附加 Authorization 头


---

## ✨ V3.0.2 Agent Chat 配置同步修复（2026-04-19）

### 问题描述

原有实现存在以下问题：
1. 管理员配置了，但普通用户显示"未配置"
2. 身份鉴别失效，权限管理无法生效
3. 用户额度限制无法正确执行

### 修复内容

✅ **配置同步**：统一数据库事务管理，确保管理员配置被所有用户正确读取  
✅ **权限鉴别**：改进权限检查，Admin/Registered/Guest 角色生效  
✅ **额度管理**：增强配额消费的可靠性，日配额限制能正确执行  
✅ **可观测性**：添加详细日志，便于排查问题  

### 核心改进

**文件**：`backend/api/agent_chat.py`

**修复的函数**（共 9 个）：
1. `_ensure_agent_chat_tables_sync()` - 统一事务管理
2. `_ensure_system_config_table_sync()` - 移除内部提交
3. `_ensure_api_keys_table_sync()` - 移除内部提交
4. `_get_system_config_values_sync()` - 异常处理与回退
5. `_set_agent_provider_config_sync()` - 管理员配置改进
6. `_read_agent_user_config_row_sync()` - 用户配置读取安全性
7. `_upsert_agent_user_config_sync()` - 用户配置更新
8. `_consume_agent_chat_quota_sync()` - 配额消费日志
9. `_get_agent_chat_quota_snapshot_sync()` - 配额查询异常处理

### 启用 DEBUG 日志

```bash
LOG_LEVEL=DEBUG uv run uvicorn app:app --reload
```

关键日志消息：
- `Agent config updated with N rows` → Admin 配置已保存 ✅
- `User quota exceeded: N/M` → 用户超过配额（被阻止）✅
- `Admin {user} has unlimited quota` → Admin 权限确认 ✅

### 详细文档

- **快速指南**：`docs/backend-agent-chat-guide.md`
- **完整日志**：`docs/2026-04-19-AgentChat配置同步修复.md`
- **规范执行**：`docs/2026-04-19-版本规范执行记录.md`

### 关键改进

- 对话配额改为**数据库动态读取**（`system_config`），不再依赖硬编码常量。
- 管理员可在后台直接修改 Guest / Registered 每日对话额度。
- 对话链路改为：**先校验额度 -> 成功调用上游后再扣费**。
- 上游失败/超时/异常时，不扣减用户额度。

### 涉及文件

- `backend/api/agent_chat.py`

---


### 核心诉求

**痛点**：新用户使用 Agent Chat 时，若未主动配置模型，首条信息请求必然因模型路径无效而失败。

**目标**：实现**"开箱即用"**体验——新用户无需任何配置，点击"发送"即可立即获得 AI 回复。

### 关键改进

#### 后端增强（`backend/api/agent_chat.py`）

1. **模型列表缓存** → `_cache_available_models_sync()`
   - 将上游返回的模型 ID 列表存储到 `system_config` 数据库
   - 支持离线降级：若上游服务临时不可用，使用缓存列表

2. **智能降级流程** → `get_available_models()` 重构
   - 优先：实时调用上游 `/models`
   - 降级1：上游超时 → 使用缓存列表
   - 降级2：无缓存 → 返回友好错误提示

3. **模型偏好持久化** → `@router.patch("/api/agent/user/preference")`
   - 新端点允许用户保存"偏好模型"到 `user_preferences` 表
   - 跨设备登录后自动应用偏好

#### 前端增强（`frontend/src/components/ChatPanelContent.vue`）

1. **启动时自动加载模型** → `onMounted()` 改进
   - 页面初始化时后台加载模型列表（不阻塞 UI）

2. **自动模型选择** → `loadAvailableModels()` 增强
   - 若用户未选择模型，自动从可用列表中**随机选择一个**
   - 自动保存为用户偏好（后台异步，无额外延迟）

3. **后端信息反馈** → 支持 `fallback_reason` 字段
   - 前端可展示模型加载的降级原因（仅调试用）

#### API 新增

**后端新增**：
- `PATCH /api/agent/user/preference` - 保存用户模型偏好
- `_cache_available_models_sync()` - 缓存模型到数据库
- `_cache_models_async()` - 后台异步缓存

**前端新增**：
- `apiAgentSaveModelPreference(model)` - API 包装器

### 涉及文件

- `backend/api/agent_chat.py` (+130 lines)
- `frontend/src/components/ChatPanelContent.vue` (+45 lines)
- `frontend/src/api/backend.js` (+5 lines)

### 零配置流程图

```
用户点击聊天图标
  ↓
onMounted() 触发
  ↓ ┌─ 后台加载模型列表 (loadAvailableModels)
  │ ├─ 优先: 查询上游 /models
  │ ├─ 降级: 上游失败 → 使用缓存列表
  │ └─ 自动选择: 若用户未配置，从列表中随机挑一个
  │
  ↓ [用户UI展示就绪]
用户输入问题，点击"发送"
  ↓
前后端使用自动选择的模型
  ↓
✅ 首条消息成功获得 AI 回复
```

### 配置举例

无需额外配置！系统自动工作：

```python
# 后端自动监听 agent_available_models（system_config key）
# 前端自动触发 onMounted() 预加载
# 首次发送消息时，自动使用系统选定的模型
```

### 性能提示

- 模型列表缓存不阻塞响应（使用 `asyncio.create_task()` 后台保存）
- 前端预加载模型不阻塞页面渲染
- 用户体验：**立即可用，无感知延迟**

