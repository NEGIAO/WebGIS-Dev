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

## 目录治理约定（V3.6.37 起）

本仓库文档按**生命周期**分区，而非按「都是 md 就放一起」：

| 目录 | 只放什么 | 不放什么 |
|---|---|---|
| `Docs/Architecture/` | **现行有效**的架构说明（读者据以理解系统现在的样子） | 历史重构过程、未实施方案 |
| `Docs/Architecture/decisions/` | **日期命名**的历史重构记录（「当时怎么改的」） | 现行架构 |
| `Docs/Guide/` | **稳定**的操作指南、约定、清单 | 方案（plan）、待办 |
| `Docs/TODO/` | 方案与待办（入口见 [`TODO/README.md`](../TODO/README.md)） | 已完成项（迁 `archive/`）、参考规范（迁 `Architecture/`） |
| `Docs/TODO/archive/` | 已实施或已废弃的方案（**只迁移不删除**） | 活跃方案 |
| `Docs/LLM_record/` | 逐次开发日志（不可改写，见 Force_command §6） | 方案、架构 |
| `Docs/Demo/` | 演示页与样例数据（**非文档**，见其 README） | 任何说明类文档 |

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
│   ├── Dockerfile                     # 全栈单镜像构建（nginx 前端静态 + FastAPI + GeoServer 三服务同容器）
│   ├── Dockerfile.dockerignore        # 全栈镜像构建上下文白名单
│   ├── docker-compose.yml             # 本地编排：api + web + app(prod 仿真 profile)
│   ├── nginx.conf                     # 全栈容器 nginx 主配置（瓦片磁盘缓存 + /geoserver/ 反代）
│   ├── .env                           # L1 不涉密，tracked，生产基线
│   ├── .env.local                     # L1 不涉密，tracked，本地开发覆盖值
│   └── .env.example                   # 配置全集 registry（L1/L2/L3 权威入口）
│
├── Scripts/                           # 门禁与维护脚本
│   ├── CheckConfigRegistry.py         # 配置登记门禁（裸 getenv / 未登记 key / 散落 VITE_ / 硬编码域名）
│   ├── CheckStructureTree.py          # 结构树漂移门禁（structure 文件 ⇄ 磁盘双向 diff）
│   └── archive/                       # 已废弃脚本，仅留档不执行
│       └── UpdateReadmeTree.py        # [已废弃 V3.6.37] 生成 FileTree.md（该文件已不存在）
│
├── Docs/                              # 项目文档（详见下方 Docs 文档树）
│   ├── LLM_record/                    # 维护日志（按日期归档）
│   ├── Architecture/                  # 现行架构 + decisions/ 历史记录
│   ├── Guide/                         # 指南、约定、门禁说明
│   ├── Demo/                          # 演示页与样例数据（⚠️ 非文档）
│   ├── TODO/                          # 方案与待办（⚠️ 入口见其 README.md）
│   ├── Example_prompt.md              # 任务启动提示词模板
│   ├── Force_command.md               # Agent 强制执行规范
│   └── README_EN.md                   # 英文版 README
│
├── LocalDev.bat                       # Windows 一键启动脚本（容器化全栈：web+api 双服务）
├── Write-Color.ps1                    # LocalDev.bat 彩色输出辅助脚本
├── .gitignore
├── LICENSE
└── README.md                          # 项目门户页
```

> **已迁出**：`workers/` —— Cloudflare Worker 源码现居 `NEGIAO.github.io` 仓库 `workers/`，本仓库不再保留副本。

---

## Docs 文档树

```text
Docs/
├── LLM_record/                        # 维护日志（按日期归档，不可改写）
│   ├── 26-04/ ~ 26-06/                # 早期日志（含 06-27 / 06-28 / 06-29 等不规则命名子目录，按 §6 保持原样）
│   ├── 26-07/                         # 2026-07（配置收敛、体积云画质/大气修复、OAuth 云优化、Agent 命令总线重构）
│   ├── 26-08/                         # 2026-08（底图 SSOT 重构、Review 修复、结构树同步）
│   ├── 26-09/                         # 2026-09（瓦片代理 VPS 迁移、在线 presence 身份修复）
│   ├── 26-10/                         # 2026-10（天地图多环裁剪、落地页 NJNU 重构、Cesium 绘制测量+贴地统一化、V3.6.24/3.6.36 归并）
│   └── 26-11/                         # 2026-11（HF 推送 LFS 字体修复、规范 §12 机器人 PR、文档治理、V3.6.37 单版本整合复核）
│
├── Architecture/                      # 架构设计文档（仅现行态）
│   ├── system-architecture.md         # 系统架构总览（五层：源码→CI/CD→部署→运行时→用户）
│   ├── cicd-pipeline.md               # CI/CD 流水线详解（五 Job 部署时序）
│   ├── deployment-relationship.md     # 部署关系与域名映射
│   ├── configuration-three-tier.md    # 三层配置架构 L1/L2/L3 全景
│   ├── ol-cesium-dual-engine.md       # 2D/3D 双引擎：切换、视图同步、URL 还原
│   ├── ol-cesium-coordinate-transform-spec.md # 双引擎视图尺度高精度双向转换实现规范（V3.6.37 自 TODO 迁入）
│   ├── basemap-source-system.md       # 底图源系统：20+ 图源、熔断回退、GCJ-02 纠偏
│   ├── multi-format-data-import.md    # 多格式数据导入：拖拽加载，2D/3D 双管线
│   ├── spatial-analysis-backend.md    # 空间分析：单端点分发，Shapely 后端 8 算子
│   ├── route-planning.md              # 路径规划：驾车/公交双管线
│   ├── cesium-planar-route.md         # 面状航线
│   ├── cesium-3d-effects.md           # 三维特效：体积云、风场、浅水叠加
│   ├── cesium-fluid-flood-simulation.md # 洪水淹没模拟：GPU 流体管线
│   ├── cesium-unified-layer-management.md # Cesium 统一图层管理
│   ├── tile-rectify-system.md         # 瓦片纠偏系统（历史稿，已迁出主链路）
│   ├── download-service.md            # 下载服务
│   ├── utility-tools.md               # 实用工具：测量、坐标拾取、罗盘
│   ├── account-system-ai-quota.md     # 账号体系：邮箱登录、三级身份、双 AI 配额
│   ├── identity-auth-security.md      # 身份鉴权链路与安全模型（信任边界、威胁、反爬强度）
│   ├── runtime-map-token-pool.md      # 运行时地图 token 池
│   ├── ios-safari-rendering-pitfalls.md # iOS Safari 旋转图层黑块：触发条件与动效规避规约
│   └── decisions/                     # 历史重构记录（日期命名，非现行架构）
│       ├── 2026-08-02-basemap-ssot-refactor.md    # 底图单一事实源重构
│       ├── 2026-08-20-unified-basemap-selection.md # 统一底图选择
│       └── 2026-08-22-clamp-to-ground-strategy.md  # 贴地策略
│
├── Demo/                              # ⚠️ 非文档：演示页与样例数据（详见其 README.md）
│   ├── README.md                      # 语义声明 + data/textures 需本地自备的说明
│   ├── 2dWindField.html               # 2D 风场
│   ├── 3dHeatMap.html                 # 3D 热力
│   ├── amapRectify.html               # 高德底图纠偏
│   ├── atmosphere.html                # 大气渲染
│   ├── beidou.html                    # 北斗定位/可视化
│   ├── buildingShade.html             # 建筑阴影
│   ├── customDashArrow.html           # 自定义虚线箭头
│   ├── draw_manager.html              # 绘制管理器（引用 DrawManager.js）
│   ├── DrawManager.js                 # 绘制管理器参考实现
│   ├── dynamicLable.html              # 动态标签
│   ├── first_person_fly.html          # 第一人称漫游
│   ├── height_limit_analysis.html     # 限高分析
│   ├── immensePointLoader.html        # 海量点加载
│   ├── mapTheme.html                  # 地图主题切换
│   ├── nearGroundBox.html             # 近地面盒体
│   ├── odFlyLine.html                 # OD 飞线
│   ├── slopeAnaysis.html              # 坡度/坡向分析
│   ├── submergeAnalysis.html          # 淹没分析
│   ├── underwater-depth-zones.html    # 水下深度区
│   ├── visibilityAnalysis.html        # 通视/可视域
│   ├── volume_analysis.html           # 体积/方量
│   ├── data/                          # 三维样例数据（.gitignore 排除，约 260 MB，需本地自备）
│   └── textures/                      # 贴图资源（.gitignore 排除）
│
├── Guide/                             # 指南文档（由根 README 拆分，原子化维护）
│   ├── project-structure.md           # 本文件：根级目录总览 + Docs 树（目录唯一权威）
│   ├── handover.md                    # 交接文档（文档地图 + 架构速览 + 代码坐标 + 坑清单）
│   ├── frontend-structure.md          # 前端完整文件树（唯一权威）
│   ├── backend-structure.md           # 后端完整文件树（唯一权威）
│   ├── CHANGELOG.md                   # 更新日志（版本记录唯一权威）
│   ├── dev-conventions.md             # 开发约定：分层边界 / 场景数据契约 / 移动端基线 / 门禁
│   ├── dev-guide.md                   # 开发指南（新增页面/API 标准流程）
│   ├── configuration.md               # 三层配置指南
│   ├── oauth-deployment.md            # Google/GitHub/HF OAuth 部署与排错
│   ├── bot-pr-playbook.md             # 依赖机器人 PR 操作手册（§12 的命令层补充）
│   ├── ESRI_Wayback_Layers_List.md    # ESRI Wayback 196 个历史影像快照清单
│   ├── compass-types-note.md          # compass/svg/types 类型说明
│   └── faq.md                         # 技术栈与 FAQ
│
├── Example_prompt.md                  # 任务启动提示词模板（Bug/功能/重构/审计四类）
├── Force_command.md                   # Agent 强制执行规范（速览/分级/边界/SOP/SSOT/DoD/交接块/机器人 PR）
├── README_EN.md                       # 英文版 README（全文翻译）
├── Refactor.md                        # 重构记录
└── TODO/                              # 方案与待办（⚠️ 入口：README.md）
    ├── README.md                      # 索引 + 状态机（唯一索引入口，先读这个）
    ├── bugfix-optimization-plan.md    # 滚动修复主规划（P0–P3，顺带发现的登记处）
    ├── 2026-10-31-turnstile-auth-hardening-plan.md     # Turnstile 人机校验加固（待批准）
    ├── 2026-10-25-tileset-large-area-terrain-fit-plan.md # 3D Tiles 大面积地形贴合（待确认）
    ├── 2026-10-17-landing-njnu-14-items-plan.md        # 落地页 14 条借鉴清单
    ├── 2026-08-20-planar-route-migration-proposal.md   # 平面路线迁移提案
    ├── tencent-building-import-plan.md # 腾讯建筑白模抓取入库（待批准，V3.6.37 自 Architecture 迁入）
    ├── cesium-toolpanel-migration-plan.md # CesiumToolPanel 迁入统一 TOC（待批准）
    ├── route-fly-module-plan.md        # 路线漫游 RouteFly（待批准）
    ├── plan-ovital-tdtkey-l2.md        # 奥维 tdtkey 密钥池化（待批准）
    ├── remote-service-sublayer-independent-layers-plan.md # 在线服务子图层独立成层（待实施）
    ├── proxy-ssrf-hardening-plan.md    # 代理 SSRF 加固（S1/S2 已实施，S3/S4 待评估）
    ├── plan-download-async-l2-ttl.md   # 下载异步化 + L2 缓存 TTL
    ├── loading-performance-optimization-plan.md # 首屏加载性能
    ├── account-panel-ui-optimization.md # 账号面板 UI 优化
    ├── plan-download-feature-git-marker.md # 底图下载代码位置标记（搁置）
    ├── backend-reorg-plan.md           # 后端包结构重构（⚠️ 待人工确认）
    ├── OverPassApiIntegration/         # OverPass API 集成调研
    └── archive/                        # 已实施 / 已废弃方案（只迁移不删除，10 篇）
```

---

## 变更记录（本文件自身）

| 版本 | 变更 |
|---|---|
| V3.6.37 | 新增「目录治理约定」；`Scripts/archive/`、`Architecture/decisions/`、`TODO/README.md`、`Demo/README.md`、`Guide/bot-pr-playbook.md` 入库；`TODO/` 全量重列（原仅列 7/23 且含已归档项）；补齐 `Architecture/` 漏列的 `cesium-planar-route` / `download-service` / `tile-rectify-system`；`Demo/` 补 `draw_manager` / `first_person_fly` 并标注非文档 |
