# 项目结构详解

> 📌 本文件维护**项目根级目录总览**与 **Docs 文档树**。前后端详细文件树已拆分为独立文件（原子化维护，避免重复）：
>
> - 📂 前端完整文件树 → [`frontend-structure.md`](frontend-structure.md)
> - 📂 后端完整文件树 → [`backend-structure.md`](backend-structure.md)
>
> 返回 [根 README](../../README.md)
>
> ⚠️ **维护规则**：根级目录或 Docs 结构变动时更新本文件；前后端内部文件增删改请更新对应的 structure 文件。

---

## 根级目录总览

```text
WebGIS_Dev/
├── .github/workflows/                 # CI/CD（前端多渠道静态部署 + 全栈 HF Space 单容器部署）
│
├── frontend/                          # 前端工程（Vue 3 + Vite + OpenLayers + Cesium）
│   └── src/                           # 详细文件树见 frontend-structure.md
│
├── backend/                           # 后端工程（FastAPI，随全栈镜像部署于 HF Spaces）
│   ├── api/                           # API 路由模块，详细文件树见 backend-structure.md
│   └── config/                        # 三层配置统一 loader（L1 env / L2 Admin+DB / L3 Secrets）
│
├── deploy/                            # 部署编排与环境文件统一收敛处
│   ├── Dockerfile                     # 全栈单镜像构建（nginx 前端静态 + FastAPI + GeoServer 三服务同容器；启动自动注入 GeoServer Proxy Base URL）
│   ├── Dockerfile.dockerignore        # 全栈镜像构建上下文白名单（BuildKit 按 Dockerfile 路径配对）
│   ├── docker-compose.yml             # 本地编排：api(后端热重载) + web(Vite HMR) + app(prod 仿真 profile)
│   ├── nginx.conf                     # 全栈容器 nginx 主配置（后端顶级段原样透传 + 瓦片磁盘缓存 + /geoserver/ 反代协议头与安全头）
│   ├── .env                           # 部署环境配置（L1 不涉密，tracked，生产基线：APP_ENV=production、线上 URL）
│   ├── .env.local                     # 本地开发环境配置（L1 不涉密，tracked，覆盖 .env：APP_ENV=development、localhost URL）
│   └── .env.example                   # 配置全集 registry（L1/L2/L3 权威入口，不再作为复制模板）
│
├── Scripts/                           # 门禁与维护脚本
│   ├── CheckConfigRegistry.py         # 配置登记门禁扫描（裸 getenv / 未登记 key / 散落 VITE_ / 硬编码域名）
│   ├── CheckStructureTree.py          # 结构树漂移门禁（frontend-structure.md ⇄ frontend/src 双向 diff）
│   └── UpdateReadmeTree.py            # README 文件树同步脚本
│
├── Docs/                              # 项目文档（维护日志 + 架构文档 + 指南文档 + Demo 演示）
│   ├── LLM_record/                    # 维护日志（按日期归档）
│   ├── Architecture/                  # 架构设计文档（八大功能 + 洪水模拟 + 三层配置架构）
│   ├── Guide/                         # 指南文档（本目录）
│   ├── Demo/                          # 前端静态 Demo 演示页面
│   ├── Example_prompt.md
│   ├── Force_command.md
│   └── TODO/                          # 待办（含 bugfix-optimization-plan.md 修复优化规划）
│
├── LocalDev.bat                       # Windows 一键启动脚本（容器化全栈：web+api 双服务）
├── Write-Color.ps1                    # LocalDev.bat 彩色输出辅助脚本
├── .gitignore
├── LICENSE
└── README.md                          # 项目门户页
```

---

## Docs 文档树

```text
Docs/
├── LLM_record/                        # 维护日志（按日期归档，原 Docs/ 下的日期目录整体迁入）
│   ├── 26-04/                         # 2026-04 日志
│   ├── 26-05/                         # 2026-05 日志
│   ├── 26-06/                         # 2026-06 日志（含 06-28 / 06-29 等不规则命名子目录）
│   ├── 26-07/                         # 2026-07 日志（按 YYYY-MM-DD 子目录归档，含 07-27 配置收敛、体积云画质/时间轴与大气修复、07-28 OAuth/云优化、Agent 地图命令总线重构）
│   └── 26-08/                         # 2026-08 日志（含 08-01 底图 SSOT 重构、08-02 Review 修复、08-03 结构树同步）
│
├── Architecture/                      # 架构设计文档
│   ├── system-architecture.md         # 系统架构总览（五层分层架构：源码→CI/CD→部署→运行时→用户）
│   ├── cicd-pipeline.md               # CI/CD 流水线详解（五 Job 部署时序）
│   ├── deployment-relationship.md     # 部署关系与域名映射（域名清单+部署来源矩阵）
│   ├── ol-cesium-dual-engine.md       # 2D/3D 双引擎：一键切换、视图同步与 URL 分享还原
│   ├── 2026-08-20-unified-basemap-selection.md # l=2 固定 custom 身份 + 双引擎共享运行时 URL
│   ├── basemap-source-system.md       # 丰富底图源：20+ 图源、熔断回退、GCJ-02 纠偏
│   ├── multi-format-data-import.md    # 多格式数据导入：拖拽加载，2D/3D 双管线
│   ├── spatial-analysis-backend.md    # 空间分析：单端点分发，Shapely 后端 8 算子
│   ├── route-planning.md              # 路径规划：驾车/公交双管线
│   ├── cesium-3d-effects.md           # 三维特效：体积云、风场、浅水叠加
│   ├── utility-tools.md               # 实用工具：测量、坐标拾取、罗盘
│   ├── account-system-ai-quota.md     # 账号体系：邮箱登录、三级身份、双 AI 配额
│   ├── cesium-fluid-flood-simulation.md # 洪水淹没模拟：GPU 流体管线
│   ├── configuration-three-tier.md    # 三层配置架构：L1/L2/L3 全景
│   ├── cesium-unified-layer-management.md # Cesium 统一图层管理
│   └── runtime-map-token-pool.md      # 运行时地图 token 池架构
│
├── Demo/                              # 前端静态 Demo 演示页面（18 个独立页面 + data/ textures/ 资源目录）
│   ├── 2dWindField.html               # 2D 风场可视化演示
│   ├── 3dHeatMap.html                 # 3D 热力图演示
│   ├── amapRectify.html               # 高德底图纠偏演示
│   ├── atmosphere.html                # 大气渲染效果演示
│   ├── beidou.html                    # 北斗相关定位/可视化演示
│   ├── buildingShade.html             # 建筑阴影分析演示
│   ├── customDashArrow.html           # 自定义虚线箭头样式演示
│   ├── dynamicLable.html              # 动态标签渲染演示
│   ├── height_limit_analysis.html     # 高度限制分析演示
│   ├── immensePointLoader.html        # 海量点加载演示
│   ├── mapTheme.html                  # 地图主题切换演示
│   ├── nearGroundBox.html             # 近地面盒体效果演示
│   ├── odFlyLine.html                 # OD 飞线效果演示
│   ├── slopeAnaysis.html              # 坡度/坡向分析演示
│   ├── submergeAnalysis.html          # 淹没分析演示（Vue 3 + Cesium CDN）
│   ├── underwater-depth-zones.html    # 水下深度区演示
│   ├── visibilityAnalysis.html        # 通视/可视域分析演示
│   ├── volume_analysis.html           # 体积/方量分析演示
│   ├── data/                          # Demo 数据资源
│   └── textures/                      # Demo 纹理资源
│
├── Guide/                             # 指南文档（由根 README 拆分，原子化维护）
│   ├── project-structure.md           # 本文件：根级目录总览 + Docs 树
│   ├── handover.md                    # 交接文档（文档地图 + 架构速览 + 代码坐标 + 坑清单）
│   ├── frontend-structure.md          # 前端完整文件树（唯一权威）
│   ├── backend-structure.md           # 后端完整文件树（唯一权威）
│   ├── CHANGELOG.md                   # 更新日志（版本记录唯一权威）
│   ├── ESRI_Wayback_Layers_List.md    # ESRI Wayback 196 个历史影像快照清单（按年份分组）
│   ├── compass-types-note.md          # compass/svg/types 类型说明（从源码迁入）
│   ├── configuration.md               # 三层配置指南（L2 管理员配置 Agent/高德 Key，HF Secrets 仅保留平台绝密）
│   ├── configuration-architecture-plan.md  # 配置架构分阶段执行计划
│   ├── oauth-deployment.md            # Google/GitHub/Hugging Face OAuth 部署配置指南（控制台申请 + HF Secrets + 排错）
│   ├── dev-conventions.md             # 开发约定与提交规范
│   ├── dev-guide.md                   # 开发指南
│   └── faq.md                         # 技术栈与 FAQ
│
├── Example_prompt.md                  # 任务启动提示词模板（Bug/功能/重构/审计四类）
├── Force_command.md                   # Agent 强制执行规范（权威：分级/边界/DoD/交接块）
├── README_EN.md                       # 英文版 README（全文翻译）
├── Refactor.md                        # 重构记录
└── TODO/                              # 待办事项
    ├── account-panel-ui-optimization.md # 账号面板 UI 优化计划
    ├── agent-override-key-leak-plan.md # L3 方案：Agent override_base_url 平台 Key 外泄修复（已批准并实施）
    ├── loading-performance-optimization-plan.md # 登录页/首屏加载性能优化计划
    ├── next-session-prompt-rendering.md # 渲染/性能工作流接续提示词
    ├── next-sprint-bugfix-and-optimization.md # 历史归档：已并入 bugfix 主规划的旧下一轮计划
    ├── proxy-ssrf-hardening-plan.md    # 代理/下载 SSRF 与资源上限加固计划
    ├── requestrendermode-plan.md       # requestRenderMode 按需渲染方案与验收清单
    └── OverPassApiIntegration/         # OverPass API 集成调研
```
