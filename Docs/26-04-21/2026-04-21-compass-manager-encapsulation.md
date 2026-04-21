# 2026-04-21 罗盘地理实体化与管理器封装

## 日期和时间
2026-04-21 23:10

## 修改内容
1. 新增 `CompassManager`（TypeScript）并将罗盘核心逻辑从 `MapContainer.vue` 抽离：
   - 统一管理 Overlay 挂载/卸载。
   - 统一管理地图事件监听（`singleclick` 放置、`moveend`、`change:resolution`、`resize`）。
   - 统一管理设备方向传感器监听（`deviceorientation`）。
   - 统一管理 URL 状态回写与恢复。
2. 新增 `compassUrlState.ts`：
   - 支持罗盘状态紧凑编码写入 `p` 参数扩展段。
   - 保持与既有位置短码 `p` 兼容（结构：`<positionCode>~c:<compassToken>`）。
   - 兼容旧字段 `clng/clat/crot/cscale/cshow` 的读取与回写。
3. `useMapState.js` 兼容增强：
   - `p` 参数解析增加扩展 token 拆分，避免与位置短码冲突。
   - URL 构建时保留既有罗盘 token，不覆盖位置短码逻辑。
4. `useCompassStore.ts` 升级为地理实体状态中心：
   - 新增地理直径参数（米）与像素渲染直径。
   - 新增层级样式控制能力（可见性、文字透明度、层边框色、线宽、宫格填充色、文字色）。
   - 新增 `renderConfig` 输出，直接供 SVG 组件渲染。
   - 新增 URL 样式状态导出与恢复函数。
5. `CompassControlPanel.vue` 扩展为高级属性控制台：
   - 新增地理直径控制（米）、全局边框与刻度色、十字线长度比例、刻度线参数。
   - 新增逐层样式控制与完整 JSON 配置入口（覆盖全部 props 场景）。
6. `feng-shui-compass-svg.vue` 渲染增强：
   - 天心十字长度改为受比例约束（默认 1/3 半径）。
   - 增加逐层可见性与样式渲染（层边框色、线宽、文字透明度、层默认宫格填充）。
7. `MapContainer.vue` 罗盘职责瘦身：
   - 仅保留 `CompassManager` 实例化与销毁。
   - 移除组件内罗盘 URL/监听/缩放/放置/传感器等具体实现逻辑。

## 修改原因
1. 罗盘此前表现为 UI 覆盖层，缺少地理实体语义，缩放不随地面比例变化。
2. 地图容器内聚合了过多罗盘逻辑，不满足单一职责与可维护性要求。
3. 需要在不破坏现有 `p` 参数短码机制的前提下，扩展罗盘完整样式状态分享能力。

## 地理实体缩放公式（核心）
- 目标：将罗盘视为“固定真实尺寸”的地理实体。
- 设：
  - $D_m$ 为真实世界直径（米）
  - $R$ 为地图分辨率（地图单位/像素）
  - $M_u$ 为投影单位到米的换算系数（`projection.getMetersPerUnit()`）
- 则显示像素直径：

$$
D_{px} = \frac{D_m}{R \times M_u}
$$

- 用户缩放系数 `scale` 叠加后：

$$
D_{px}^{final} = D_{px} \times scale
$$

- 采用 `requestAnimationFrame` 合并分辨率变化更新，降低平滑缩放时抖动。

## CompassManager API 摘要
1. `new CompassManager({ map, store, overlayElement, mapContainerElement })`
2. `init()`：恢复 URL 状态、挂载 Overlay、绑定地图与传感器监听、启动响应式同步。
3. `dispose()`：解绑全部监听、停止传感器、取消 RAF/Timer、卸载 Overlay。

## 影响范围
1. 前端地图核心组件：`MapContainer.vue`（职责边界变化）。
2. 前端状态层：`useCompassStore.ts`（新增地理实体与样式状态能力）。
3. 前端服务层：新增 `services/compass`。
4. URL 共享链路：`useMapState.js` + `compassUrlState.ts`。
5. 罗盘渲染组件与控制面板：`feng-shui-compass-svg.vue`、`CompassControlPanel.vue`。

## 修改的文件路径（绝对路径）
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\services\compass\CompassManager.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\services\compass\compassUrlState.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\stores\useCompassStore.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\useMapState.js
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\MapContainer.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\CompassControlPanel.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\feng-shui-compass-svg\feng-shui-compass-svg.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\feng-shui-compass-svg\types\compass.ts
- d:\Dev\GitHub\WebGIS_Dev\README.md
- d:\Dev\GitHub\WebGIS_Dev\frontend\README.md
- d:\Dev\GitHub\WebGIS_Dev\backend\README.md
- d:\Dev\GitHub\WebGIS_Dev\Docs\26-04-21\2026-04-21-compass-manager-encapsulation.md

## 验证情况
1. 关键改造文件静态错误检查通过。
2. 兼容性策略：`p` 参数位置短码保留，罗盘状态作为扩展 token 合并。
3. 下一步建议：进行移动端真机方向传感器联调与平滑缩放体感验证。
