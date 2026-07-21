# 后端文件结构

> 📌 本文件是后端 `backend/` 的**唯一权威目录树**（Single Source of Truth）。
> 返回 [项目结构总览](project-structure.md) · [根 README](../../README.md) · [后端 README](../../backend/README.md)
>
> ⚠️ **维护规则**：任何后端文件的增删改都必须同步更新本文件，保持树与实际代码一致。

---

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
├── services/                                      # 共享业务服务
│   ├── __init__.py
│   └── ip_geo.py                                  # IP 地理定位统一服务
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
├── data/                                          # 运行时数据目录
│   └── webgis_auth.db                             # SQLite 数据库（+ WAL/SHM）
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
