# 位置搜索 API 集成指南

## 📋 概述

本指南说明如何使用新的分层认证位置搜索 API 系统。

**关键特性**:
- ✅ 三个搜索服务：天地图、Nominatim、高德
- ✅ 分层认证：Nominatim/EPSG/IPAPI 无认证，高德需认证
- ✅ 详细错误处理：针对每个服务的特定错误信息

---

## 🚀 快速开始

### 1. 后端环境设置

确保安装了所有依赖：

```bash
cd WebGIS_Dev/backend
uv sync
# 或使用 pip
pip install -e .
```

**验证安装**:
```bash
python -c "from backend.api.external_proxy import router; print('OK: Module imported successfully')"
```

### 2. 后端启动

```bash
cd WebGIS_Dev/backend
python app.py
# 或使用 uvicorn
uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
```

后端服务将在 `http://localhost:8000` 启动。

### 3. 前端环境设置

```bash
cd WebGIS_Dev/frontend
npm install
```

### 4. 前端开发

```bash
cd WebGIS_Dev/frontend
npm run dev
```

前端将在 `http://localhost:5173` 启动。

---

## 🔑 API 认证策略

### 无需认证的服务（任何用户可调用）

#### Nominatim 地名搜索
```
GET /api/proxy/search/nominatim?keywords=beijing&limit=10
```
- **认证**: ❌ 无
- **说明**: 免费国际地名搜索，无需 API 密钥

#### EPSG 坐标系定义
```
GET /api/proxy/geo/epsg/4326/proj4
```
- **认证**: ❌ 无
- **说明**: 公开的坐标系参考，无需认证

#### IPAPI 国家信息
```
GET /api/proxy/ipapi/country
```
- **认证**: ❌ 无
- **说明**: 获取 IP 对应的国家/地区，无需认证

### 需要认证的服务（仅认证用户）

#### 高德地名搜索
```
GET /api/proxy/amap/place/text?keywords=beijing&city=beijing
```
- **认证**: ✅ 是
- **需要**: 有效的用户 API token
- **错误处理**: 7 种错误码 + HTTP 状态码

#### 高德地点详情
```
GET /api/proxy/amap/place/detail?id=POI_ID
```
- **认证**: ✅ 是

#### 高德地理编码
```
GET /api/proxy/amap/geocode/geo?address=beijing
GET /api/proxy/amap/geocode/regeo?location=116.3974,39.9093
```
- **认证**: ✅ 是

#### 高德天气查询
```
GET /api/proxy/amap/weather?city=beijing
```
- **认证**: ✅ 是

#### 高德 IP 定位
```
GET /api/proxy/amap/ip
```
- **认证**: ✅ 是

---

## 🔧 前端集成

### 基础使用

位置搜索组件已集成到 `LocationSearch.vue`，通过 `LayerControlPanel` 使用：

```vue
<LocationSearch
  :fetcher="fetchLocationResults"
  :tiandituTk="tiandituTk"
  @select-result="handleSelectResult"
/>
```

### 调用流程

```
LocationSearch.vue
    ↓ (调用 props.fetcher)
LayerControlPanel.fetchLocationResults()
    ↓
frontend/src/api/index.js::apiSearchLocations()
    ↓
frontend/src/api/locationSearch.js::fetchLocationResultsByService()
    ↓
    ├─ searchWithTianditu()     (前端直连)
    ├─ searchWithNominatim()    (后端代理，无认证)
    └─ searchWithAmap()         (后端代理，有认证)
```

### 错误处理

#### 天地图错误

| 错误 | 提示信息 |
|------|---------|
| Token 未配置 | "天地图配置错误：Token 未配置" |
| 网络连接失败 | "天地图搜索：网络连接失败，请检查网络设置" |
| 请求超时 | "天地图搜索：请求超时，请稍后重试" |
| 服务不可用 | "天地图服务暂时不可用，请稍后重试" |

#### Nominatim 错误

| 错误 | 提示信息 |
|------|---------|
| 网络连接失败 | "Nominatim 地名搜索：网络连接失败" |
| 请求超时 | "Nominatim 地名搜索：请求超时" |
| 服务不可用 | "Nominatim 服务不可用" |

#### 高德 API 错误

| 错误码 | 错误信息 | 提示信息 |
|-------|---------|---------|
| 10000 | 正常 | 无（返回结果） |
| 10001 | 密钥错误 | "用户密钥错误，请联系管理员" |
| 10002 | IP 限制 | "用户IP被限制，请稍后重试" |
| 10003 | 日配额超限 | "日调用量超限，请明天再试" |
| 10004 | 服务不支持 | "服务不支持此操作" |
| 10005 | 参数缺失 | "必填参数缺失" |
| 20000 | 参数非法 | "请求参数非法" |

| HTTP 状态码 | 提示信息 |
|-----------|---------|
| 401 | "权限不足，请确保已正确配置高德API Key" |
| 403 | "高德API访问被拒绝，请检查API Key是否有效" |
| 503 | "高德服务暂时不可用，请稍后重试" |

---

## 📝 代码位置

### 后端文件

| 文件 | 说明 |
|------|------|
| `backend/api/external_proxy.py` | 核心文件（10+个 API 路由） |
| 路由 `/search/nominatim` | Nominatim 代理（无认证）|
| 路由 `/geo/epsg/{epsg_code}/proj4` | EPSG 代理（无认证） |
| 路由 `/ipapi/country` | IPAPI 代理（无认证） |
| 路由 `/amap/place/text` | 高德搜索（有认证） |
| 路由 `/amap/place/detail` | 高德详情（有认证） |
| 路由 `/amap/geocode/geo` | 高德地理编码（有认证） |
| 路由 `/amap/geocode/regeo` | 高德反地理编码（有认证） |
| 路由 `/amap/weather` | 高德天气（有认证） |
| 路由 `/amap/ip` | 高德IP定位（有认证） |

### 前端文件

| 文件 | 说明 |
|------|------|
| `frontend/src/api/locationSearch.js` | 核心搜索逻辑（270+ 行） |
| `searchWithTianditu()` | 天地图直连搜索 + 错误处理 |
| `searchWithNominatim()` | Nominatim 代理搜索 + 错误处理 |
| `searchWithAmap()` | 高德代理搜索 + 完整错误映射 |
| `fetchLocationResultsByService()` | 服务路由分发器 |
| `frontend/src/api/index.js` | 导出 `apiSearchLocations()` |
| `frontend/src/components/LocationSearch.vue` | UI 组件 |
| `frontend/src/components/LayerControlPanel.vue` | 搜索集成（调用 API） |

---

## ✅ 验证清单

### 后端验证

```bash
# 1. 检查依赖
python -c "import httpx, fastapi, pandas; print('OK')"

# 2. 检查模块
python -c "from backend.api.external_proxy import router; print('OK')"

# 3. 启动后端
python app.py

# 4. 测试 Nominatim (无认证)
curl "http://localhost:8000/api/proxy/search/nominatim?keywords=beijing&limit=5"

# 5. 测试高德搜索 (有认证，无 token 应返回 401/403)
curl "http://localhost:8000/api/proxy/amap/place/text?keywords=beijing"
```

### 前端验证

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev

# 3. 打开浏览器 http://localhost:5173

# 4. 打开 DevTools (F12) → Console 查看日志

# 5. 测试位置搜索
#    - 在 LocationSearch 框输入 "Beijing"
#    - 点击搜索
#    - 观察 Console 输出和网络请求
```

---

## 🐛 常见问题

### Q1: "ModuleNotFoundError: No module named 'httpx'"

**解决方案**:
```bash
# 安装后端依赖
cd backend
uv sync
# 或 pip install httpx fastapi uvicorn pandas
```

### Q2: 高德搜索返回 401 错误

**原因**: 用户未认证或 API token 无效

**解决方案**:
1. 确保用户已登录
2. 检查用户 API token 是否有效
3. 查看后端日志确认 token 是否正确传递

### Q3: Nominatim 搜索超时

**原因**: 网络连接问题或 Nominatim 服务响应慢

**解决方案**:
1. 检查网络连接
2. 等待一段时间后重试
3. 查看浏览器 DevTools Network 标签查看具体超时情况

### Q4: 天地图搜索返回"缺少参数：mapBound"

**原因**: Token 未配置或 mapBound 参数格式错误

**解决方案**:
1. 确保 `props.tiandituTk` 已正确传入
2. mapBound 应为 "minLon,minLat,maxLon,maxLat" 格式
3. 如未提供，自动使用中国范围：'73.5,18.2,135.0,53.5'

---

## 📚 相关文档

- [API 设计文档](API_DESIGN.md) - 详细的 API 规范
- [错误处理指南](ERROR_HANDLING.md) - 完整的错误码参考
- [集成示例](INTEGRATION_EXAMPLES.md) - 实际使用示例

---

## 🔄 下一步

1. **验证环境** - 按照上面的"验证清单"检查所有组件
2. **测试搜索** - 使用 LocationSearch 组件测试所有三个服务
3. **监控错误** - 在浏览器 DevTools 观察错误提示
4. **收集反馈** - 记录任何不一致或不清楚的错误信息

---

## 📞 支持

如遇问题，请检查：
1. 浏览器 DevTools Console（F12）- 前端错误
2. 后端终端输出 - 后端日志
3. 网络标签（Network Tab）- HTTP 请求/响应
4. 本文档常见问题部分
