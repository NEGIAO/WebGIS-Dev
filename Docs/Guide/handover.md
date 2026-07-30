# WebGIS 交接文档（Handover）

> 目的：让接手者（人或 AI 会话）**半天内具备独立开发能力**。
> 本文只写导航、代码坐标与"别处没写的坑"；细节一律链接既有文档，不重复维护。
> 基线版本：V3.4.46（2026-07-26，§7 并入并行会话交接契约）· 返回 [根 README](../../README.md)

---

## 1. 三十秒认识项目

前后端分离 WebGIS 平台：**Vue 3 + Vite + OpenLayers(2D) + Cesium(3D)** 前端托管 GitHub Pages；
**FastAPI + Docker** 后端部署 Hugging Face Space（:7860，SQLite 持久化于 `/data`）。
2D/3D 双引擎一键切换，账号体系（邮箱 + Google/GitHub OAuth）、AI 助手、空间分析、
体积云/风场/洪水三维特效、统一图层管理为核心能力。

## 2. 十分钟跑起来

1. clone 后**只看一个文件**：根 [`.env.example`](../../.env.example)（全部配置 key 的唯一权威清单，分层注释）。
2. Windows 双击 `LocalDev.bat`：自动生成根 `.env.local`（若缺失）、跑门禁自检、起 Docker 后端 + Vite 前端并开浏览器。
3. 默认账号：游客 `user/123`；管理员 `admin/123456`（本地 dev；生产密码 = HF Secrets 的 `SUPER_USER`）。
4. 手动方式与 HF 生产部署 → [configuration.md](configuration.md)（含「HF Secrets 最小集合」复制清单）。

## 3. 文档地图（哪类问题看哪里）

| 你想… | 看这里 |
|--------|--------|
| 配置/部署/密钥分层 | [configuration.md](configuration.md)（手册）→ [configuration-three-tier.md](../Architecture/configuration-three-tier.md)（运行原理）→ [执行计划](configuration-architecture-plan.md)（演进史） |
| OAuth 登录配置排错 | [oauth-deployment.md](oauth-deployment.md) |
| 找某个文件/理解目录 | [project-structure.md](project-structure.md) → [frontend-structure.md](frontend-structure.md) / [backend-structure.md](backend-structure.md)（唯一权威树，改文件必同步） |
| 理解某功能架构 | `Docs/Architecture/` 十一篇（双引擎/底图/导入/分析/特效/账号/配置/图层管理…），入口见根 README「架构文档」表 |
| 查某次改动的来龙去脉 | [CHANGELOG.md](CHANGELOG.md)（版本索引）→ `Docs/LLM_record/<日期>/`（每次任务的完整维护日志：症状/根因/方案/文件清单） |
| 开发规范与流程 | `Docs/Force_command.md`（**强制**：先文档后代码、每任务必写日志与版本记录）+ [dev-conventions.md](dev-conventions.md) |

## 4. 三大核心架构速览（近期落地，接手必读）

### 4.1 三层配置（谁读什么、密钥去哪）

```text
L1 双 env 文件架构：
  .env       → 部署环境（git 追踪）：npm run build + 线上部署读取
  .env.local → 本地开发（git 追踪）：npm run dev + 本地后端读取
L2 Admin 面板 + SQLite（地图 token 池 / Agent 参数 / 底图 / 公告）→ 运营改，免重启
L3 HF Secrets（SUPER_USER / OAuth secret / SMTP 密码 / API Key）→ 只有后端环境变量可读
```
- 后端**唯一** `os.environ` 读取端：`backend/config/`（catalog 登记表 / load 快照 / runtime L2 覆盖 / public 公开配置）。`load.py` 先读 `.env`，再在读 `.env.local`（仅文件存在时，即本地开发）。
- 前端**唯一** `import.meta.env` 读取端：`src/config/publicRuntime.ts`（基址派生 + 4 个 URL helper）。通过 `selectiveEnvPlugin` 按 mode 二选一：production 读 `.env`，development 读 `.env.local`。
- **新增配置 key 流程**：先登记根 `.env.example` + `backend/config/catalog.py` → 再写代码 → 跑门禁。

### 4.2 Cesium 统一图层管理（3D 数据 ↔ TOC）

- 原则：**元数据入店、句柄留场**——`stores/layer/cesiumLayers.ts` 只存可序列化元数据；
  Cesium 句柄留在 `useCesiumDataImport.loadedDataSources`，场景操作经 CesiumContainer 注册的 adapter 回调。
- 数据流：导入 → 容器 watch 差量入店 → 卡片（3D 数据页签）与 TOC「三维数据」分组**双入口同源**；
  TOC 动作按节点 id 前缀 `cesium:` 在 `cesiumTocActions.js` 分流直调 store，2D 链路零耦合。
- 7 类数据（GeoJSON/KML/CZML/SHP/TIF/GLB/3D Tiles）全支持显隐/透明度/重命名/定位/移除；
  显隐透明度的类型适配集中在 `dataSourceDisplay.js`（一个 switch，加新类型只改这里）。
- 详设与决策记录：[cesium-unified-layer-management.md](../Architecture/cesium-unified-layer-management.md)。

### 4.3 Cesium 三维分析（通视/限高）与功能模块范式

- `components/Cesium/Analysis/`：**独立文件夹模块**——分析器类（注入 getViewer/getCesium，零全局依赖）
  + `analysisModule.js` 声明式 GUI 控件 + `index.js` 运行时工厂（懒实例化/分发/销毁）。
- **给 3D 加新功能就抄这个范式**：建文件夹 → 写 `create<X>Module`（controls 数组）→
  在 `useCesiumToolModules.js` 注册模块与 `handleToolControlChange` 分支 → 面板自动渲染（LilGuiControls）。
  按钮控件 = `type:'button'` + value 为稳定空函数，动作按 controlId 分发。

### 4.4 前端 UI 设计令牌与 Chat/编辑模块（UI/UX 线，接手改界面必读）

- **设计令牌**（`assets/theme.css`）：跨组件浮层 z-index 必用 `--z-*` 六档（禁新增魔数）；
  地图浮层面板框架用 `--panel-*`；新代码字号用 `--fs-*`；颜色一律主题变量（绿/蓝双主题联动）。
- **Chat 模块**：容器只编排（软取消 requestSeq/工具两轮/打字机），展示归 4 子组件 + 3 composable；
  会话持久化 `chat:history:v1`；配置对象 provide/inject 共享。
- **几何编辑**：`useGeometryEdit` 覆盖全矢量托管图层（路线/栅格/WebGL 除外）；TOC 右键「编辑要素」与
  绘制面板 SelectEdit 共用同一引擎；非绘制图层删空保留记录（移除权归 TOC）。
- **用户偏好消费模式**：store 写 runtime 缓存（`webgis_pref_*`）→ 消费方同步读取（零 Pinia、不阻塞初始化）；
  底图优先级恒为 URL 参数 > 用户偏好 > 管理员默认（2D/3D 共用 preset id）。
- 细节与验收清单：[UI/UX 线交接文档](../LLM_record/26-07-26/2026-07-26-handover-ui-ux-workstream.md)。

## 5. 高频修改场景 → 代码坐标

| 场景 | 入口 |
|------|------|
| 加后端 API | `backend/api/<域>.py` + `app.py` 挂路由；配置经 `from config import get_settings/get_str` |
| 加底图源 | `constants/basemap/basemapConfig.ts` + `sourceDescriptors.ts`（**两文件对称**，基址用 publicRuntime helper 禁硬编码域名） |
| 加 3D 工具模块 | §4.3 范式；参数默认值同时登记 catalog/.env.example（若走 env） |
| 改 2D TOC 行为 | `stores/useLayerStore.ts`（树）/ `components/Layer/TOCPanel.vue`（动作）/ `layerTreeBuilder.ts`（节点契约） |
| 改 Admin 面板 | `components/UserCenter/AdminControlPanel.vue` + `backend/api/admin.py`；L2 对照表见 configuration.md |
| 改 Agent/LLM | 后端 `api/agent_chat/`（密钥解析链：DB 池 ▸ env）；前端 `components/Chat/`（容器编排）+ `composables/chat/`（配置/会话/意图） |
| 改主题/面板样式 | `assets/theme.css` 令牌（--z-\*/--panel-\*/--fs-\*）；面板接入范式抄 `DrawPanel.vue` |
| 改账号中心/偏好 | `components/UserCenter/`（壳 + tabs）；新偏好项按 §4.4 消费模式接入 |
| 版本号 | 只改根 README 三处（简介/表首/页脚），Vite 构建时自动注入 `__APP_VERSION__` |

## 6. 门禁与提交流程（每次改动后）

1. `python CheckConfigRegistry.py` —— 配置登记七项扫描（裸 getenv / 未登记 key / 散落 env 读取 / 硬编码域名），违规 exit 1。
2. `python CheckStructureTree.py` —— 文件树与实际代码双向 diff（增删文件必同步 structure 文档）。
3. ESLint 改动文件；TS 文件跑 `npx tsc --noEmit`（存量错误见 §8，只看自己文件）。
4. 按 `Force_command.md` 写维护日志（`Docs/LLM_record/YY-MM-DD/`，模板含症状/根因/方案/测试/文件清单）
   + README 版本三处 + CHANGELOG 条目（版本表只留最新三条，旧的归档 CHANGELOG）。
5. **git 提交由用户本人执行**，Agent/协作者只准备变更。

## 7. 别处没写的坑（血泪清单）

- **Cesium/OL 对象绝不进 Vue 响应式**（ref/reactive/Pinia state）——深代理会崩性能甚至崩场景。
  模式：元数据进店，句柄用模块级 Map/WeakMap 或 `markRaw`/`toRaw`。
- **根 `.env` 与 `.env.local` 双文件架构**：两个文件都提交 git（L1 不涉密），`.env` = 部署环境，`.env.local` = 本地开发；
  Vite 通过 `selectiveEnvPlugin` 按 mode 二选一，后端 `load.py` 先读 `.env`、再读 `.env.local`（本地覆盖生产值）。
  改 `APP_ENV` 等后端值需**重建容器**（compose environment 段优先于 env_file）。
- **tileset 透明度与材质模式互写 style**：语义为"最后操作生效"，透明度拉回 100% 会清 style 还原。
- **JSDoc 注释里别写 `*/`**（如 `vis*/limit*`）——会提前终止块注释，ESLint 报 Invalid character。
- **多会话并行开发时版本号常撞车**：以 CHANGELOG 先占者为准，后完成的任务顺延一号并在日志备注；
  写记录前先 `grep 当前版本 README.md` 复核（README 可能在你读写之间被并行会话推进）。
- **挂载盘上 git/npm 命令很慢**：沙盒/CI 中避免 `git status` 全量扫描，ESLint 分批跑。
- **Cowork 挂载盘禁止 rm/mv，`.git` 目录只读**：删除/改名类操作走「新建文件 + 标注 DEPRECATED + 给用户 git 命令」
  模式，由用户本机执行；超时被杀的 git 命令可能残留 `.git/index.lock`，需用户手动删。
  沙盒跑 ESLint 用 `node node_modules/eslint/bin/eslint.js`（`.bin` 垫片不可用）。
- **barrel 链已两层化**：新增 feature 模块**只登记 `composables/map/features/index.js` 一处**（规范见
  `features/README.md`）；ESM `export *` 重名会**静默丢弃**——改 barrel 前先做导出名核验
  （V3.4.31 日志 `2026-07-26-frontend-architecture-quickwins.md` 有现成 node 校验脚本）。
- **属性表 revision 契约不变式**：图层内容级变更必须**整体重赋值** `item.features` 数组（触发注册表
  revision 递增 → attrStore 快路径），就地改属性会静默失效（注册表注释有说明）。
- **容器瘦身 factory 抽离模式**（V3.4.29 日志）：依赖注入；晚声明依赖用 getter 延迟解析；工厂参数在
  调用点求值——**逐一核对 TDZ**（函数声明提升可依赖，const 不行）。
- **admin/user 是保留账号**：禁绑 OAuth；管理员角色按用户名归一化，DB 角色字段不被信任。

## 8. 已知边界与待办

- **待实机回归**（沙盒无法跑 vite/uvicorn，静态验证已过）：统一图层管理双入口互通、矢量透明度反复调节、
  三维分析两工具、`npm run build` 产物域名扫描——各任务日志的「测试方案」节有逐条清单。
- **存量 tsc 错误**：cesium 模块类型解析（Windows 安装的 node_modules 在异构环境）与个别历史文件——与新代码无关。
- **候选增强**（未排期）：TOC 三维节点属性表（DataSource entity properties 数据已具备）、
  分析结果导出、Demo 库剩余候选（odFlyLine 飞线/buildingShade 白膜）、矢量透明度覆盖非 Color 材质。

---

*本文随重大架构变化更新（更新时在 CHANGELOG 留痕）；日常改动看维护日志即可。*
