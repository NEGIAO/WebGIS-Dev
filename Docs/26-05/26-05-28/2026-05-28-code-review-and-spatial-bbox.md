# Code Review 与空间聚合 BBox 优化

- **日期和时间**：2026-05-28 16:00
- **修改内容**：
  1. 全栈 Code Review（前端 + 后端），发现 10 项问题
  2. 空间聚合 BBox 改为自动获取当前地图视图范围，无需手动输入
- **修改原因**：用户反馈空间聚合分析的 BBox 需要手动输入 4 个坐标值，操作繁琐且容易出错，希望自动获取当前地图可视范围
- **影响范围**：空间分析模块（SpatialAnalysisPanel / ControlsPanel / HomeView / MapContainer）
- **优化解决方案**：

## Code Review 发现的问题

### 前端

| # | 严重度 | 文件 | 问题 |
|---|--------|------|------|
| 1 | 中 | MapContainer.vue | 文件仍过大（1854 行），卷帘分析逻辑应提取到 composable |
| 2 | 低 | router/index.js + MapContainer.vue | `normalizeBinaryFlag` 重复定义，应提取为共享工具函数 |
| 3 | 中 | MapContainer.vue:1397 | 鹰眼视图硬编码天地图 Token，应使用环境变量 |
| 4 | 低 | HomeView.vue:1129 | 欢迎消息版本号硬编码 `V3.1.3`，未与 package.json 同步 |

### 后端

| # | 严重度 | 文件 | 问题 |
|---|--------|------|------|
| 5 | 高 | app.py:93-99 | CORS `allow_origins=["*"]` 完全开放，生产环境应限制 |
| 6 | 高 | auth.py:34 | 硬编码默认密码 `GUEST_PASSWORD = "123"` |
| 7 | 中 | proxy.py:28 | `verify=False` 禁用 SSL 验证 |
| 8 | 高 | proxy.py:246-333 | `/proxy/{target_url:path}` 可代理任意 URL，开放代理风险 |
| 9 | 中 | spatial.py:389-404 | 空间聚合 O(n*m) 双重循环，大数据量性能差 |
| 10 | 中 | spatial.py:561 | 空间分析端点缺少 `require_api_access` 认证 |

## 空间聚合 BBox 自动获取 - 实施方案

### 核心思路
通过 props 传递链路，将 MapContainer 的 `getMapExtent()` 方法逐层传递到 SpatialAnalysisPanel：
```
MapContainer.getMapExtent() → HomeView → ControlsPanel → SpatialAnalysisPanel
```

### 实施步骤

1. **MapContainer.vue**：新增 `getMapExtent()` 方法
   - 获取当前视图 extent（EPSG:3857）
   - 通过 `toLonLat` 转换为 EPSG:4326
   - 返回 `{ minLon, minLat, maxLon, maxLat }`
   - 通过 `defineExpose` 暴露给父组件

2. **HomeView.vue**：新增 `getMapExtent()` 包装函数
   - 调用 `mapContainerRef.value?.getMapExtent()`
   - 通过 `:get-map-extent` prop 传递给 ControlsPanel

3. **ControlsPanel.vue**：透传 prop
   - 新增 `getMapExtent` prop（Function 类型）
   - 传递给 SpatialAnalysisPanel

4. **SpatialAnalysisPanel.vue**：核心改动
   - 新增 `getMapExtent` prop
   - 新增 `fillBboxFromMapExtent()` 函数：调用 prop 获取 extent 并填充 BBox 输入框
   - `selectTool()` 中：选择聚合工具时自动填充 BBox
   - 模板中：新增"获取当前视图范围"按钮（Crosshair 图标）

### 修改的文件路径
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Map\MapContainer.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\views\HomeView.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\ControlsPanel\ControlsPanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\ControlsPanel\SpatialAnalysisPanel.vue`

### 测试方案
1. 打开空间分析面板，选择"空间聚合"工具
2. 验证 BBox 四个输入框自动填充当前地图可视范围的经纬度
3. 平移/缩放地图后，再次点击"获取当前视图范围"按钮，验证 BBox 更新
4. 手动修改某个 BBox 值后，执行分析，验证功能正常
5. 切换到其他分析工具再切回聚合，验证 BBox 仍自动填充
