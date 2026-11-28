# 2026-11-28 修复 order 空洞与图新误纠偏

- **日期与时间**：2026-11-28 14:40
- **任务等级**：L3 数据修复（用户明确指令 + 询问确认，依 Force_command §0 优先级 1 视为批准）
- **本次版本**：V3.7.35（V3.7.33/34 已被并行会话占用，按 §5 顺延）

## 问题分析

**症状**（用户截图）：`[basemap-definitions] 图层定义校验失败：order 缺失: 175 / order 缺失: 184（应覆盖 1..184）`

用户删除了部分定义（认为「很多瓦片本身是 WGS 却被错误声明 GCJ，如图新、天地图」），但未重编号，留下 5 个 order 空洞（175/184/185/186/187），`validate.ts` 启动即抛错。

## 核实结论（关键）

对 36 条 `gcj2wgs` 按 URL 域名逐一核查：

| 域名 | 条数 | 源坐标系 | 纠偏判定 |
|---|---|---|---|
| `webrd01/webst01.is.autonavi.com` | 18 | GCJ-02（高德中国节点） | ✅ 正确 |
| `mt0/www.google.com` | 16 | GCJ-02（Google 中国节点） | ✅ 正确 |
| `rt0.map.gtimg.com` | 1 | GCJ-02（腾讯中国节点） | ✅ 正确 |
| `tiles.geovisearth.com` | 3 | **WGS84（图新原生）** | ❌ 错误 |

天地图各定义无 correction，正确。

**重要语义澄清**：`coord` = 纠偏后输出坐标系，`correction` = 引擎要做的变换。因此「name 含 (WGS) + coord=WGS84 + correction=gcj2wgs」本身是合法的「GCJ 源 → WGS 输出」定义，**不是 bug**；只有源真的已是 WGS（图新 geovisearth）时纠偏才错。用户判断准确，问题集中在图新 3 条 WGS 变体。

## 修改内容

1. 删除 `imagery_tuxin_wgs` 定义（与 `imagery_tuxin` 同 URL，重复且误纠偏）；其 preset `imagery_tuxin_wgs_preset` 的 stack 改指 `imagery_tuxin`（预设施加数量与编号不变）。
2. 移除 `label_tuxin_wgs` / `vector_tuxin_wgs` 的 `correction: 'gcj2wgs'`（保留定义与预设，避免编号漂移）；图新三条 WGS 变体现均为无偏 WGS。
3. 全部 206 条定义按文件字母序 + 文件内出现顺序重编号为连续 1..206（用户询问中确认「重编号 1..N」）。
4. `check-layer-definitions.mjs`：定义数量与 order 上界由硬编码 207 改为动态推导（实际定义数 N），杜绝每次增删底图都要改脚本；输出信息同步。

## 修改原因

用户删除定义后应用启动即抛校验错误；图新 WGS 源被误纠偏导致瓦片错位。修复使定义层恢复自洽，并纠正图新坐标处理。

## 影响范围

图层定义 order 全量重编号（不影响 URL `l` 参数——`l` 由 `basemapPresets.ts` 的预设顺序决定，与图层 order 无关）；图新三条 WGS 变体不再走 VPS 纠偏代理，直接加载原始 WGS 瓦片。

## 验证

### Agent 已执行

- `vue-tsc --noEmit`：0 错误。
- `check:layer-definitions`：OK（206 definitions, orders 1..206, stacks resolve）。
- `check:basemap-catalog`：OK（181 presets, 20 recommended）——预设数 181 由并行会话 V3.7.34 改动所致。
- `npm run build`：通过。
- 结构树 769/769、配置门禁全绿。
- 图新 geovisearth 定义中 `correction` 零命中；`imagery_tuxin_wgs` 定义零命中（仅 preset id 保留，stack 已改指无偏定义）。
- 脚本内「派生版必须有原始版 / GCJ 原始版必须有 WGS 派生版」成对断言通过。

### 待用户实机验证

1. 应用启动不再报 `[basemap-definitions]` 校验失败。
2. 图新注记/矢量/影像 WGS 变体定位正确（不再整城偏移）。
3. 高德/Google/腾讯 WGS 派生版仍正常（其源确为 GCJ，纠偏保留）。

## 变更文件清单

- `frontend/src/domains/common/basemap/definitions/category-imagery.ts`（删 imagery_tuxin_wgs + 重编号）
- `frontend/src/domains/common/basemap/definitions/category-electronic.ts`（去两条 correction + 重编号）
- `frontend/src/domains/common/basemap/definitions/category-{historical,service,terrain,vector}.ts`（仅重编号）
- `frontend/src/domains/common/basemap/basemapPresets.ts`（1 条 stack 改指）
- `frontend/scripts/check-layer-definitions.mjs`（数量动态化）
- `Docs/TODO/archive/2026-11-28-tile-order-and-tuxin-correction-fix.md`、`Docs/TODO/README.md`
- `README.md`、`Docs/Guide/CHANGELOG.md`、本日志

## 遗留与风险

- 本次与并行会话（V3.7.34 新增 19 条公共底图）存在文件交叠：重编号基于最终的 206 条状态，已覆盖其新增定义；若并行会话再次增删定义，order 需重排或补洞。
- 高德/Google/腾讯的 35 条纠偏保留——若后续实测发现某条源已改为 WGS 直出，需单独核实调整（不能批量按「(WGS)」后缀判断）。
