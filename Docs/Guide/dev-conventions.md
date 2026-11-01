# 开发约定

> 📌 本文件由根 [README](../../README.md) 的「开发约定」章节拆分而来。返回 [README 首页](../../README.md)。

---

### 强制规范（摘要）

> ⚠️ **行为与流程的权威版本见 [`Docs/Force_command.md`](../Force_command.md)**（任务分级、硬边界、SOP、DoD、会话交接块）。
> **技术约定的权威版本是本文件**（分层边界、场景数据契约、移动端基线）。`Force_command.md` §3 只保留行为级要求并链接至此，**不再复制细节** —— 这是 V3.6.37 起的分工，用于消除两处维护同一规则导致的漂移。
> 摘要条目变动必须与正文同步。

1. **先定级再动手**：L0 咨询（只读）/ L1 微改（≤20 行单文件）/ L2 常规（默认，全流程）/ L3 架构级（**须先批准方案再施工**）
2. **先写文档，再实施代码改动** —— 分析结论（症状 → 根因 → 影响模块 → 方案选型）先落文档
3. **每次 L2/L3 任务必须创建日志**到 `Docs/LLM_record/YY-MM/YYYY-MM-DD/YYYY-MM-DD-topic.md`（唯一合法路径形式，历史旧写法不迁移）
4. **文档单一事实来源（原子化）**：版本历史统一在 [`CHANGELOG.md`](CHANGELOG.md)，架构索引统一在根 [README](../../README.md)；三个 README 不重复版本记录、架构表、目录树（仅放链接）。**目录树唯一权威**：[project-structure.md](project-structure.md)（根级 + Docs 树）、[frontend-structure.md](frontend-structure.md)（前端）、[backend-structure.md](backend-structure.md)（后端）——任何文件增删改必须同步更新对应 structure 文件
5. **版本号 = 每个 L2/L3 任务 +1 修订号**，同日不合并；根 README **三处**（项目简介行 / 版本表首行 / 页脚）必须同步，格式恒为 `V{主}.{次}.{修订}`
6. **不执行任何 Git 写操作**（`commit` / `push` / `stash` / `reset` / 切分支）—— 版本控制决策权归用户
7. **不在 `/Docs` 外新建说明类文档**；不改 `.env` / `.env.local` / `.github/workflows/` 等密钥与部署面（只提建议）
8. **不臆造、不谎报**：API 签名 / 字段 / 配置 key / 路径必须读代码确认，未确认标 `⚠️ 未验证`；未实机运行不得写"已测试通过"
9. **新功能必须封装**为独立 `.ts` 文件（**新建逻辑代码默认 TypeScript**，仅受运行环境限制、无法模块化的纯脚本/构建钩子可用 `.js`；既有 `.js` 不强制改写），组件内不堆叠业务逻辑（`MapContainer.vue` 等巨型文件只出不进）
10. **新增代码必须有注释**（功能 / 参数 / 返回 / 核心逻辑）
11. **新增配置 key 顺序恒为**：登记 `deploy/.env.example` + `backend/config/catalog.py` → 再写读取代码 → 跑门禁
12. **数据源注册前置**：任何场景数据加载必须入 TOC/数据源店（Cesium：`loadedDataSources` + `type` 契约；OL：layer-tree），并实现显隐/透明度/定位/移除等 adapter 能力；远程 URL 模型须存 `sourceUrl`。**契约细则见本文「场景数据与移动端契约」**
13. **移动端基线**：viewport 常带 `shrink-to-fit=no, viewport-fit=cover`；全局禁 iOS 自动调字与横向溢出；触屏目标按 `pointer: coarse` 给 ≥40px（新增 icon 同步跟进）；F12 拉窄≠真机，必须真机或设备模式复验。**细则见本文「场景数据与移动端契约」**
14. **线上机器人 PR 只读优先**：Dependabot 依赖 PR 的查看与判定随时可做（`gh pr list` / `pr view` / `pr checks` / `pr diff`）；**合并须逐次显式授权**（用户说出「合并 #n」），且仅在「检查全绿 + diff 仅锁文件 + 版本跨越已判定 + 不触部署面」时才可提议；`pr merge --auto` / `--admin` / `pr checkout` / `pr review` / `pr close` 一律禁止；合并本身**不升版本、不写独立日志**。详见 Force_command §12
15. **视觉层次（去「AI 生成感」）**：卡片 / 面板 / 弹层 / 按钮默认**去描边**，层次由「分层投影 + 明度差 + 留白」建立，不由常驻 `1px` 描边建立；确需硬边界时用**环状阴影** `0 0 0 1px` 而非 `border`；**表单控件与语义态（focus / error / selected / disabled）的描边属可用性提示，例外保留**；投影只走既有令牌，禁新增第四套；`transition` 禁 `all`。**细则见本文「视觉层次规范」**

### 分层边界

| 层 | 职责 | 禁止 |
|----|------|------|
| `components/` | UI 渲染 + 事件 | 业务逻辑 |
| `composables/` | 编排流程 + 地图动作 | 直接操作 store state |
| `stores/` | 状态维护 + 派生 | 依赖 OL / Cesium 类 |
| `utils/` | 纯函数 + 解析 | 副作用 |
| `services/` | 外部 SDK 集成 | UI 逻辑 |

### 坐标系统约定

本项目涉及国内地图服务（高德/天地图）与全球标准（OpenLayers/Cesium/Nominatim），遵循以下统一规则：

```
前端 UI/组件/Composable —— 始终使用 WGS-84
         ↓
  前端 API 包装层 (frontend/src/api/)
    ├─ geocoding.js              —— WGS-84 in, WGS-84 out（内部 wgs84ToGcj02 → AMap → gcj02ToWgs84）
    ├─ backend/location.js       —— WGS-84 in, WGS-84 out（同上）
    ├─ locationSearch.js         —— 高德 POI 搜索结果的 GCJ-02 坐标自动转 WGS-84
    └─ map.js / amapAoiParser / universalAmapParser —— AOI/详情 GCJ-02 自动转 WGS-84
         ↓
  后端代理 (external_proxy.py) —— 透传，不转换
         ↓
  后端服务端点 (location.py)    —— 调用高德前做 wgs2gcj 转换
         ↓
  高德 API                    —— 始终接收/返回 GCJ-02
```

**核心原则**：
1. 前端所有组件、Composable、Store 统一使用 **WGS-84**（OpenLayers `toLonLat`/`fromLonLat` 产出/消费的就是 WGS-84）
2. WGS-84 ↔ GCJ-02 转换仅发生在 **调用高德 API 的前一刻**（前端 API 包装层或后端服务端点），对上层代码完全透明
3. 天地图接受 WGS-84、Nominatim 使用 WGS-84，无需转换
4. 用户手动输入坐标时可通过 `crsType` 参数指定输入坐标系（wgs84/gcj02），系统自动转换后以 WGS-84 进入内部管线
5. 瓦片图层通过后端 `/proxy/gcj2wgs/` 纠偏代理将高德 GCJ-02 瓦片实时转为 WGS-84 瓦片

### 场景数据与移动端契约

> 本节是以下两类技术细节的**唯一权威**。`Force_command.md` §3 只保留行为级要求（「必须入 TOC」「必须写真机基线」）并链接至此。

#### 一、数据源注册（TOC / 统一图层管理）

任何「能把可交互对象加进三维/二维场景」的功能（远程服务、URL 模型、文件导入、模块工作集…），**必须先走数据源注册**，再谈业务交互。

**Cesium 标准契约**（权威实现：`stores/cesiumLayers.ts` + `composables/dataImport/`）：

1. 写入 `loadedDataSources` 记录：至少 `{ id, name, type, entity, ...业务字段 }`；远程 URL 模型另存 `sourceUrl`（**禁止只留 `blobUrl`**）。
2. `type` 必须落在 TOC 已知集合（`geojson|kml|kmz|czml|shp|tif|gltf|3dtiles|wayline|imagery…`）；新增类型须同步 `TYPE_LABELS` / `OPACITY_SUPPORTED_TYPES` / `cesiumLayerNodeBuilder` 动作位。
3. 场景操作经 adapter 闭环：**显隐 / 透明度 / flyTo / remove** 必须可用；`gltf` 另需 **reposition**（取 `sourceUrl || blobUrl`）；`3dtiles` 需 **setBaseHeight / setMaterialMode**。
4. 优先复用 `dataImport.load*` / `loadRemoteGlb` / `registerExternalDataSource`，**禁止在 layers / components 里手写第二套 id 与入列逻辑**。

**OL 侧**：对齐 `layer-tree` / layer store 注册，不得只加 map 却不进图层树。

**验收**：新增加载路径后，在 TOC 里对新条目**实测**上述能力；缺一项即视为未完成。

#### 二、移动端基线（F12 模拟 ≠ 真机，高频复发区）

1. `index.html` viewport 恒带 `shrink-to-fit=no, viewport-fit=cover` —— 禁 iOS 溢出整页缩小（**F12 不复现该行为**）。
2. 全局 `html { text-size-adjust: 100% }` + `html, body { overflow-x: clip }` —— 禁 iOS 自动调字与横向溢出链。
3. 新增 icon / 按钮默认给桌面尺寸，**必须同步写 `@media (pointer: coarse)` 一档**：可点击目标 ≥40px、图标 glyph 同步放大、悬停浮现元素在触屏隐藏或常显。**判据用触屏能力，不用宽度断点。**
4. 抽屉 / 面板类容器在移动端媒体查询内 `min-width` 必须清零（`min-width: 300px` 类基准值是窄屏溢出的典型元凶）。
5. 验证要求：触屏目标可用 F12 设备模式（选具体机型，`pointer: coarse` 生效）验证；**整页缩小类问题必须真机复验，F12 通过不算通过**。

### 视觉层次规范

> **触发场景**：新增或改造任何卡片、面板、弹层、按钮、列表项等**表面类 UI**。
> **核心原则**：层次由「**分层投影 + 明度差 + 留白**」建立，**不由常驻描边建立**。
> **参考实现**：[`app/LandingView.vue`](../../frontend/src/app/LandingView.vue) 的 `.feature-card`（去描边 + 双层投影的已落地样板）。

`白底 + 1px 灰边 + 统一圆角` 是 AI 批量生成界面最典型的三件套。单张看合理，同一屏 10 张以上同款卡叠加时会退化成一排贴纸——**这是“机器味”的首要来源，且与配色、字体无关，纯由层次手法决定。**

#### 一、卡片 / 面板 / 弹层：去描边，改双层投影

`border: 0`，投影分两层：第 1 层是 **1px 接触阴影**（静态几乎不可见，替代描边定边界），第 2 层是**大扩散负扩散**（只负责“浮起”，`hover` 才明显）。

```css
/* 卡片静态：边界靠接触层，浮起层几乎为零 */
box-shadow:
    0 1px 2px rgba(var(--shadow-rgb), 0.04),
    0 12px 28px -24px rgba(var(--shadow-rgb), 0.5);

/* hover：只加深，不改几何 */
box-shadow:
    0 1px 2px rgba(var(--shadow-rgb), 0.05),
    0 22px 40px -26px rgba(var(--shadow-rgb), 0.55);
```

**静态克制、状态才显影** —— 层次靠交互变化建立，不靠常驻描边。这样一屏多卡不会互相“贴纸化”。

#### 二、必须保留硬边界时：用环状阴影，不用 `border`

浮于地图影像、深色底、半透明背景之上的面板，边界不可省，但应写 `box-shadow: 0 0 0 1px rgba(...)` 而非 `border`。三个理由：

1. `box-sizing: border-box` 下 `border` 占布局宽度，改 `0` 会让内容区**变宽 2px**，密集网格里可见文字位移；环状阴影不参与布局。
2. 环状阴影**跟随 `border-radius`**，且可与投影层合并成一条 `box-shadow`，便于统一调节。
3. `hover` 时只改环的颜色，不触发几何重算。

#### 三、按钮：默认不用「白底 + 1px 灰边」

| 类型 | 常态 | hover |
|---|---|---|
| 主按钮 | 品牌实底 / 渐变 + 投影 | 抬升 1–2px + 投影加深 |
| 次按钮 | 浅色填充（`--bg-hover` 或品牌色 8% 透明） | 填充加深一档 |
| `ghost` 按钮 | 无底无边，仅文字色 | 出浅底，不出描边 |
| 需边界的按钮 | 环状阴影 `0 0 0 1px` | 环色加深 |

**「白底 + 1px 灰边」的中性描边按钮不得作为默认样式**——它既无品牌指向，也无层级信息，是模板化界面的标志性产物。

#### 四、例外：以下描边必须保留（不受本条约束）

1. **表单控件**：`input` / `select` / `textarea` / `checkbox` / `radio` —— 描边是**可交互性提示**，属可用性而非装饰。
2. **语义态**：`focus` / `error` / `selected` / `disabled` / 拖拽落点 —— 此时描边承载**状态**，不是层级。
3. **结构性线条**：表格单元格分隔线、时间轴轴线、分栏线。

**判断口径（一句话）**：这条线是在告诉用户「**这里能操作 / 这里是什么状态**」→ 保留；只是在说「**这是一张卡**」→ 去掉。

#### 五、投影令牌：复用三套，禁开第四套

现存三套阴影语汇，新增一律复用，**禁止硬编码 `rgba(0, 0, 0, ...)` 中性黑**：

| 令牌 | 位置 | 用途 |
|---|---|---|
| `--shadow-sm/md/lg` | `assets/theme.css` | 通用层级 |
| `--panel-shadow` | `assets/theme.css`（面板规范段） | 面板 / 弹层 |
| `--toc-shadow-sm/md/lg/dialog` | `assets/toc-theme.css` | 图层树 / 面板内卡片 |

令牌本身应升级为**带品牌冷调的双层形态**，并抽出 `--shadow-rgb` 随 `[data-theme]` 切换（绿主题 `20, 45, 25`、蓝主题 `12, 35, 64`）——**直接用绿色调阴影，切到蓝主题会“脏”。**

#### 六、`transition` 禁用 `all`

一律显式列出属性：`box-shadow` / `transform` / `background-color` / `color` / `border-color`。
`all` 会把 `width` / `height` 一并纳入过渡，触发不必要的重排，且是模板化代码的显著指纹。存量约 115 处 / 41 个文件，**随改动逐步收敛，不为收敛而单独重构**。

#### 七、实测取值基线（源自 V3.6.46 `LandingView.vue`）

下列数值是已验证的成品配方，新页面直接套用，**不要再自行调参**（`--shadow-rgb` 见第五条，绿主题 `20, 45, 25`）：

| 场合 | 静态 | `hover` |
|---|---|---|
| 功能卡（16px 圆角） | `0 1px 2px rgba(var(--shadow-rgb), .03), 0 12px 28px -24px rgba(var(--shadow-rgb), .5)` | `0 1px 2px …(.04), 0 22px 40px -26px …(.55)` + `translateY(-3px)` |
| 次级按钮（白面） | `0 1px 2px …(.05), 0 10px 22px -18px …(.55)` | `0 2px 4px …(.06), 0 18px 30px -20px …(.6)` |
| 图表容器 | `0 1px 2px …(.03), 0 16px 32px -26px …(.5)` | 同上加深一档 |
| 大面板（20px 圆角，全页唯一） | `0 1px 2px …(.03), 0 30px 60px -40px …(.5)` | — |
| 导航玻璃底（滚动后） | `0 10px 30px -22px rgba(var(--shadow-rgb), .45)` + `backdrop-filter: saturate(1.5) blur(14px)`，底 `rgba(252,253,252,.82)`，下沿 `rgba(var(--shadow-rgb), .07)` | — |

**底色档位**（替代「白底 + 灰边」）：

| 用途 | 常态 | `hover` |
|---|---|---|
| 弱信息徽标 / 幽灵控件底 | `rgba(var(--brand-primary-rgb), 0.055)` | `0.1` |
| 导航项 / 文字链 | 透明 | `rgba(var(--shadow-rgb), 0.045)` |
| 图标钮 | 透明 | `0.08`，`active` 为 `0.05` |

**圆角只允许两档**：幽灵 / 次级控件 `6px`，主按钮 `999px`；功能卡 `16px`、大面板 `20px` 属容器层级，不参与控件圆角混排。

#### 八、布局与渲染约束（非视觉偏好，属正确性）

1. **精确居中必须用 grid 三列**：`grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)`。**禁用两侧 `flex: 1` 平分** —— 两侧内容宽度不等时中列必然偏心（实测 1440 下右偏约 180px）。
   **隐藏中列时必须同步把三列模板改成两列**，否则 `.nav-actions` 会被自动排进第 2 列，右侧控件跑到正中。
2. **断点由内容实测宽度决定**：先量「左簇 + 中列 + 右簇」的实际像素和，再取断点（例：826px → 取 900px）。**不得按设备名（1024 / 768）拍脑袋**。改断点后必须复查中列居中、有无空档或重叠。
3. **`-webkit-mask` 图层永不参与 `transform`**：iOS Safari 会把被遮罩图层整块栅格化成**纯黑**。已两次踩坑——品牌徽牌 `rotate(-10deg) scale(1.1)`、首屏光晕 96s 自转（表现为黑圆盘）。交互反馈改用**背景色深浅**，完全不碰合成路径。同类结论见 `composables/useRingPatternStyle.ts`。
4. **去描边后必须复查对比度**：小于 14px 的文字禁用 `--text-muted`（`#999`，11px 下约 2.6:1，不达 WCAG AA）；用 `--text-secondary`（`#666`，约 5.7:1）。典型翻车：汉堡三线在去掉边框后仍用 `--text-secondary`，看起来像禁用态，须改用 `--text-primary`。
5. **无框控件靠内边距撑触达区**：删掉 `border` 后必须补 `padding`，否则可点击区域缩水；移动端仍需满足 `pointer: coarse` 下 ≥40px。

#### 九、实施顺序（先补令牌，再改表面）

**`--shadow-rgb` 目前尚未在 `theme.css` 中定义**。执行视觉改造前，必须先在 `:root` 与 `[data-theme="blue"]` 补上该变量，否则 `rgba(var(--shadow-rgb), …)` 整体解析失败，表现为**阴影全部消失**（比保留描边更糟）。顺序恒为：补令牌 → 改共享卡片（`.ui-card` / `.ui-panel`）→ 改页面级卡片 → 逐页收敛 `transition: all`。

### 提交前检查（门禁）

**两个门禁脚本为收尾必过项**（`LocalDev.bat` 启动时会自动跑一遍，改动收尾需手动复跑确认）：

```bash
python Scripts/CheckStructureTree.py     # 结构树漂移：磁盘文件 vs frontend-structure.md 双向 diff
python Scripts/CheckConfigRegistry.py    # 配置登记：禁裸读 env / key 必须登记 catalog + .env.example
```

脚本非零退出即视为未通过，**必须修到通过或明确说明原因**，禁止无视。完整 DoD 清单见 [`Force_command.md` 第 7 节](../Force_command.md)。

```bash
# 本地启动 —— Windows: 双击 LocalDev.bat
#   自动：生成 deploy/.env → 跑上述门禁 → docker compose -f deploy/docker-compose.yml up（api+web 双服务）

# 或手动启动
docker-compose up
```

---

## 相关文档

| 文档 | 内容 |
|---|---|
| [`Docs/Force_command.md`](../Force_command.md) | **Agent 强制执行规范**（权威版）：任务分级、硬边界、SOP、SSOT、DoD、交接块 |
| [`Docs/Example_prompt.md`](../Example_prompt.md) | 任务启动提示词模板（Bug / 功能 / 重构 / 审计四类） |
| [`handover.md`](handover.md) | 接手必读：文档地图、架构速览、代码坐标、坑清单 |
| [`dev-guide.md`](dev-guide.md) | 新增页面 / API 的标准流程与代码风格 |

