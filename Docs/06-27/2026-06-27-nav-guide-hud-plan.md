# 漫游导航指引功能 — 实施计划

## 背景

人物漫游模式下，设置目标地点后，利用 Cesium 原生 Selection Indicator 聚焦目标实体，同时在屏幕顶部显示方向 HUD（方位箭头 + 距离 + 目标名），引导玩家走向目标。

**目标来源**（三种方式）：
1. **搜索选点** — 搜索地名，结果自动成为导航目标
2. **地图点选** — 点击「设置导航目标」后，点击 Cesium 地图任意位置
3. **数据要素** — 点击已导入的 GeoJSON/KML 等数据实体

---

## 涉及文件

### 新增
| 文件 | 说明 |
|------|------|
| `frontend/src/components/Cesium/PlayerController/NavGuideHUD.vue` | 方向 HUD 组件（箭头 + 距离 + 到达提示） |

### 修改
| 文件 | 说明 |
|------|------|
| `usePlayerController.js` | 新增 `navTarget` / `setNavTarget` / `clearNavTarget` + 每帧方位距离计算 |
| `useCesiumToolModules.js` | 人物漫游模块新增「设置导航目标」「清除导航」actions |
| `CesiumContainer.vue` | 挂载 NavGuideHUD + 搜索目标接入 |
| `HomeView.vue` | 传递搜索选点结果到 CesiumContainer |

---

## 详细步骤

### Step 1: usePlayerController.js — 导航状态 + 方位计算

**新增响应式状态：**

```js
const navTarget = ref(null); // { lng, lat, name, bearing?, distance?, _entity? }
```

**setNavTarget 方法：**

```js
function setNavTarget({ lng, lat, name }) {
    navTarget.value = { lng, lat, name: name || '目标点', bearing: 0, distance: 0 };

    // 聚焦 Cesium Selection Indicator
    const viewer = getViewer();
    if (viewer) {
        const Cesium = getCesium();
        const pos = Cesium.Cartesian3.fromDegrees(lng, lat);
        // 创建临时 entity 用于 Selection Indicator 显示
        const targetEntity = viewer.entities.add({
            position: pos,
            point: { pixelSize: 0 }, // 不可见点，仅用于选中指示器
            name: name || '导航目标',
        });
        viewer.selectedEntity = targetEntity;
        navTarget.value._entity = targetEntity;
    }
}
```

**clearNavTarget 方法：**

```js
function clearNavTarget() {
    const viewer = getViewer();
    if (viewer && navTarget.value?._entity) {
        viewer.entities.remove(navTarget.value._entity);
        viewer.selectedEntity = undefined;
    }
    navTarget.value = null;
}
```

**每帧更新（在 preUpdateListener 中，playerPosition 更新后追加）：**

```js
if (navTarget.value && playerPosition.value) {
    const bearing = computeBearing(
        playerPosition.value.lng, playerPosition.value.lat,
        navTarget.value.lng, navTarget.value.lat
    );
    const distance = computeHaversine(
        playerPosition.value.lng, playerPosition.value.lat,
        navTarget.value.lng, navTarget.value.lat
    );
    navTarget.value.bearing = bearing;
    navTarget.value.distance = distance;
}
```

**工具函数（文件底部，纯函数不导出）：**

```js
// Haversine 距离（米）
function computeHaversine(lon1, lat1, lon2, lat2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 初始方位角（度，0=北，顺时针）
function computeBearing(lon1, lat1, lon2, lat2) {
    const toRad = d => d * Math.PI / 180;
    const toDeg = r => r * 180 / Math.PI;
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
```

**返回值新增：** `navTarget`, `setNavTarget`, `clearNavTarget`

---

### Step 2: NavGuideHUD.vue — 方向 HUD 组件

**定位：** 屏幕顶部居中，fixed，z-index: 9997，pointer-events: none

**Props：**
- `navTarget` — `{ lng, lat, name, bearing, distance }` 或 null

**核心逻辑：**
- 箭头角度 = `navTarget.bearing`（相对于正北，CSS rotate 顺时针）
- 距离格式化：< 1000m → "XXXm"，≥ 1000m → "X.Xkm"
- 距离 < 10m → 卡片变绿 + 显示 "✓ 已到达"

**视觉效果：**

```
┌──────────────────────────┐
│     🎯 北京天安门         │  ← 目标名称
│         ↑                │  ← 方向箭头（CSS border + rotate）
│       320m               │  ← 距离
└──────────────────────────┘
```

---

### Step 3: useCesiumToolModules.js — 控制中心接入

**player 模块 actions 新增：**

```js
{ id: 'setNavTarget', label: '设置导航目标', disabled: !_playerController?.isActive?.value },
{ id: 'clearNavTarget', label: '清除导航', disabled: !_playerController?.navTarget?.value },
```

**handleToolAction 新增：**

```js
setNavTarget: () => {
    const viewer = getViewer();
    if (!viewer) return;
    // 创建一次性点击事件
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
        // 优先检测是否点到了 entity（数据要素）
        const picked = viewer.scene.pick(click.position);
        if (Cesium.defined(picked) && picked.id?.position) {
            // 点到了数据要素 → 直接用该 entity
            viewer.selectedEntity = picked.id;
            const carto = Cesium.Cartographic.fromCartesian(
                picked.id.position.getValue(Cesium.JulianDate.now())
            );
            if (carto) {
                _playerController?.setNavTarget?.({
                    lng: Cesium.Math.toDegrees(carto.longitude),
                    lat: Cesium.Math.toDegrees(carto.latitude),
                    name: picked.id.name || '数据要素',
                });
            }
        } else {
            // 点到了地形 → 用坐标
            const cartesian = viewer.scene.pickPosition(click.position)
                || viewer.scene.globe.pick(viewer.camera.getPickRay(click.position), viewer.scene);
            if (cartesian) {
                const carto = Cesium.Cartographic.fromCartesian(cartesian);
                _playerController?.setNavTarget?.({
                    lng: Cesium.Math.toDegrees(carto.longitude),
                    lat: Cesium.Math.toDegrees(carto.latitude),
                    name: '地图选点',
                });
            }
        }
        handler.destroy();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
},
clearNavTarget: () => _playerController?.clearNavTarget?.(),
```

---

### Step 4: CesiumContainer.vue — 挂载 HUD + 搜索接入

**模板新增：**

```vue
<NavGuideHUD
    v-if="playerController.isActive.value && playerController.navTarget.value"
    :navTarget="playerController.navTarget.value"
/>
```

**Props 新增：**

```js
const props = defineProps({
    searchNavTarget: { type: Object, default: null },
});
```

**Watch 搜索目标：**

```js
watch(() => props.searchNavTarget, (target) => {
    if (target?.lng != null && target?.lat != null) {
        playerController.setNavTarget(target);
    }
});
```

---

### Step 5: HomeView.vue — 搜索结果传递

在 HomeView 中，已有 `latestSearchPoi` 存储搜索选点结果。传递给 CesiumContainer：

```vue
<CesiumContainer
    ref="cesiumContainerRef"
    :searchNavTarget="playerNavTarget"
    @view-sync="handleViewSync"
/>
```

```js
const playerNavTarget = computed(() => {
    if (!cesiumContainerRef.value?.playerController?.isActive?.value) return null;
    return latestSearchPoi.value;
});
```

---

## 数据要素选择逻辑

Cesium 中点击已导入的数据要素设为导航目标：

1. `scene.pick(click.position)` 检测是否点到了 entity
2. 如果 pick 到 entity 且 entity 有 position → 直接用该 entity（`viewer.selectedEntity = entity`）
3. 如果 pick 到地形 → 用 `globe.pick` 获取坐标创建新目标

---

## 测试方案

| # | 场景 | 预期结果 |
|---|------|---------|
| 1 | 启动漫游 → 点击「设置导航目标」→ 点击地图 | Selection Indicator + HUD 显示 |
| 2 | 走向目标 | HUD 距离递减 + 箭头方向变化 |
| 3 | 到达目标（< 10m） | 卡片变绿 + "✓ 已到达" |
| 4 | 点击「清除导航」 | HUD 消失 + Selection Indicator 消失 |
| 5 | 漫游模式下搜索地名 | 自动设为导航目标 |
| 6 | 点击已导入的 GeoJSON 要素 | 设为导航目标 |
| 7 | 第一人称/第三人称切换 | HUD 正常显示 |
