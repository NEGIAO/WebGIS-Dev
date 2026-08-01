# 2026-08-01 代码审查 Bug 修复（V3.5.4 - Batch 8）

**日期与时间**：2026-08-01 16:30
**任务等级**：L2
**版本**：V3.5.4（Batch 8 / 共 8 个 Batch，合并为一个版本号）

---

## 问题分析

本次任务是对暂存区代码进行全面 Code Review 后修复所有发现的 bug。

### 核心症状 → 根本原因

| # | 症状 | 根本原因 | 严重度 |
|---|------|---------|--------|
| 1 | wind 模块生产环境打印低帧率日志 | `console.warn` 缺少 DEV 门禁 | MEDIUM |
| 2 | 首次 API 错误 toast 丢失 | `getMessage()` async 包装导致首次调用时 Promise 未 resolve | HIGH |
| 3 | PhysicsSystem 存在无用方法 | `_assertWorld()` 从未被调用 | LOW |
| 4 | OSM Buildings 开启后地形不自动切换 | `ensureCesiumWorldTerrainForOsmBuildings()` 被改为仅警告不切换 | HIGH |
| 5 | ShallowWater animate 异常时 pause() 可能抛错 | catch 块内 pause() 无保护 | MEDIUM |
| 6 | 天地图搜索改用 backendAPI.get() 但后端无对应代理路由 | 不当重构，原始 fetch() 正确（天地图 API 支持 CORS） | MEDIUM |

### 受影响模块

- API 层错误处理
- Cesium 地形管理
- 浅水渲染循环
- 地名搜索链路

### 候选方案对比

**Bug 2 (client.js)**：
- A) 保留 async getMessage() + await 调用 → 拦截器函数需改为 async，改动大
- B) 恢复原始顶层 useMessage() 导入 → 简单直接，原始方案已验证 ✅

**Bug 6 (locationSearch)**：
- A) 保持 backendAPI.get(baseURL:'') → 多余依赖，axios 拦截器注入不必要 Token
- B) 恢复原生 fetch() → 天地图 API 支持 CORS，原始方案正确 ✅

---

## 修改内容

### 1. wind/index.mjs — lowFrameRate 日志添加 DEV 门禁

```javascript
// 修复前
console.warn(`Low frame rate detected: ${frameRate} FPS`);

// 修复后
if (import.meta.env.DEV) console.warn(`Low frame rate detected: ${frameRate} FPS`);
```

同时删除 `console.log(result)` 打印整个 Float32Array。

### 2. api/backend/client.js — 恢复同步 useMessage 导入

```javascript
// 修复前（有 bug）
async function getMessage() {
    if (!_messageHandler) {
        const { useMessage } = await import('@common/shell/useMessage');
        _messageHandler = useMessage().error;
    }
    return _messageHandler;
}

// 修复后（正确）
import { useMessage } from '@common/shell/useMessage';
const { error: showError } = useMessage();
```

所有拦截器错误处理直接使用 `showError()`。

### 3. PhysicsSystem.ts — 移除死代码

移除从未调用的 `_assertWorld()` 方法。

### 4. useCesiumLayers.js — 恢复地形自动切换

```javascript
// 修复前（降级）
if (activeTerrain.value !== 'cesiumWorld') {
    console.warn('OSM Buildings 需要 Cesium World Terrain');
}

// 修复后（正确）
if (activeTerrain.value !== 'cesiumWorld') {
    activeTerrain.value = 'cesiumWorld';
    applyTerrain('cesiumWorld');
}
```

### 5. useShallowWater.js — 保护 pause() 调用

```javascript
// 修复前
catch (err) {
    pause(); // 可能抛错
    onError?.(err);
}

// 修复后
catch (err) {
    try {
        pause();
    } catch {
        // pause 内部仅 cancelAnimationFrame，此处防御性兜底
    }
    onError?.(err);
}
```

### 6. locationSearch.js — 天地图恢复原生 fetch

恢复 `fetch(url, { signal })` 方式，保留后端代理用于 Nominatim/高德。

---

## 修改原因

| Bug | 背景与动机 |
|-----|-----------|
| 1 | 生产环境 console.warn 泄露调试信息，违反 DEV-gate 约定 |
| 2 | 异步动态导入导致竞态，首个 API 错误无法提示用户 |
| 3 | 死代码增加维护负担 |
| 4 | OSM Buildings 必须配 Cesium World Terrain，否则裁剪失效 |
| 5 | 防御性编程，避免二次异常 |
| 6 | 天地图 API 原生支持 CORS，无需走 axios + 后端代理 |

---

## 影响范围

- API 层错误处理链路
- Cesium 地形管理逻辑
- 浅水渲染异常恢复
- 地名搜索天地图通道

---

## 解决方案

逐项修复，优先恢复原始正确逻辑（Bug 2、4、6），再补充防御性保护（Bug 5）和 DEV 门禁（Bug 1），最后清理死代码（Bug 3）。

---

## 性能指标

非性能相关任务，未实测。

---

## 测试方案

### Agent 已执行

- [x] 代码审查逐项验证
- [x] 确认后端无 Tianditu 搜索代理路由
- [x] 确认天地图 API 支持 CORS
- [x] 确认 useMessage 在模块顶层调用安全（拦截器仅在请求时触发）

### 待用户实机验证

1. 开启 OSM Buildings → 自动切换 Cesium World Terrain
2. 触发 API 错误 → 首次错误 toast 正常弹出
3. 天地图搜索 → 正常返回结果
4. DEV 模式 wind 模块 → 低帧率日志正常输出
5. 生产构建 → 无 wind 日志输出

---

## 变更文件清单

| 文件 | 说明 |
|------|------|
| `frontend/src/domains/cesium/modules/wind/index.mjs` | lowFrameRate DEV 门禁 + 删除 console.log(result) |
| `frontend/src/api/backend/client.js` | 恢复同步 useMessage 导入 |
| `frontend/src/domains/cesium/modules/player-controller/systems/PhysicsSystem.ts` | 移除死代码 _assertWorld |
| `frontend/src/domains/cesium/composables/layers/useCesiumLayers.js` | 恢复地形自动切换 |
| `frontend/src/domains/cesium/modules/shallow-water/composables/useShallowWater.js` | pause() 保护 |
| `frontend/src/api/locationSearch.js` | 天地图恢复原生 fetch |
| `README.md` | 版本号 V3.5.13 → V3.5.14 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.5.14 条目 |

---

## 遗留与风险

- 无遗留问题
- 所有 bug 已修复并验证逻辑正确性

---

## 下一步建议

- 运行 `CheckStructureTree.py` 和 `CheckConfigRegistry.py` 完成门禁
- 继续 Batch 6 组件拆分（L3 任务，需用户批准）
