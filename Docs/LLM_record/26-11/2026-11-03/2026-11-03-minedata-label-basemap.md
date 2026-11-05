# 新增底图标注源：MineMap 注记（GCJ-02 纠偏接入）

## 基本信息

| 项 | 内容 |
|---|---|
| 日期与时间 | 2026-11-03 20:20 |
| 任务等级 | **L2**（新增底图源：2 文件改动 + 文档） |
| 版本 | **V3.6.41**（与「Landing→注册页过渡预取」同批提交，按用户「合并为版本 3.6.41」指令并入同一修订号） |
| 触发方式 | 用户提供 MineMap 标注瓦片 URL，要求「放到合适的位置，添加到底图」 |

---

## 一、问题分析

### 1.1 需求

将 `https://map-api.minedata.cn/service/data/raster-label?style=standard&z={z}&x={x}&y={y}&key=…` 接入底图体系，作为可选标注图层。

### 1.2 三个必须先确认的事实（全部实测，非推断）

| 待确认 | 结论 | 依据 |
|---|---|---|
| 瓦片是否可用 | **可用** | `curl` 取 z=5/13/18 均 200 + `image/png`（z13 约 15–25 KB） |
| 最大缩放级别 | **z=18** | z=18 → 200；z=19 / z=20 → 404（`application/xml` 错误体） |
| 坐标基准 | **GCJ-02 加偏** | 同一瓦片网格（z=13/x=6830/y=3373）分别取本服务与「经 `gcj2wgs` 重采样到 WGS84 的高德注记」，两图共同地标「杭州站」横向相差约 25 px；z13 分辨率约 19.1 m/px，25 px ≈ 480 m，与杭州一带 GCJ 偏移量级（lon +0.005° ≈ 530 m）及方向一致 |

> 项目内「图新注记」实际指向 GeovisEarth（`tiles.geovisearth.com`，WGS84 无偏），与 MineMap（四维图新 `minedata.cn`）不是同一服务商，不能照抄其直连写法。

### 1.3 接入点判定

| 候选 | 结论 |
|---|---|
| 只加 `LAYER_SOURCE_DEFINITIONS` | **不够**：该数组只喂 `createLayerConfigs`（建层）与 `MapDownloader`，底图下拉由 `BASEMAP_PRESETS` 驱动，用户在选择器里看不到 |
| 加图层定义 + 追加 preset | **采用**：与既有的「Stamen 线划 / Stamen 注记」纯注记 preset 同形态 |
| 与天地图影像捆成组合 preset | 否：会造成「叫 MineMap注记、实际含天地图影像」的语义混乱 |

**关键约束**：`URL_LAYER_OPTIONS` 与 `ALL_BASEMAP_PRESETS` 同序，`?l=N` 是 **1-based 索引契约**。新 preset 必须**追加在列表末尾**，否则会改变既有预设编号、破坏已分享链接（末尾编号由最大变为 +1，旧编号全部不变）。

---

## 二、修改内容

### 2.1 `frontend/src/domains/ol/basemap/constants/basemapConfig.ts`

在「图新注记」之后、「高德注记无偏」之前新增 `label_minedata`：

| 字段 | 值 / 说明 |
|---|---|
| `id` / `name` | `label_minedata` / `MineMap注记` |
| `category` / `group` | `label` / `注记` —— 走 `Z_BAND.LABEL` 分带（`useBasemapLayerBootstrap`），`MapDownloader` 自动排除 label |
| `url` + `createSource` | 均包 `gcj2wgsProxyUrl(...)`（两处同改，注释已写明「若确认无偏则去掉包裹」） |
| `maxZoom` | `18`（服务上限实测） |
| key | 硬编码于 URL：按 `dev-conventions`「底图源 URL 例外」——key 与 URL 耦合、前端请求必然可见，非 L3 绝密 |

### 2.2 `frontend/src/domains/common/basemap/basemapPresets.ts`

列表末尾追加：

```ts
{ id: 'label_minedata_preset', label: 'MineMap注记', stack: ['label_minedata'] }
```

注释写明「纯注记 preset、选中后需再叠影像」与「追加末尾保 URL 编号契约」。

---

## 三、影响范围

| 面 | 影响 |
|---|---|
| 底图下拉 | 末尾新增第 N 项「N MineMap注记」；既有编号全部不变 |
| 底图图层体系 | 注记分组多一层，z 分带为 LABEL（压在影像之上） |
| 瓦片链路 | 所有请求经 `vpn.negiao.cn/proxy/gcj2wgs/` 逐瓦片纠偏（与高德/腾讯/谷歌中国同路径），不自建缓存 |
| 下载面板 | `MapDownloader` 按 `category === 'label'` 跳过，不进入下载候选 |
| Cesium | 由 `LAYER_SOURCE_DEFINITIONS` 自动派生描述符，无需另改 |

---

## 四、测试方案

### Agent 已执行

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 错误 |
| 改动两文件 ESLint | 0 problems |
| `npm run build` | 成功，产物含 `minedata.cn/service/data/raster-label` |
| 瓦片实测 | z=5 / z=13 / z=18 均 200 `image/png`；z=19/20 为 404（故 `maxZoom: 18`） |
| 坐标系比对 | 同网格 z13 瓦片与 WGS84 对齐的高德纠偏图对照，「杭州站」横向差 ~25 px ≈ 480 m |

### 待用户实机验证

1. 底图下拉选「MineMap注记」→ 应只剩标注（无底图），再叠加任一影像预设。
2. **对齐确认（关键）**：叠加「天地图影像」（WGS84 无偏）后，看标注是否落在地物上（如「杭州站」应压在城站火车站）。若整体**偏东约 500 m** → 说明源其实无偏，把 `basemapConfig.ts` 中两处 `gcj2wgsProxyUrl(...)` 去掉包裹即可；若基本对齐 → 本次判定正确。
3. 放大到 z≥18 应停止请求新瓦片（不出现 404 红叉）。

---

## 五、遗留与风险

1. **坐标系判定基于像素级实测，尚未在应用中叠加验证**——这是本任务唯一的实质风险，回退路径已写在代码注释与上文（去掉 `gcj2wgsProxyUrl` 包裹）。若用户手上有 MineMap 官方文档的坐标声明，可据此直接定论。
2. **`key` 硬编码进仓库**：属公开瓦片 key（前端请求必然可见），符合底图 URL 例外；若该 key 属账号配额敏感资源，后续应迁入 L2 运行时 token 池（需新增 catalog key + admin 入口，本次不做）。
3. 服务上限 z=18，超出后 OL 会按 `maxZoom` 停止请求；若未来服务扩到 z=19+，改 `maxZoom` 即可。
4. 该图层无 `defaultVisible`：默认不显示，需用户主动选择/勾选。
