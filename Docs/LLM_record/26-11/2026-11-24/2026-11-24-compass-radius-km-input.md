# 2026-11-24 V3.7.15 罗盘面板地理半径支持手动输入（km）

- **日期与时间**：2026-11-24 10:45
- **任务等级**：L2（功能开发，3 文件）
- **流程说明**：本任务与「罗盘 cs 参数残留」修复（V3.7.14）为同一会话连续交付。分析已完成于实施前（见下），受会话连续性影响日志为事后落盘，实施内容与结论一致。

---

## 一、问题分析

### 1.1 需求

罗盘面板「Mode 1: 地理实体（Vector）」下，地理半径目前**只能通过滑杆调节**（`min=100` 米、`max=20000000` 米、`step=0.5` 米），无法直接填入目标数值。跨数量级调整（如从 500 米跳到 300 公里）需长距离拖动，精度差、效率低。需增加手动输入能力，**单位 km**。

### 1.2 现状代码

| 位置 | 现状 |
|---|---|
| `CompassControlPanel.vue` L114-131 | `slider-head` 右侧为只读 pill，值来自 `formatMeters(compassStore.physicalRadiusMeters)` |
| `CompassControlPanel.ts` L88-101 | `formatMeters` 仅做显示格式化；`handleRadiusInput` 直接写 store（米） |
| `useCompassStore.ts` L371-375 | `setPhysicalRadiusMeters` 只做 `Math.abs`，无上下限 |
| `locales/*/misc.ts` | `compass.radius` = `地理半径 (米)` / `Geographic radius (m)` |

### 1.3 关键约束（实施前核实）

- 滑杆物理区间 100 m ~ 20,000 km，UI 与 store 之间以**米**为单位，仅展示层可切换为 km。
- `physicalRadiusMeters` 是全链路单一来源：滑杆、URL 恢复（`restoreFromUrlState`）、Cesium 贴地罗盘均读它。因此输入框必须回写**米**，不能在 store 里改单位。
- 输入过程中不能直接双向绑定格式化文本：`type=number` 输入 `1.` 时 `Number('1.')` 合法但回写会吞掉小数点与光标位置，导致无法输入小数。

### 1.4 发现的既有矛盾（本次未改，已记 TODO）

`encodeCompassState`（`codec/positions.ts`）的半径上限为 `RADIUS_MAX_SCALED / RADIUS_SCALE = 500,000 米 = 500 km`，而面板滑杆上限是 **20,000 km**（40 倍差距）。半径 > 500 km 时 URL 无法编码，`writeCompassUrlState` 会退化为删除 `cs` —— 刷新后罗盘状态不保留。

该矛盾**先于本次需求存在**（滑杆早已能拖到 20,000 km），但手动输入会让大半径更易被使用。提高上限需扩 `RADIUS_BITS`（当前 23 位，容量 8,388,607，20,000 km 需 ≥28 位），会破坏既有 `cs` 短码兼容性，属 L3 级决策，故本次不改，记录待用户裁决。

---

## 二、候选方案对比

| 方案 | 做法 | 评价 |
|---|---|---|
| A | 输入框直接 `v-model` 到 store 的米值 | 单位不符（用户要 km），且输入中途会被格式化打断 |
| B | 输入框独立本地 state + `@change` 提交 | 交互安全，但拖动滑杆时输入框需额外同步 | 
| C | 独立本地 state + `@input` 实时写 store + `@blur/@change` 钳制回写 | 兼顾实时性与输入安全 | **采用** |

**选定 C**：`@input` 时合法值立即写 store（滑杆与地图实时跟随），但不回写输入框文本；`@blur`/`@change`/`@keyup.enter` 时钳制到区间并回写规范化文本。

---

## 三、实施内容

1. **`CompassControlPanel.ts`**
   - 新增 `RADIUS_MIN_KM = 0.1` / `RADIUS_MAX_KM = 20000`（与滑杆区间对齐）并暴露为实例只读字段供模板绑定 `min`/`max`。
   - 新增 `radiusKmInput`（本地文本）与 `radiusEditing`（编辑态标志）。
   - 新增 `toRadiusKmText()`：米 → km，最多 3 位小数并去尾随零。
   - 新增 `handleRadiusKmFocus` / `handleRadiusKmInput` / `handleRadiusKmCommit`。
   - `init()` 增加 `physicalRadiusMeters → radiusKmInput` 单向 watch（编辑态跳过）。
2. **`CompassControlPanel.vue`**
   - 半径标签行右侧的只读 pill 替换为「`number` 输入框 + km 单位」，保留 `formatMeters` 结果作为 `title`（悬停查看精确米值）。
   - 新增 `.radius-input-group` / `.radius-number` / `.radius-unit` 样式，隐藏原生步进箭头。
   - 新增 `@media (pointer: coarse)` 一档：输入框 `min-height: 40px`、宽度与字号同步放大（合规 §3 移动端基线）。
3. **`locales/zh-CN|en-US/misc.ts`**
   - `compass.radius` 单位由「米 / m」改为「km」。

### 数据流

```mermaid
flowchart LR
    subgraph input["手动输入"]
        I1["number 输入框<br/>单位 km"] -->|@input 合法值| I2["setPhysicalRadiusMeters<br/>km × 1000"]
        I1 -->|@blur/change<br/>钳制 0.1~20000| I2
    end
    subgraph slider["滑杆"]
        S1["range 滑杆<br/>100~20,000,000 m"] --> I2
    end
    I2 --> ST["store.physicalRadiusMeters<br/>唯一真相源（米）"]
    ST -->|watch 单向<br/>编辑态跳过| I3["radiusKmInput 回显"]
    ST --> R["OL 罗盘渲染 / URL 编码"]
```

---

## 四、修改原因

滑杆适合连续微调，不适合跨数量级设定目标值（如「半径设为 300 km」需从 1 km 拖行全程）。地理罗盘的实际使用场景（风水堪舆的「百里/千里」范围）常以整数公里为目标，手动输入是更自然的入口。

---

## 五、影响范围

| 模块 | 影响 |
|---|---|
| 罗盘控制面板 | 半径控件由「只读值」升级为「可编辑值 + 滑杆」 |
| store | 无结构变化；`physicalRadiusMeters` 单位仍为米 |
| 滑杆 | 行为不变，拖动时输入框跟随回显 |
| URL 同步 | 无变化（仍读 store 米值，>500 km 的既有编码限制不变） |
| Cesium 贴地罗盘 | 无影响（读同一 store 字段） |
| i18n | `compass.radius` 标签单位变更，仅该 key 一处使用 |

---

## 六、测试方案

### Agent 已执行（实测结果）

| 检查 | 结果 |
|---|---|
| 前端类型检查 | `npx vue-tsc --noEmit` → `EXIT=0`，无输出 ✅ |
| 结构树门禁 | 见交接块（无新增前端文件，仅改既有 4 文件） |
| 配置登记门禁 | 无新增配置 key，预期全绿 |
| 逻辑自检 | `toRadiusKmText`：1000 m → `1`、12500 m → `12.5`、500 m → `0.5`、0/负值 → 空串；`handleRadiusKmCommit` 钳制区间 `[0.1, 20000]` km |

> ⚠️ **浏览器实测未完成**：chrome-devtools 的 Chrome 实例被其他进程占用（profile 锁定），无法接管页面点击验证。以上为类型检查与逻辑自检结果，交互表现请以下方实机步骤为最终判据。

### 待用户实机验证

1. 开启罗盘 → 面板「地理半径 (km)」右侧出现输入框，初值与滑杆位置一致
   - **预期**：如默认 1 km，输入框显示 `1`
2. 输入 `300` 后回车 → 滑杆跳至约 1.5% 位置，地图罗盘覆盖范围显著扩大
   - **预期**：实时生效，无需失焦
3. 拖动滑杆到中途 → 输入框数值同步变化
   - **预期**：跟随更新（如 `12480`）
4. 输入 `0`、`-5`、`abc` → 失焦
   - **预期**：回退为当前有效值，不产生 NaN 或 0 半径
5. 输入 `0.05` → 失焦
   - **预期**：钳制为 `0.1`（100 米，与滑杆下限一致）
6. 输入 `99999` → 失焦
   - **预期**：钳制为 `20000`
7. 输入小数 `12.5` → 回车
   - **预期**：保留 `12.5`，不被格式化成 `13` 或 `12.500`
8. 移动端/触屏设备打开面板
   - **预期**：输入框高度 ≥40px，可正常点按与输入

---

## 七、变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/compass/components/CompassControlPanel.ts` | 新增 km 输入状态、格式化与三个事件处理器；`init()` 增加半径单向同步 |
| `frontend/src/domains/common/compass/components/CompassControlPanel.vue` | 半径行替换为输入框 + km 单位；新增样式与触屏档 |
| `frontend/src/locales/zh-CN/misc.ts` | `compass.radius` → `地理半径 (km)` |
| `frontend/src/locales/en-US/misc.ts` | `compass.radius` → `Geographic radius (km)` |

---

## 八、遗留与风险

1. **500 km URL 编码上限 vs 20,000 km UI 上限**（既有矛盾，见 §1.4）：输入 >500 km 的半径时，罗盘本地正常渲染，但 `cs` 无法写入 URL，刷新后状态丢失。需用户裁决是否扩位宽（L3）或收窄 UI 上限至 500 km。
2. `setPhysicalRadiusMeters` 仍未做上下限钳制（仅 `Math.abs`）。本次钳制落在面板层，其他写入路径（URL 恢复已自校验 `> 0`）不受影响；建议后续在 store 层统一钳制。
3. 面板整体尚无 `@media (pointer: coarse)` 适配（本次仅为新增输入框补齐），其余控件仍为桌面尺寸。
