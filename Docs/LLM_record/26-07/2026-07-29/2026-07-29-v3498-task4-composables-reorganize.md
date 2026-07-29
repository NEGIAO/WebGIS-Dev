# Task 4: composables 横切整理（Phase 8）

- **日期与时间**：2026-07-29 14:30
- **任务等级**：L2
- **版本号**：V3.4.98

---

## 问题分析

### 核心症状
前端 `composables/` 目录积累了大量横切关注点的 composable 文件（25+ 个），散落在根目录和子目录中，缺乏领域归属。随着 domains 架构推进（Tasks 1-3 已完成组件/工具迁移），这些 composables 需要按领域重新归类，以消除 `composables/` 作为"万能垃圾桶"的反模式。

### 根本原因
- 历史开发中 composables 按"功能类型"而非"业务领域"组织
- 随着 domains 架构建立，chat/weather/auth/layer 等领域的 composables 应就近存放在对应域内
- 根目录散落的 composables（useMessage、useLocale、useUserLocation 等）缺乏清晰归属

### 受影响模块
- Chat 对话系统（5 个 composables）
- 天气系统（2 个 composables）
- 用户认证（1 个 composable）
- 粒子特效 Magic（6 个 composables）
- Shell/UI 层（useMessage、useMessageIslandMotion）
- 国际化（useLocale）
- 工具类（useMarkdownRenderer、useErrorHandler）
- 地图视图（useUserLocation）
- 数据导入（useSharedResourceLoader、useKmzLoader、useGisLoader）
- OL 图层管理（useManagedLayerRegistry、useUserLayerActions、useStyleEditor）
- OL 交互（useMapSwipe、useTileSourceFactory）

### 候选方案对比

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A. 全部迁入 domains | 按业务领域拆分到 common/chat、common/weather、ol/composables 等 | 领域内聚、路径语义清晰 | 改动面大（~150 处 import） |
| B. 保留根目录 + 新增 domains | 旧路径不动，新文件直接写 domains | 零迁移成本 | 双路径并存，长期维护负担 |
| C. 按功能类型保留 | 维持 composables/ 结构，仅整理子目录 | 改动最小 | 与 domains 架构方向矛盾 |

**选定方案 A**：与整体 domains 架构方向一致，一次性完成迁移。

---

## 修改内容

### 文件迁移清单（25+ 文件）

#### 子目录文件（13 个）

| 源路径 | 目标路径 |
|--------|----------|
| `composables/chat/chatIntentFallback.js` | `domains/common/chat/composables/chatIntentFallback.js` |
| `composables/chat/useAgentMapContext.js` | `domains/common/chat/composables/useAgentMapContext.js` |
| `composables/chat/useChatAgentConfig.js` | `domains/common/chat/composables/useChatAgentConfig.js` |
| `composables/chat/useChatSession.js` | `domains/common/chat/composables/useChatSession.js` |
| `composables/weather/useWeatherCharts.js` | `domains/common/weather/composables/useWeatherCharts.js` |
| `composables/weather/useWeatherData.js` | `domains/common/weather/composables/useWeatherData.js` |
| `composables/auth/useAuthIdentity.js` | `domains/common/user/composables/useAuthIdentity.js` |
| `composables/Magic/useDelaunay.js` | `domains/common/components/Magic/useDelaunay.js` |
| `composables/Magic/useFluid.js` | `domains/common/components/Magic/useFluid.js` |
| `composables/Magic/useGravity.js` | `domains/common/components/Magic/useGravity.js` |
| `composables/Magic/useRingExplosion.js` | `domains/common/components/Magic/useRingExplosion.js` |
| `composables/Magic/useSingularity.js` | `domains/common/components/Magic/useSingularity.js` |
| `composables/Magic/useWave.js` | `domains/common/components/Magic/useWave.js` |

#### 根目录散落文件（14 个）

| 源路径 | 目标路径 |
|--------|----------|
| `composables/useMessage.js` | `domains/common/shell/useMessage.js` |
| `composables/useMessageIslandMotion.js` | `domains/common/shell/useMessageIslandMotion.js` |
| `composables/useLocale.js` | `domains/common/app/useLocale.js` |
| `composables/useMarkdownRenderer.js` | `domains/common/utils/useMarkdownRenderer.js` |
| `composables/useErrorHandler.ts` | `domains/common/utils/useErrorHandler.ts` |
| `composables/useUserLocation.js` | `domains/common/map-view/useUserLocation.js` |
| `composables/useSharedResourceLoader.ts` | `domains/common/data-import/useSharedResourceLoader.ts` |
| `composables/useKmzLoader.js` | `domains/common/data-import/useKmzLoader.js` |
| `composables/useGisLoader.ts` | `domains/common/data-import/useGisLoader.ts` |
| `composables/useAgentConfig.js` | `domains/common/chat/composables/useAgentConfig.js` |
| `composables/useManagedLayerRegistry.js` | `domains/ol/layer/composables/useManagedLayerRegistry.js` |
| `composables/useUserLayerActions.js` | `domains/ol/layer/composables/useUserLayerActions.js` |
| `composables/useStyleEditor.js` | `domains/ol/layer/style/useStyleEditor.js` |
| `composables/useMapSwipe.ts` | `domains/ol/composables/useMapSwipe.ts` |

#### 特殊处理

| 文件 | 处理方式 | 原因 |
|------|----------|------|
| `useTileSourceFactory.ts` | 迁入 `domains/ol/composables/` | 原属 composables 根目录，被误删后从 git 恢复 |
| `useMapSwipeTest.ts` | 迁入 `domains/ol/composables/` | 测试文件，跟随主文件 |
| `useMapViewUrlState.js` | 删除 | 已被 `domains/ol/url-state/useMapViewUrlState.js` 取代 |

### 新建目标目录（7 个）
- `domains/common/chat/composables/`
- `domains/common/weather/composables/`
- `domains/common/user/composables/`
- `domains/common/components/Magic/`
- `domains/common/utils/`
- `domains/common/map-view/`
- `domains/ol/composables/`

### 内部路径修复
迁移后部分文件内部 import 路径需要调整：
- `domains/common/shell/useMessage.js`：`goldenSoupQuotes` 路径 `../../data/` → `../../../data/`
- `domains/common/app/useLocale.js`：`coreMessages` 路径 `../locales/` → `../../../locales/`
- `domains/common/app/useLocale.js`：动态 import `en-US.js`/`zh-CN.js` 路径同上

### 消费方 import 更新（~150 处）

| 类型 | 处理方式 | 文件数 |
|------|----------|--------|
| useMessage.js 引用 | 子 Agent 批量处理 | 34 |
| useLocale.js 引用 | 子 Agent 批量处理 | 55 |
| 其他 composables 引用 | 手动更新 | ~20 |
| 构建错误修复（Tasks 1-3 遗留） | 手动修复 | ~10 |

### 构建错误修复（Tasks 1-3 遗留，非 Task 4 范围但必要）

| 文件 | 修复内容 |
|------|----------|
| `domains/ol/utils/usePositionCodeTool.js` | `../../api` → `@/api` |
| `domains/ol/utils/biz/index.js` | `../coordinateFormatter` → `@common/map-view/coordinateFormatter` |
| `domains/ol/utils/biz/index.js` | `../coordinateInputHandler` → `@ol/search/utils/coordinateInputHandler` |
| `domains/ol/utils/biz/index.js` | `../labelValidator` → `@common/utils/labelValidator` |
| `domains/common/weather/composables/useWeatherData.js` | `../../api` → `@/api` |
| `domains/common/chat/composables/useAgentConfig.js` | `./useLocale.js` → `@common/app/useLocale` |
| `domains/ol/layer/composables/useUserLayerActions.js` | `./useMessage` → `@common/shell/useMessage` |
| `domains/ol/data-import/composables/useLayerDataImport.js` | `@common/data-import/io` → `@common/data-import/parsers/shpParser` |
| `domains/ol/data-import/composables/useLayerDataImport.js` | `@common/data-import` barrel → 具体文件路径 |
| `domains/common/data-import/useGisLoader.ts` | `@common/data-import/parsers` → 具体文件路径 |

---

## 修改原因
1. **架构一致性**：domains 架构要求功能就近存放，composables 按领域归属而非类型归属
2. **可维护性**：消除 `composables/` 作为"万能垃圾桶"的反模式
3. **可发现性**：开发者能在对应域目录内找到所有相关 composables
4. **构建优化**：域内就近引用减少相对路径层级

---

## 影响范围
- **系统模块**：Chat 对话、天气系统、用户认证、粒子特效、Shell/UI、国际化、数据导入、OL 图层管理
- **文件数量**：25+ 个 composables 文件迁移，~150 处 import 引用更新
- **目录变更**：7 个新目录创建，1 个旧目录（composables/）删除
- **构建产物**：无功能变更，仅路径重组

---

## 解决方案
采用"全量迁移 + 批量 import 更新"策略：
1. 按业务领域将 25+ composables 文件分类迁移到目标 domains 目录
2. 使用子 Agent 批量处理高频引用（useMessage 34 处、useLocale 55 处）
3. 手动处理低频引用和特殊路径修复
4. 删除旧 `composables/` 目录
5. 构建验证 + 修复 cascading 路径错误

---

## 性能指标
- **未实测**：本次为纯路径重组，无运行时性能变化
- **构建时间**：约 25-31s（与迁移前持平）

---

## 测试方案

### Agent 已执行
- [x] `npm run build` 构建通过（`✓ built in 30.97s`，2305+ modules transformed）
- [x] 无 git 写操作（符合硬边界）
- [x] 旧 `composables/` 目录已完全删除
- [x] 无相对 `composables/` 路径残留（grep 验证）

### 待用户实机验证
- [ ] 启动 dev server，验证 Chat 对话功能正常（useMessage、useChatSession、useChatAgentConfig）
- [ ] 验证天气面板正常（useWeatherCharts、useWeatherData）
- [ ] 验证国际化切换正常（useLocale）
- [ ] 验证用户登录/注册正常（useAuthIdentity）
- [ ] 验证粒子特效正常（useRingExplosion 等 Magic composables）
- [ ] 验证图层管理正常（useManagedLayerRegistry、useUserLayerActions）
- [ ] 验证数据导入正常（useGisLoader、useKmzLoader、useSharedResourceLoader）
- [ ] 验证地图滑动对比正常（useMapSwipe）

---

## 变更文件清单

### 新建文件（25+）
- `src/domains/common/chat/composables/chatIntentFallback.js`
- `src/domains/common/chat/composables/useAgentMapContext.js`
- `src/domains/common/chat/composables/useChatAgentConfig.js`
- `src/domains/common/chat/composables/useChatSession.js`
- `src/domains/common/chat/composables/useAgentConfig.js`
- `src/domains/common/weather/composables/useWeatherCharts.js`
- `src/domains/common/weather/composables/useWeatherData.js`
- `src/domains/common/user/composables/useAuthIdentity.js`
- `src/domains/common/components/Magic/useDelaunay.js`
- `src/domains/common/components/Magic/useFluid.js`
- `src/domains/common/components/Magic/useGravity.js`
- `src/domains/common/components/Magic/useRingExplosion.js`
- `src/domains/common/components/Magic/useSingularity.js`
- `src/domains/common/components/Magic/useWave.js`
- `src/domains/common/shell/useMessage.js`
- `src/domains/common/shell/useMessageIslandMotion.js`
- `src/domains/common/app/useLocale.js`
- `src/domains/common/utils/useMarkdownRenderer.js`
- `src/domains/common/utils/useErrorHandler.ts`
- `src/domains/common/map-view/useUserLocation.js`
- `src/domains/common/data-import/useSharedResourceLoader.ts`
- `src/domains/common/data-import/useKmzLoader.js`
- `src/domains/common/data-import/useGisLoader.ts`
- `src/domains/ol/layer/composables/useManagedLayerRegistry.js`
- `src/domains/ol/layer/composables/useUserLayerActions.js`
- `src/domains/ol/layer/style/useStyleEditor.js`
- `src/domains/ol/composables/useMapSwipe.ts`
- `src/domains/ol/composables/useTileSourceFactory.ts`
- `src/domains/ol/composables/useMapSwipeTest.ts`

### 删除文件/目录
- `src/composables/` 整个目录（含所有子目录）

### 修改文件（import 引用更新）
- 34 个文件更新 useMessage 引用
- 55 个文件更新 useLocale 引用
- ~20 个文件更新其他 composables 引用
- ~10 个文件修复 Tasks 1-3 遗留构建错误

### 文档更新
- `README.md`：版本号 V3.4.97 → V3.4.98（3 处）
- `Docs/Guide/CHANGELOG.md`：追加 V3.4.98 条目

---

## 遗留与风险
- **无遗留问题**：所有 Task 4 范围文件已正确迁移，构建通过
- **Tasks 1-3 遗留问题**：已在本次会话中一并修复（biz/index.js、useGisLoader.ts 等）
- **潜在风险**：IDE linter 可能偶尔将 `@ol/composables/useTileSourceFactory` 改回旧路径（已多次观察到此现象），需注意后续开发中保持 alias 一致
- **版本号说明**：本次任务本应 +1 至 V3.4.98，因 Task 5 并行完成顺延至 V3.4.99；README 与 CHANGELOG 均已正确记录

---

## 下一步建议
- Task 5（stores 横切整理）可按计划推进
- 建议在 Task 5 完成后运行 `CheckStructureTree.py` 验证前端结构树一致性
- 建议在全部 Tasks 1-5 完成后统一运行 `CheckConfigRegistry.py`
