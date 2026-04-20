# 2026-04-20 加载逻辑韧性与递归 Bug 修复 (v3.0.3)

## 日期和时间
2026-04-20 15:45

## 问题诊断
在地图初始化成功后，加载覆盖层会随机出现在导航/浏览期间，并陷入死锁状态（永不调用 `hideLoading()`）。

**根本原因**：
1. 路由守卫 (`router.beforeEach`) 缺乏"初始化完成标志"，导致每次路由变化都可能重新显示加载。
2. 无法区分真实导航（`to.path !== from.path`）和参数/hash 变化。
3. 全局加载状态无超时保护机制，导致"僵尸进程"加载（Zombie Loading）。
4. 脚本顶部直接调用 `showLoading()` 覆盖路由守卫的加载接力消息。

## 修改内容

### 1. GIS 初始化锁实现 (`useAppStore.ts`)
```typescript
const isInitialGisLoadComplete = ref(false);

function markGisInitComplete() {
  isInitialGisLoadComplete.value = true;
}
```
- 路由守卫检查 `isInitialGisLoadComplete`：若已完成，home 路由不再显示加载。
- 仅在首次 `settleMapCoreLoading()` 时设置为 true。

### 2. 15 秒失败保险机制 (`useAppStore.ts`)
```typescript
let loadingTimeoutId = null;

function showLoading(text: string = '') {
  // ... 前置代码 ...
  
  // 自动在 15 秒后关闭加载
  loadingTimeoutId = window.setTimeout(() => {
    if (loading.value) {
      console.warn('[Loading Timeout] Auto-hiding...');
      hideLoading();
    }
    loadingTimeoutId = null;
  }, 15000);
}

function hideLoading() {
  // ... 清除超时 ...
  if (loadingTimeoutId !== null) {
    clearTimeout(loadingTimeoutId);
    loadingTimeoutId = null;
  }
}
```

### 3. 路由守卫路径比较 (`router/index.js`)
```javascript
router.beforeEach(async (to, from) => {
  // 守卫 1：忽略纯查询/hash 变化（仅参数更新）
  const isRealNavigation = !from || from.path !== to.path;
  if (!isRealNavigation) {
    return true;
  }
  
  // 守卫 2：GIS 初始化完成后，防止重新显示 home 路由的加载
  const appStore = useAppStore();
  if (appStore.isInitialGisLoadComplete && isHomeRoute) {
    return true;
  }
  
  // ... 其余鉴权逻辑 ...
});
```

### 4. HomeView 中标记初始化完成
- 移除脚本顶部的重复 `showLoading()` 调用（已被路由守卫接力处理）。
- 在 `settleMapCoreLoading()` 中调用 `appStore.markGisInitComplete()`。
- 确保所有 `showLoading()` 调用都包含 try-finally 块的 `hideLoading()`。

### 5. 加载调用点审计结果
| 调用位置 | 文件 | 状态 | 处理方式 |
|---------|------|------|---------|
| router.beforeEach line 96 | `router/index.js` | ✅ 正常 | try-finally hideLoading() |
| router.beforeEach line 110 | `router/index.js` | ✅ 正常 | shouldRelayLoadingToHome 标志 |
| router.beforeEach line 116 | `router/index.js` | ✅ 正常 | shouldRelayLoadingToHome 标志 |
| toggle3D line 315 | `HomeView.vue` | ✅ 正常 | try-catch-finally hideLoading() |
| handleUploadData line 347 | `HomeView.vue` | ✅ 正常 | try-finally hideLoading() |
| ~~脚本顶部 line 21~~ | `HomeView.vue` | ✅ 已删除 | 路由守卫接力已处理 |

## 新的加载状态流转

### 首次访问 home 路由
```
1. 用户进入 /home
2. router.beforeEach 触发：
   - isRealNavigation = true
   - isInitialGisLoadComplete = false
   - showLoading('Loading Map Engine & Assets...')
   - shouldRelayLoadingToHome = true
3. HomeView 挂载，MapContainer 初始化 GIS 资源
4. 地图核心就绪：
   - emit('map-core-ready')
   - handleMapCoreReady() 触发
   - settleMapCoreLoading() 被调用
   - markGisInitComplete() 将标志置为 true
   - hideLoading() 清除覆盖层
5. 页面交互可用
```

### 后续 hash/query 变化
```
1. 用户点击 POI，hash 变化为 #/home?p=xxxx
2. router.beforeEach 触发：
   - isRealNavigation = false (from.path == to.path)
   - 直接返回 true，不显示加载
3. 页面继续正常交互
```

### 再次导航到 home
```
1. 用户从其他页面返回 home
2. router.beforeEach 触发：
   - isRealNavigation = true
   - isInitialGisLoadComplete = true （已标记）
   - 直接返回 true，不显示加载
3. 页面立即显示（缓存状态）
```

### 超时保险触发（异常情况）
```
1. MapContainer 初始化无响应（网络超时）
2. 超过 15 秒，自动调用 hideLoading()
3. 前端显示 toast：Taking longer than expected...
4. 用户可点击刷新页面
```

## 影响范围
1. **路由守卫与首屏加载体验**：增强鲁棒性，消除随机加载覆盖层。
2. **GIS 核心初始化**：标志化管理，后续导航更快速。
3. **特殊操作流程**：3D 引擎、GIS 数据导入仍保持独立的加载控制。
4. **容错机制**：15 秒超时保护，防止僵尸进程。

## 修改的文件路径（绝对路径）
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\stores\useAppStore.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\router\index.js
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\views\HomeView.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\loading.js（文档参考，无变更）

## 版本信息
- **当前版本**：WebGIS v3.0.3
- **更新类别**：Bug Fix + Resilience Enhancement
- **优先级**：Critical（递归加载 Bug）

## 测试清单
- [ ] 首屏加载：无额外加载覆盖层
- [ ] hash/query 变化：无加载闪烁
- [ ] 返回 home 路由：无重新加载
- [ ] 3D 引擎切换：独立加载逻辑正常
- [ ] GIS 数据导入：独立加载逻辑正常
- [ ] 浏览器刷新：恢复正常状态
- [ ] 网络超时（模拟）：15 秒后自动关闭加载
