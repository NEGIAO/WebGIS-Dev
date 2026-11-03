# ESLint 存量告警清零 + 认证页 iPad 黑块修复 + fontawesome 残留清理

## 基本信息

| 项 | 内容 |
|---|---|
| 日期与时间 | 2026-11-03 17:45 |
| 任务等级 | **L2**（多文件机械修复 + 1 处 CSS 行为变更 + 1 处破坏性清理，均在前一轮 code review 清单内，经用户指令授权） |
| 版本 | V3.6.40 → **V3.6.40** |
| 触发方式 | code review（V3.6.40 暂存区）后用户指令「修复遗留问题」 |

---

## 一、问题分析

### 1.1 ESLint 存量 30 条（29 error + 1 warning / 23 文件）

- 核心症状：`eslint src` 全量恒红（30 条），`lint` 脚本无法作为门禁信号。
- 根本原因：ESLint 升至 10.13.0 后 `no-useless-assignment` / `preserve-caught-error` 进入 recommended，存量代码写于规则之前（V3.6.36 记录过基线 55 条，修 25 条后余 30 条）。
- 受影响模块：19 个文件（cesium / common / ol 三域 + api）。

### 1.2 认证页 `.auth-decor__ring--outer::after` iPad 黑块风险

- 核心症状：两公转点与落地页 V3.6.40 修掉的黑块同构（「整块透明 + 圆角裁剪 + 绕圆心自转」）；认证页 ≤768px 整层关闭覆盖手机，但 **iPad（>768px）不走该分支**。
- 根本原因：V3.6.40 只处理了落地页；认证页同构层未收口，且记录两说矛盾（日志遗留节建议「拆兄弟节点」，与二分实验 9「拆后仍黑」冲突）。
- 受影响模块：`AuthDecorBackground.vue`（登录 / 注册页装饰层）。

### 1.3 `frontend/public/fontawesome/` 无引用残留

- 核心症状：396 KB（6 文件）在 V3.6.36 回退 CDN 后零引用，但 `public/` 会被 Vite 原样拷进 `dist/`。
- 根本原因：回退时删除属破坏性操作被搁置，无后续批次跟进。

---

## 二、修改内容

### 2.1 ESLint 清零（30 → 0）

| 规则 | 数量 | 修法 |
|---|---|---|
| `no-useless-assignment` | 23 | 删除死初始化值（`let x = null/''/0/[]/{}` → `let x;`）。规则语义保证「初始赋值的值从未被后续读取」，删除行为等价。两个特殊形态：`useMarkdownRenderer.js` 323 行是「赋值后立即 `break`」型，直接删赋值行；`useSpatialAnalysis.js` 只删 `layerName` / `featuresA`，`featuresB = []` 初始值被某路径真实读取，保留 |
| `preserve-caught-error` | 4 | 错误链补 `cause`：`firstPersonFlyController` 导入失败 `IMPORT_FAILED` ← 原始 e；`wmsService` 三处 ← `directError` / `proxyError`（其中 282 行在 `.catch()` 回调**之后**、仍处于外层 `catch (directError)` 作用域，规则的覆盖范围按「catch 作用域内所有新抛 Error」计） |
| `@typescript-eslint/no-unused-vars` | 1 | `useCesiumLayers` 解构参数改 `backendBaseUrl: _backendBaseUrl`——保留对外键名（调用方继续传 `backendBaseUrl`），`_` 前缀声明有意未用 |
| `no-extra-boolean-cast` | 1 | `useCesiumToolModules` 的 `if (Boolean(value))` → `if (value)`；下方 `atmosphere: Boolean(value)` 是归一化赋值，保留 |
| `vue/no-v-html`（warning） | 1 | `AdminControlPanel` 的 `highlightCell` 已先 `escapeHtmlText` 转义、再拼自产 `<mark>`，无外部 HTML 注入面——就地 `eslint-disable-next-line` 注释并写明理由 |

### 2.2 认证页 iPad 黑块修复（`AuthDecorBackground.vue`）

```css
@supports (-webkit-touch-callout: none) {
    .auth-decor__orbit--a .auth-decor__ring--outer::after,
    .auth-decor__orbit--b .auth-decor__ring--outer::after { display: none; }
}
```

- **判据依据（非臆造，已查证）**：caniuse / MDN——`-webkit-touch-callout` 仅 Safari on iOS（含 iPadOS）解析，桌面 Safari 3.1–26.6 与 Chrome / Edge / Firefox 全部 Not supported；iPadOS 上所有浏览器均为 WebKit，必然命中。
- **与既有决策的关系**：落地页 V3.6.40 用「宽度断点」是因为它是布局问题（卡片全屏）；认证页的问题是「iOS WebKit 合成缺陷」，按 dev-conventions「判据用触屏能力、不用宽度断点」的取向，能力判据更精确，且桌面 Safari（未观测到缺陷、无需隐藏）零影响。
- **真机二分实验 9 的结论被采纳**：拆兄弟节点无效，故不走结构性改造；`display: none` 后该层不参与渲染，合成缺陷无从触发。

### 2.3 记录矛盾订正

- `2026-11-02-ios-ring-black-fix.md` 遗留节：删除与实验 9 矛盾的「建议拆成兄弟节点」，改为指向实验结论与 V3.6.40 修复（该日志已在本次暂存中被改写，属同一版本发布前订正，非改写已发布历史）。
- `ios-safari-rendering-pitfalls.md` 仓库现状表：认证页条目「待处理」→「iPad 已隐藏（V3.6.40）」。

### 2.4 `frontend/public/fontawesome/` 删除

- `git rm -r`（6 文件：NOTICE.md、all.min.css、4 个 woff2），git 对象库完整保留，commit 前 `git restore --staged && git checkout --` 可恢复。
- `index.html` 的 Font Awesome 注释补记「该目录已于 V3.6.40 删除」，防后续会话按旧注释找目录。
- 结构树无需同步（`public/` 资源不在 `frontend-structure.md` 逐文件登记范围，门禁复验见 §七）。

---

## 三、修改原因

1. `eslint src` 清零后才能作为 CI 棘轮基线——不清零，「不再新增告警」无从度量。
2. 认证页 iPad 风险是 V3.6.40 已知缺陷的最后一个未收口面，且记录矛盾会误导后续会话。
3. 396 KB 无效产物拖累每次构建产物体积，且干扰「public 下都是有效资源」的直觉。

---

## 四、影响范围

| 模块 | 影响 |
|---|---|
| 19 个 JS/TS/Vue 文件 | 变量声明形态与错误链 cause 变化，**运行时行为等价**（规则保证 + tsc/build 兜底） |
| 登录 / 注册页（iPad） | 两公转点隐藏；桌面、手机视觉完全不变 |
| 构建产物 | `dist/` 减小约 396 KB（fontawesome 不再拷入） |
| 文档 | 11-02 日志遗留节、ios-safari 架构文档现状表 |

**不受影响**：BootCDN 图标加载路径（删的是本地副本，CDN `<link>` 未动）；后端；配置 key。

---

## 五、解决方案

| 备选 | 结论 |
|---|---|
| 认证页：结构性改造（SVG dashoffset / canvas） | 规约推荐的长期方案，但改动大且本轮无法真机验证；`display: none` 是零风险的过渡修复。**本轮取隐藏，SVG 方案留档为升级路径** |
| 认证页：维持现状 | iPad 是真实触控主力设备，风险面不该留给「等有人报 bug」 |
| fontawesome：留给用户手删 | 用户本轮指令已覆盖清单内事项；git rm 可逆，无需再等 |
| ESLint：批量 `--fix` 或写脚本 | 拒绝。逐处确认上下文后手工修改，30 处每处均可审查 |

---

## 六、性能指标

未实测（无运行时性能变化）。构建产物体积：fontawesome 6 文件共 396 KB 不再进入 `dist/`（目录级估算，非产物 diff 实测）。

---

## 七、测试方案

### Agent 已执行

| 检查 | 结果 |
|---|---|
| `node node_modules/eslint/bin/eslint.js src` | **0 problems**（此前 30 条 / 23 文件） |
| `npx tsc --noEmit` | 0 错误 |
| `python Scripts/CheckStructureTree.py` | 525 : 525，漏登记 0 / 幽灵 0（fontawesome 不在登记范围，删除后门禁无漂移） |
| `python Scripts/CheckConfigRegistry.py` | 7 项全通过 |
| `npm run build` | **成功**（19.89 s）；产物核对：`dist/fontawesome/` 不存在，`webkit-touch-callout` 隐藏规则进入 RegisterView / HomeView / CesiumContainer 的 CSS，`cause` 错误链进入产物 |

### 待用户实机验证

1. **iPad Safari/Chrome**：登录页与注册页——三环与虚线正常、**环上无金点**、页面无黑块。
2. **桌面（Chrome/Safari/Firefox）**：登录页装饰与此前完全一致（两公转点保留、动画不变）。
3. **手机（≤768px）**：登录/注册页整层装饰仍关闭，无回归。
4. `npm run build` 后核对 `dist/fontawesome/` 不存在。

---

## 八、变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/api/ipLocation.js` | 删死初始化 `errorMessage` |
| `frontend/src/domains/cesium/components/CesiumDrawMeasurePanel.vue` | 删死初始化 `geometry` |
| `frontend/src/domains/cesium/modules/cloud/lib/CloudShadowPass.js` | 删死初始化 `toSunSource` |
| `frontend/src/domains/cesium/modules/planar-route/utils/planarLine.ts` | 删死初始化 `height` |
| `frontend/src/domains/cesium/modules/route-fly/firstPersonFlyController.js` | 删死初始化 `text`；`IMPORT_FAILED` 补 `cause: e` |
| `frontend/src/domains/common/basemap/arcgisAttributeQuery.js` | 删死初始化 `coordinates` |
| `frontend/src/domains/common/basemap/wmsService.js` | 三处新抛 Error 补 `cause` |
| `frontend/src/domains/common/basemap/xyzWmtsCapabilities.js` | `HTTP ${status}` 补 `cause: directError` |
| `frontend/src/domains/common/chat/composables/useAgentConfig.js` | 删死初始化 `extraBodyParsed` |
| `frontend/src/domains/common/chat/composables/useChatAgentConfig.js` | 删死初始化 `reply` / `usedModel` / `rawData` |
| `frontend/src/domains/common/data-import/parsers/dbfParser.ts` | 删死初始化 `value` |
| `frontend/src/domains/common/data-import/parsers/tdtVectorFetcher.js` | 删两处死初始化 `st` |
| `frontend/src/domains/common/data-import/parsers/tdtVectorTopology.js` | 删死初始化 `result` |
| `frontend/src/domains/common/data-import/useKmzLoader.js` | 删死初始化 `kmlString` |
| `frontend/src/domains/common/layer-tree/actions/exportService.js` | 删死初始化 `sizeBytes` |
| `frontend/src/domains/common/user/composables/useRealtimeStats.js` | 删死初始化 `url` |
| `frontend/src/domains/common/utils/useMarkdownRenderer.js` | 删「赋值后立即 break」的死赋值行；删死初始化 `html` |
| `frontend/src/domains/ol/layer/composables/useLayerMetadataNormalization.js` | 删死初始化 `persisted` |
| `frontend/src/domains/ol/spatial-analysis/composables/useSpatialAnalysis.js` | 删死初始化 `layerName` / `featuresA`（`featuresB` 保留） |
| `frontend/src/domains/ol/utils/usePositionCodeTool.js` | 删死初始化 `reverseResult` |
| `frontend/src/domains/cesium/composables/layers/useCesiumLayers.js` | 解构参数 `backendBaseUrl: _backendBaseUrl` |
| `frontend/src/domains/cesium/composables/toolModules/useCesiumToolModules.js` | `if (Boolean(value))` → `if (value)` |
| `frontend/src/domains/common/user/components/AdminControlPanel.vue` | v-html 就地 disable 注释（内容已转义） |
| `frontend/src/app/components/AuthDecorBackground.vue` | 新增 `@supports (-webkit-touch-callout: none)` 隐藏 iPad 两公转点 |
| `frontend/index.html` | Font Awesome 注释补记目录已删除 |
| `frontend/public/fontawesome/`（6 文件） | **删除**（git rm，零引用，-396 KB） |
| `Docs/LLM_record/26-11/2026-11-02/2026-11-02-ios-ring-black-fix.md` | 遗留节矛盾订正（拆兄弟节点 → 以实验 9 为准 + V3.6.40 已修） |
| `Docs/Architecture/ios-safari-rendering-pitfalls.md` | 现状表认证页条目更新 |
| `Docs/TODO/bugfix-optimization-plan.md` | 三项销项（认证页 / fontawesome / ESLint 30 条） |
| `README.md` / `Docs/Guide/CHANGELOG.md` / 本日志 | 版本号与记录 |

---

## 九、遗留与风险

1. **iPad 真机未复验**：`display: none` 的层不参与渲染，理论上不可能触发合成缺陷，但按 dev-conventions 第 16 条仍需 iPad 真机确认。
2. **1 处 `eslint-disable` 是新增的显式债**：`vue/no-v-html` 有就地理由（内容已转义）；若将来 `highlightCell` 引入外部 HTML 来源，必须先加固再移除注释。
3. **`preserve-caught-error` 的 cause 是字符串新 Error 的附加字段**：axios / 浏览器 console 展示 cause 的方式不一，但 `error.cause` 可编程读取，错误链信息不再丢失。
4. **ESLint CI 棘轮仍未接入**：清零只是基线，`eslint src` 进 CI 属门禁面改动（涉及 workflow），需单独批准。
5. `ol` 桶导入 6 处、裸 `defineAsyncComponent` 约 12 处、`INEFFECTIVE_DYNAMIC_IMPORT` 构建告警、后端 P1 安全四项：维持待办，不属本轮「已确认可修」范围。
