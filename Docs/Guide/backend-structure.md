# 后端文件结构

> 📌 本文件是后端 `backend/` 的**唯一权威目录树**（Single Source of Truth）。
> 返回 [项目结构总览](project-structure.md) · [根 README](../../README.md) · [后端 README](../../backend/README.md)
>
> ⚠️ **维护规则**：任何后端文件的增删改都必须同步更新本文件，保持树与实际代码一致。

---

```text
backend/
├── app.py  # FastAPI 主入口
├── pyproject.toml  # Python 项目依赖
├── README.md  # 本文件
├── uv.lock  # uv 依赖锁定文件
├── api/                                           # API 路由模块
│   ├── __init__.py                                # 路由注册入口
│   ├── admin.py                                   # 管理员相关接口
│   ├── api_keys_management.py                     # API 主/备密钥管理 + L2 Agent/高德 Key 池 + 运行时地图 token 池下发
│   ├── api_management.py                          # API 使用管理接口
│   ├── external_proxy.py                          # 外部代理接口
│   ├── keepalive.py                               # KeepAlive 互活跃模块（公开 POST/GET 心跳接收 + asyncio 后台随机间隔主动探活对端）
│   ├── location.py                                # 定位相关接口
│   ├── monitor.py                                 # 日志监控接口
│   ├── statistics.py                              # 访问统计接口
│   ├── realtime_stats.py                          # 实时在线统计 SSE 推送（内存 tracker + SSE 连接计数 + 心跳兜底 + ticket 鉴权 + 定时/即时广播 + 快照缓存）
│   ├── historical_imagery.py                      # 历史影像公开目录接口（ESRI Wayback 只读缓存目录）
│   ├── agent_chat/                                # AI 对话代理（模块化拆分）
│   │   ├── __init__.py                            # 门面 re-export
│   │   ├── constants.py                           # 常量、环境变量
│   │   ├── db.py                                  # DB schema、config CRUD
│   │   ├── routes.py                              # 路由处理函数
│   │   ├── schemas.py                             # Pydantic 模型
│   │   ├── upstream.py                            # 上游 LLM API 调用
│   │   └── utils.py                               # 纯工具函数
│   ├── auth/                                      # 鉴权模块（模块化拆分）
│   │   ├── __init__.py                            # 门面 re-export
│   │   ├── constants.py                           # 常量、角色、邮箱/昵称/密码校验常量
│   │   ├── db.py                                  # 保守连接配置、只读损坏检测与自动恢复编排
│   │   ├── dependencies.py                        # FastAPI 依赖注入 + EMAIL_BINDING_REQUIRED 拦截
│   │   ├── email_service.py                       # 阿里云邮件推送 SMTP 代理转发服务
│   │   ├── models.py                              # Pydantic 请求模型（邮箱账号/绑定/昵称）
│   │   ├── oauth.py                               # Google/GitHub/Hugging Face OAuth 登录、自动注册与账号绑定服务（授权码 + Google OneTap 双通道）
│   │   ├── password.py                            # 密码哈希/验证
│   │   ├── preferences.py                         # 用户偏好
│   │   ├── quota.py                               # 配额追踪
│   │   ├── routes.py                              # 认证路由（邮箱注册/登录/绑定/重置/OAuth）
│   │   ├── schema.py                              # DDL、邮箱账号迁移与数据库维护事件同步
│   │   ├── session.py                             # 会话管理、邮箱与受限绑定 session
│   │   ├── system_config.py                       # 系统配置
│   │   ├── user.py                                # 用户 CRUD + 旧 username 兼容键
│   │   └── verification.py                        # 验证码生成/存储/校验/频率限制
│   └── spatial/                                   # 空间分析 API（模块化拆分，统一 EPSG:3857）
│       ├── __init__.py                            # 门面 re-export router
│       ├── models.py                              # Pydantic 请求/响应模型
│       ├── router.py                              # 路由 + 端点分发 + CRS 统一转换
│       ├── utils.py                               # 坐标重投影（pyproj）+ 几何格式转换 + MAX_GRID_CELLS 常量
│       └── operations/                            # 分析操作实现（纯 EPSG:3857）
│           ├── __init__.py                        # re-export 所有 do_* 函数
│           ├── aggregation.py                     # 空间聚合（网格化/蜂窝化）
│           ├── buffer.py                          # 缓冲区分析
│           ├── convex_hull.py                     # 凸包分析
│           ├── fishnet.py                         # 渔网分析
│           ├── multi_ring_buffer.py               # 多环缓冲区
│           ├── overlay.py                         # 叠加分析（交集/并集/差集）
│           ├── simplify.py                        # 几何简化
│           └── voronoi.py                         # 泰森多边形
│
├── config/                                        # 三层配置统一入口（L1 env / L2 Admin+DB / L3 Secrets）
│   ├── __init__.py                                # 门面 re-export（get_settings/get_str 等）+ 启动时加载根/backend .env
│   ├── catalog.py                                 # 配置全集登记表（key/层级/默认值/是否绝密）
│   ├── load.py                                    # L1/L3 加载 + BackendSettings 快照（AGENT/AMAP env 仅旧部署兜底）
│   ├── public.py                                  # 前端可见公开配置构建
│   └── runtime.py                                 # L2 运行时覆盖（Admin 面板 + system_config，绝密项禁止 DB 覆盖）
│
├── data/                                          # 运行时数据目录
│   ├── webgis_auth.db                             # SQLite 认证库（HF 网络挂载默认 DELETE journal）
│   └── gcj_rectify_cache/                         # GCJ-02 纠偏瓦片缓存（运行时生成，大量 PNG）
│
├── domains/                                       # 业务域聚合（对齐前端 domains/：一域收拢路由 + 服务 + 底座库）
│   ├── __init__.py
│   └── tiles/                                     # 瓦片域：纠偏/直通代理路由 + 底图下载 + 纠偏底座库
│       ├── __init__.py                            # tiles_router 聚合（纠偏先于通配挂载）+ build_http_client
│       ├── proxy_shared.py                        # 瓦片代理通用infra：内存缓存/限流/出站客户端/SSRF/请求头/PROXY_* 配置
│       ├── routes_rectify.py                      # 纠偏路由：/proxy/gcj2wgs、wgs2gcj、bd2wgs、wgs2bd
│       ├── routes_passthrough.py                  # 直通路由：/tiles/ships66/*、/proxy/{target_url:path} 通配（后挂载）
│       ├── download/                              # 在线底图下载（由 download_xyz/ 整体搬入）
│       │   ├── __init__.py
│       │   ├── download.py                        # 下载逻辑（/api/download）
│       │   ├── download_task.py                   # 下载任务
│       │   ├── task_scheduler.py                  # 任务调度器
│       │   └── tile_engine.py                     # 瓦片引擎
│       └── rectify/                               # 纠偏底座库：GCJ-02 / BD-09 ↔ WGS84
│           ├── __init__.py                        # 库统一出口（纠偏函数/URL 模板/坐标转换/get_cache_dir）
│           ├── common/                            # 共用原语（依赖铁律：bd → common ← gcj）
│           │   ├── __init__.py
│           │   ├── transform.py                   # 纯坐标数学：wgs2gcj/gcj2wgs/gcj2bd/bd2gcj/wgs2bd/bd2wgs
│           │   ├── url_template.py                # 瓦片 URL 模板解析/重建（与坐标系无关）
│           │   ├── fetch.py                       # 上游瓦片拉取（并发/重试/浏览器头/Referer 白名单）
│           │   ├── geo.py                         # slippy 网格数学 + 全局像素 + 瓦片缓存目录（默认 data/gcj_rectify_cache）
│           │   ├── grid.py                        # 网格拉取/拼接/文件缓存/字节与网格数护栏
│           │   └── quad.py                        # 精确四角 QUAD 重采样（几何无缝原语，调用方显式传核）
│           ├── gcj/                               # GCJ-02 同网格纠偏（BILINEAR，1:1 保锐度）
│           │   ├── __init__.py
│           │   └── rectify.py                     # get_gcj2wgs/wgs2gcj 编排 + _GCJ_RESAMPLE（一行可切 NEAREST）
│           └── bd/                                # 百度 BD-09 跨网格纠偏（BICUBIC，约 306→256 降采样）
│               ├── __init__.py
│               ├── mercator.py                    # 百度官方 LL2MC/MC2LL 分段多项式投影 + BD 瓦片网格数学（Y 轴向上、res=2^(18-z)）
│               └── rectify.py                     # BD 网格 ↔ 标准 XYZ 精确四角 QUAD 纠偏
│
├── services/                                      # 共享业务服务
│   ├── __init__.py
│   ├── historical_imagery.py                      # ESRI Wayback 历史影像元数据同步与持久化（表创建 + 原子替换 + 每日/启动调度）
│   └── ip_geo.py                                  # IP 地理定位统一服务
│
├── scripts/                                       # 运维/辅助脚本
│   ├── fetch_wayback_layers.py                    # ESRI Wayback 目录拉取 CLI（--json/--code/--urls/--pure-urls）
│   ├── fetch_wayback_layers.js                    # 同上（Node.js 版）
│   └── check_app_import.py                        # 全量 import app 门禁（缺三方桩化、第一方缺失 loud 失败 + 路由表断言；目录搬迁强制项）
│
├── tests/                                         # 单元测试（按域分组；子目录无 __init__，各文件自插 backend 到 sys.path）
│   ├── test_agent_map_context.py                  # AgentMapContextV1 Schema 与 prompt 格式测试
│   ├── test_config_env_loading.py                 # 配置与环境变量加载测试
│   ├── test_historical_imagery.py                 # 历史影像 _normalize_entries 排序/去重/XYZ URL 生成测试
│   ├── test_realtime_stats.py                     # SSE 主信号/普通鉴权活跃/显式兜底心跳回归测试
│   ├── test_sqlite_recovery.py                    # SQL 清理、维护事件、恢复成功/失败与激活回滚测试
│   └── tiles/                                     # 瓦片域测试
│       ├── test_tiles_router.py                   # tiles_router 聚合回归：6 路由齐全 + 纠偏先于通配
│       └── test_url_template.py                   # 瓦片 URL 模板解析/重建测试（通用 token 扫描 + 三常规模式回归）
│
└── core/                                          # 横切基础能力（由 utils/ 原样下沉；config/ 暂留顶层，见重构方案）
    ├── __init__.py                                # 包初始化
    ├── http_headers.py                            # 出站浏览器特征头共享单点（UA 常量 + Referer 域名白名单），瓦片域三面（下载/纠偏/直通）共用
    ├── net_guard.py                               # 出站 SSRF 护栏单点（IP 字面量归一/私网判定/DNS 复判/host 白名单），tiles+agent+download 三面共用
    ├── sqlite_maintenance.py                      # database_maintenance_events 表与恢复 JSON manifest 同步
    ├── sqlite_recovery.py                         # 时间戳损坏备份、临时重建、校验、staging 激活、回滚与空库降级
    └── time_utils.py                              # 北京时间工具 + 整点报时后台任务
```
