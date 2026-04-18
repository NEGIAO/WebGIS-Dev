# WebGIS 定位服务后端代理实现指南

## 📋 实现清单

### ✅ 前端已完成（2025-04-18）

#### 1. backend.js - 新增 API 接口

**文件位置**：`frontend/src/api/backend.js`

**新增函数**：

```javascript
// 已弃用函数（保留向后兼容）
export async function apiGetLocationFromIP(ip = '') {
  // 旧接口，已弃用，请使用 apiLocationIpLocate
}

// ✅ 统一 IP 定位 API
export async function apiLocationIpLocate(ip = '', options = {})
  返回: { ok, status, city, province, adcode, extent, source }

// ✅ 反向地理编码（后端代理）
export async function apiLocationReverse(lng, lat, options = {})
  返回: { formattedAddress, province, city, district, township, adcode, source }

// ✅ 用户访问追踪
export async function apiLocationTrackVisit(options = {})
  返回: { ip, city, province, country, timestamp, tracked }
```

#### 2. useUserLocation.js - 改用后端代理

**文件位置**：`frontend/src/composables/useUserLocation.js`

**改动函数**：

| 函数名 | 改动 | 行数变化 |
|-------|------|--------|
| `zoomToUserCityByIp()` | 改用 `apiLocationIpLocate()` | -30 +50 |
| `buildIpCandidate()` | 改用 `apiLocationIpLocate()` | -15 +20 |
| `zoomToUser()` | 改用 `apiLocationReverse()` | -10 +15 |

**关键改进**：
- ✅ 支持配额限制错误捕获（isQuotaExceeded）
- ✅ 自动显示定位来源（"高德"或"免费定位"）
- ✅ 支持开发者模式（dev=1 时跳过高德）
- ✅ 错误自动降级处理

#### 3. RegisterView.vue - 自动定位追踪

**文件位置**：`frontend/src/views/RegisterView.vue`

**改动**：在 `onMounted()` 钩子中添加

```javascript
apiLocationTrackVisit({
  userAgent: navigator?.userAgent,
  referrer: document?.referrer
})
```

**特点**：
- ✅ 异步发送，不阻塞加载
- ✅ 失败静默处理
- ✅ 无需用户交互

#### 4. api/index.js - 导出新 API

**文件位置**：`frontend/src/api/index.js`

**改动**：添加 `export * from './backend'`

---

## 🔧 后端需要实现的接口

### 1. POST `/api/v1/location/ip-locate`

**用途**：统一 IP 定位入口，支持高德优先、配额超限自动降级

**请求体**：
```json
{
  "ip": "1.2.3.4",
  "prefer_free_service": false,
  "silent": false
}
```

**成功响应** (HTTP 200)：
```json
{
  "code": 200,
  "data": {
    "ok": true,
    "status": "1",
    "city": "北京",
    "province": "北京",
    "adcode": "110000",
    "extent": [116.0, 39.5, 117.0, 40.5],
    "source": "amap"
  },
  "message": "success"
}
```

**配额超限响应** (HTTP 429)：
```json
{
  "detail": "IP 定位：API 调用额度已用完，部分功能受限"
}
```

**后端实现逻辑**：

```python
@app.post("/api/v1/location/ip-locate")
async def ip_locate(request: IpLocateRequest, current_user: User = Depends(get_current_user)):
    """
    统一 IP 定位接口
    
    优先级：
    1. 如果 prefer_free_service=true，直接跳到第 3 步
    2. 优先使用高德 API：
       - 检查用户单日配额
       - 调用高德 IP 定位 API
       - 成功 → 返回 source="amap"
       - 配额用完 → HTTP 429，继续第 3 步
       - 其他错误 → 继续第 3 步
    3. 降级到免费服务（Nominatim 或 IP 库）
       - 返回 source="free"
    """
    ip = request.ip or get_client_ip()
    
    # 跳过高德（开发者模式）
    if request.prefer_free_service:
        return free_service_ip_locate(ip)
    
    # 检查用户配额
    user_id = current_user.id if current_user else None
    if user_id:
        quota = check_user_amap_quota(user_id)
        if quota.exceeded:
            # 配额用完，返回 429
            raise HTTPException(status_code=429, detail=quota.error_message)
    
    # 尝试高德 API
    try:
        result = amap_ip_locate(ip)
        record_amap_usage(user_id)  # 记录用量
        return {
            "ok": True,
            "status": "1",
            "source": "amap",
            **result
        }
    except Exception as e:
        # 高德失败，继续到免费服务
        if user_id:
            log_amap_error(user_id, str(e))
        pass
    
    # 降级到免费服务
    result = nominatim_ip_locate(ip)  # 或其他免费服务
    return {
        "ok": True,
        "status": "1",
        "source": "free",
        **result
    }
```

---

### 2. POST `/api/v1/location/reverse`

**用途**：反向地理编码（坐标→地址），后端选择最优服务

**请求体**：
```json
{
  "lng": 116.0,
  "lat": 39.5,
  "prefer_service": "auto",
  "silent": false
}
```

**成功响应** (HTTP 200)：
```json
{
  "code": 200,
  "data": {
    "formattedAddress": "北京市朝阳区某街道",
    "province": "北京",
    "city": "北京",
    "district": "朝阳区",
    "township": "某街道办事处",
    "adcode": "110105",
    "source": "amap",
    "businessAreas": []
  },
  "message": "success"
}
```

**后端实现逻辑**：

```python
@app.post("/api/v1/location/reverse")
async def reverse_geocode(request: ReverseGeocodeRequest):
    """
    反向地理编码，支持多个服务
    
    prefer_service 优先级：
    - "auto": 自动选择（高德 > 天地图 > Nominatim）
    - "amap": 仅使用高德
    - "tianditu": 仅使用天地图
    - "nominatim": 仅使用 Nominatim
    """
    
    if request.prefer_service == "auto":
        # 自动选择：尝试高德 → 天地图 → Nominatim
        
        # 1. 尝试高德
        try:
            return amap_reverse_geocode(request.lng, request.lat)
        except:
            pass
        
        # 2. 尝试天地图
        try:
            return tianditu_reverse_geocode(request.lng, request.lat)
        except:
            pass
    
    elif request.prefer_service == "amap":
        return amap_reverse_geocode(request.lng, request.lat)
    elif request.prefer_service == "tianditu":
        return tianditu_reverse_geocode(request.lng, request.lat)
    
    # 3. Nominatim（通常最后降级）
    return nominatim_reverse_geocode(request.lng, request.lat)
```

---

### 3. POST `/api/v1/location/track-visit`

**用途**：记录用户访问时的位置和设备信息

**请求体**：
```json
{
  "user_agent": "Mozilla/5.0...",
  "referrer": "https://..."
}
```

**成功响应** (HTTP 200)：
```json
{
  "code": 200,
  "data": {
    "ip": "1.2.3.4",
    "city": "北京",
    "province": "北京",
    "country": "中国",
    "timestamp": "2025-04-18T12:34:56Z",
    "tracked": true
  },
  "message": "success"
}
```

**后端实现逻辑**：

```python
@app.post("/api/v1/location/track-visit")
async def track_visit(request: TrackVisitRequest, current_user: User = Depends(get_current_user_optional)):
    """
    记录用户访问时的位置信息
    
    - 优先级 IP 定位（快速，精度可接受）
    - 记录到 visit_tracking 表
    - 与用户关联（如已登陆）
    """
    
    ip = get_client_ip()
    
    # IP 定位（使用免费服务，快速）
    location = free_service_ip_locate(ip)
    
    # 保存记录
    visit = VisitTracking(
        ip=ip,
        city=location.city,
        province=location.province,
        country=location.country,
        user_agent=request.user_agent[:500],
        referrer=request.referrer[:500],
        user_id=current_user.id if current_user else None,
        created_at=datetime.utcnow()
    )
    db.add(visit)
    db.commit()
    
    return {
        "ip": ip,
        "city": location.city,
        "province": location.province,
        "country": location.country,
        "timestamp": visit.created_at.isoformat(),
        "tracked": True
    }
```

---

## 📊 数据库设计

### visit_tracking 表

```sql
CREATE TABLE visit_tracking (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  ip VARCHAR(50) NOT NULL,
  city VARCHAR(100),
  province VARCHAR(100),
  country VARCHAR(100),
  user_agent TEXT,
  referrer TEXT,
  user_id INT,  -- 关联 users 表，可空
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at),
  INDEX idx_ip (ip)
);
```

### user_amap_quota 表

```sql
CREATE TABLE user_amap_quota (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL UNIQUE,
  date DATE NOT NULL,
  ip_locate_count INT DEFAULT 0,        -- 已使用次数
  ip_locate_limit INT DEFAULT 5,        -- 每日限制
  reverse_geocode_count INT DEFAULT 0,  -- 反向地理编码次数
  last_used_at TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_user_date (user_id, date)
);
```

---

## 🔍 API 调用示例

### 前端调用示例

```javascript
// 1. IP 定位
import { apiLocationIpLocate, apiLocationReverse, apiLocationTrackVisit } from '@/api';

// 自动定位用户（登陆页）
const result = await apiLocationTrackVisit({
  userAgent: navigator.userAgent,
  referrer: document.referrer
});

// 2. 用户手动定位（点击定位按钮）
const ipResult = await apiLocationIpLocate('', {
  preferFreeService: false,
  silent: false
});

// 3. 反向地理编码
const reverseResult = await apiLocationReverse(116.0, 39.5, {
  preferService: 'auto',
  silent: false
});
```

### 后端调用示例（Python）

```python
# 高德 API 调用
import requests

def amap_ip_locate(ip):
    """调用高德 IP 定位 API"""
    api_key = os.getenv("AMAP_WEB_SERVICE_KEY")
    url = f"https://restapi.amap.com/v3/ip?ip={ip}&key={api_key}"
    resp = requests.get(url)
    data = resp.json()
    
    if data.get("status") == "1":
        return {
            "city": data.get("city"),
            "province": data.get("province"),
            "adcode": data.get("adcode"),
            "extent": [...]  # 城市范围
        }
    raise Exception(f"AMap API Error: {data.get('info')}")

# Nominatim 调用（免费）
def nominatim_reverse_geocode(lng, lat):
    """调用 Nominatim 反向地理编码"""
    url = f"https://nominatim.openstreetmap.org/reverse?lon={lng}&lat={lat}&format=json&zoom=10&addressdetails=1"
    resp = requests.get(url, headers={"User-Agent": "WebGIS"})
    data = resp.json()
    
    return {
        "formattedAddress": data.get("display_name"),
        "province": data.get("address", {}).get("state"),
        "city": data.get("address", {}).get("city"),
        "district": data.get("address", {}).get("county"),
        "source": "nominatim"
    }
```

---

## ✨ 测试检查清单

- [ ] `/api/v1/location/ip-locate` 接口能正常返回高德定位结果
- [ ] `/api/v1/location/ip-locate` 在配额超限时返回 HTTP 429
- [ ] `/api/v1/location/ip-locate` 在高德失败时自动降级到免费服务
- [ ] `/api/v1/location/reverse` 接口能返回反向地理编码结果
- [ ] `/api/v1/location/track-visit` 能正常记录访问信息到数据库
- [ ] 前端开发者模式（`?dev=1`）时能跳过高德 API
- [ ] 登陆页面自动发送追踪请求（F12 查看网络）
- [ ] 定位成功时显示"已使用 IP 定位（高德/免费定位）"
- [ ] 无需高德 API Key 也能进行免费定位（降级成功）

---

## 🎯 总结

| 阶段 | 状态 | 负责 |
|------|------|------|
| 前端 API 设计 | ✅ 完成 | - |
| 前端代码实现 | ✅ 完成 | - |
| 后端接口实现 | 📋 待处理 | Backend 团队 |
| 数据库设计 | 📋 待处理 | DBA |
| 集成测试 | 📋 待处理 | QA |
| 上线部署 | 📋 待处理 | DevOps |

**预期效果**：用户在全球任何位置都能使用定位功能，通过智能降级保证服务可用性 🌍✨
