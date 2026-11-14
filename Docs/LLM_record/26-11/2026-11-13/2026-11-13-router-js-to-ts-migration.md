# router 目录 js→ts 迁移

- **日期与时间**：2026-11-13 16:49
- **任务等级**：L2（文件改名 + 补类型，涉及文件增删）
- **版本**：V3.6.56（按 §5 顺延，收尾时 README 仍为 V3.6.55）

---

## 一、需求与问题分析

### 用户诉求

`frontend/src/router` 目录下两个 JS 文件（`index.js`、`lazyHomeViewLoader.js`）改为 TS（js→ts 迁移散件，延续本仓正在进行的 JS→TS 大迁移）。

### 事实基线（动手前实测）

| 项 | 事实 |
|---|---|
| 待迁移文件 | `router/index.js`（232 行，路由表 + 鉴权守卫）、`router/lazyHomeViewLoader.js`（9 行，HomeView 二段式懒加载） |
| 外部引用 | `main.ts:4` 用目录导入 `import router from './router'`（解析到 index）；`index.js:22` 动态 `import('./lazyHomeViewLoader')`（无扩展名，Vite 自动解析 .ts）；仅 `useRoutePrefetch.ts:12` 注释提及 `router/index.js`（非 import） |
| `RouteMeta` 增强 | 项目全局**未**对 `vue-router` 的 `RouteMeta` 做模块增强（`grep` 零命中） |
| `.vue` 模块声明 | `src/vue-shims.d.ts:7` 已 `declare module '*.vue'`，`.vue` 动态导入不会报错 |
| 结构树 | `frontend-structure.md` L901–903 仍为 `index.js` / `lazyHomeViewLoader.js` |

### 根因

`.js` 时期 `tsconfig` 为 `strict:false / noImplicitAny:false`，`meta: { requiresAuth }` 等被宽松语义掩盖；改名 `.ts` 后，若 `RouteMeta` 仍是空接口，对象字面量多余属性检查会触发 TS2353。需在 `.ts` 中补 `RouteMeta` 模块增强（纯类型）以消除该风险——与迁移「改名 + 补类型」的既定方针一致。

---

## 二、修改内容

1. **文件系统改名**（§2.1 禁止 git 写操作，故用 `mv` 而非 `git mv`）：
   - `frontend/src/router/index.js → index.ts`
   - `frontend/src/router/lazyHomeViewLoader.js → lazyHomeViewLoader.ts`
2. **`index.ts` 补类型**：
   - 新增 `declare module 'vue-router' { interface RouteMeta { requiresAuth?: boolean; skipAuthCheck?: boolean } }`（模块增强，纯类型、零运行时变化）。
   - `beforeEach` 守卫回调 `to` / `from` 补 `RouteLocationNormalized` 注解；`readRouteQueryValue` / `readShareFlagFromRoute` / `cacheRoutePositionCode` 三个辅助函数补 `route: RouteLocationNormalized` 与 `key: string` 注解；从 `vue-router` 导入 `type RouteLocationNormalized`。
3. **结构树同步**：`frontend-structure.md` L901–903 的 router 段 `index.js → index.ts`、`lazyHomeViewLoader.js → lazyHomeViewLoader.ts`。
4. **注释引用更正**：`frontend/src/app/composables/useRoutePrefetch.ts:12` 注释中 `router/index.js` → `router/index.ts`。
5. **导出签名与运行时逻辑不变**：`export default router`、`loadHomeView()` 行为不变。

---

## 三、修改原因

延续本仓 JS→TS 大迁移（umbrella 日志 V3.6.45 既定方针：改名 + 补类型 + 修显式 `.js` 导入后缀，对外导出签名不变）。router 不在 V3.6.45 那批 26 个暂存文件内，属后续散件迁移。

---

## 四、影响范围

- 路由与鉴权守卫（登录 / 分享模式 / URL 参数提取）链路——纯类型注解，行为不变。
- 文档：结构树 router 段、CHANGELOG、本日志。

---

## 五、解决方案

选定「文件系统改名 + `RouteMeta` 模块增强 + 守卫/辅助函数注解」：模块增强是 Vue Router 处理自定义 `meta` 字段的官方推荐做法，且为类型安全零运行时成本；相比逐处 `as` 断言或把 routes 标 `any`，增强全局受益、一次性解决。

---

## 六、性能指标

未实测（纯类型注解，无运行时逻辑变化）。

---

## 七、测试方案

### Agent 已执行

- `npx tsc --noEmit`：`router/` **0 错误**；全项目当前 **596 处**错误全部位于并行会话活跃迁移的其他文件（`api/`、`domains/cesium/modules/cloud/`、`layer-tree/`、`basemap/` 等），无一属 router。
- `python Scripts/CheckConfigRegistry.py`：✅ 全绿（无配置改动）。
- `python Scripts/CheckStructureTree.py`：❌ exit 1，但 router 段自洽（不在 454 条漂移清单内）；其余 454 条漂移（224 漏登记 + 230 幽灵）均为并行会话 js→ts 改名尚未同步结构树，非本任务范围，按 §2.4 不越权代改。
- 红线扫描（§11.2，范围 `router/`）：✅ 零命中。

### 待用户实机验证

1. IDE：重启 TS Server / 重开 `router/index.ts`，确认无 TS 诊断。
2. 运行 `npm run dev`，验证首屏路由（`/`、`/home` 鉴权守卫、`/register` 分享模式）与 HomeView 二段式懒加载正常。
3. `git status` 复核：`router/index.js` 显示 deleted、`router/index.ts` 显示 untracked（或 `git add -A` 后显示为 `R` 重命名）；本会话未执行任何 git 写操作。

---

## 八、变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/router/index.js → index.ts` | 路由与守卫改名 .ts + RouteMeta 增强 + 类型注解 |
| `frontend/src/router/lazyHomeViewLoader.js → lazyHomeViewLoader.ts` | HomeView 二段式懒加载改名 .ts |
| `frontend/src/app/composables/useRoutePrefetch.ts` | 注释中 `router/index.js` → `router/index.ts` |
| `Docs/Guide/frontend-structure.md` | router 段同步为 .ts |
| `README.md` | 版本号三处更新至 V3.6.56 |
| `Docs/Guide/CHANGELOG.md` | 顶部追加 V3.6.56 条目 |
| `Docs/LLM_record/26-11/2026-11-13/2026-11-13-router-js-to-ts-migration.md` | 本日志 |

---

## 九、遗留与风险

- **并行会话活跃迁移导致项目级 tsc 596 错误 + 结构树 454 条漂移**：均为并行会话正在改写的其它文件（git 暂存区 `R` 改名文件及其 WIP），非本任务引入，按 §2.5 不越权代改、不登记为"bug"。
- **文件系统改名 vs `git mv`**：本会话因 §2.1 未走 `git mv`，git 索引会显示 delete + untracked；用户或并行迁移流程执行 `git add -A` 时 git 会自动识别为 rename。若并行会话此前已将 router 纳入其自身迁移清单并随后执行 `git mv router/index.js router/index.ts`，可能因文件已不存在而失败——router 已显式分配给本会话，预期不冲突，但需在交接中提示。
- **版本号撞车可能**：收尾时 README 为 V3.6.55，本任务定 V3.6.56；若并行会话随后升号撞车，按 §5 后完成者顺延。
