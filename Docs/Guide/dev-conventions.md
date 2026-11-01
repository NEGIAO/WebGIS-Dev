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

