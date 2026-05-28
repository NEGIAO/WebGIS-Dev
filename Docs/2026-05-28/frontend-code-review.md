# WebGIS 前端代码质量审查报告

**日期**: 2026-05-28 09:48  
**审查范围**: `WebGIS_Dev/frontend/src/` 全量前端代码  
**审查人**: Claude (AI Code Review)

---

## 📊 总体评估

| 维度 | 评级 | 说明 |
|------|------|------|
| 项目结构 | ⭐⭐⭐⭐ | 模块划分清晰，composables/stores/utils 分层合理 |
| TypeScript 使用 | ⭐⭐⭐ | 混合使用 JS/TS，部分文件缺乏类型定义 |
| 代码规范 | ⭐⭐⭐ | ESLint 未实际安装，规范形同虚设 |
| 错误处理 | ⭐⭐⭐ | 部分模块有完善的错误处理，部分缺失 |
| 安全性 | ⭐⭐⭐ | 认证和加密有基础实现，但存在隐患 |
| 性能优化 | ⭐⭐⭐⭐ | 有懒加载和缓存机制，大组件需拆分 |

---

## 🔴 严重问题 (Critical)

### 1. ESLint/Prettier 未实际安装
**文件**: `package.json`, `eslint.config.js`

`eslint.config.js` 引用了 `@eslint/js`、`eslint-config-prettier`、`eslint-plugin-vue`，但这些包**均未列入 `devDependencies`**，也未安装。ESLint 配置完全无效。

**修复方案**:
```bash
npm install -D eslint @eslint/js eslint-plugin-vue eslint-config-prettier
```
并在 `package.json` 中添加脚本：
```json
"lint": "eslint src/ --fix",
"format": "prettier --write src/"
```

### 2. useLayerStore 过于庞大（God Store）
**文件**: `src/stores/useLayerStore.ts` (~1172 行)

该 Store 承担了过多职责：图层树构建、拖拽状态、属性表状态、卷帘配置（含 localStorage 持久化）、导出格式规范化等。

**建议拆分为**:
- `useLayerStore` — 核心图层 CRUD
- `useLayerTreeStore` — 树构建、文件夹展开状态
- `useAttributeTableStore` — 属性表可见性、要素选择/高亮
- `useSwipeConfigStore` — 卷帘配置与持久化

### 3. useCompassStore 包含大量死代码
**文件**: `src/stores/useCompassStore.ts` (~676 行)

约 200 行被注释掉的死代码，严重影响可读性和维护性。

**修复**: 删除所有注释掉的代码，依赖 Git 历史追溯。

---

## 🟡 中等问题 (Warning)

### 4. 全量 lodash 仅用一个函数
**文件**: `src/composables/useMapState.js`

`lodash` (~70KB minified) 仅用于 `debounce` 一个函数。

**修复方案**:
```bash
npm uninstall lodash && npm install lodash-es
```
或使用原生实现：
```js
function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
```

### 5. JS/TS 混合使用不一致
**问题文件**:
- `src/composables/useMapState.js` — JS
- `src/composables/useGisLoader.ts` — TS
- `src/composables/useKmzLoader.js` — JS
- `src/utils/auth.js` — JS
- `src/utils/labelValidator.ts` — TS

同一层文件混用 JS/TS，降低类型安全性。

**建议**: 逐步将 `.js` 文件迁移为 `.ts`，优先处理核心模块（stores、composables）。

### 6. constants 目录下混入了 Hook
**文件**: `src/constants/useBasemapManager.ts`

文件名以 `use` 开头，本质上是一个 composable，不应放在 `constants/` 目录。

**修复**: 移动到 `src/composables/useBasemapManager.ts`。

### 7. Store 中 TypeScript `any` 滥用
**涉及文件**: 多个 Store 文件

部分 Store 中存在 `any` 类型标注，丧失了 TypeScript 的类型安全优势。

**建议**: 为所有 state 定义明确的 interface/type。

---

## 🟢 建议改进 (Suggestions)

### 8. 组件通信模式
项目中存在多种组件通信模式（Pinia Store、Props/Events、Event Bus），建议统一以 **Pinia Store** 为主要通信手段，减少 Props 层级传递。

### 9. 错误处理统一化
建议创建全局错误处理 composable：
```ts
// src/composables/useErrorHandler.ts
export function useErrorHandler() {
  const toast = useToast();
  
  function handleApiError(error: unknown) {
    const message = error instanceof Error ? error.message : '未知错误';
    toast.error(message);
    console.error('[API Error]', error);
  }
  
  return { handleApiError };
}
```

### 10. API 层统一拦截器
建议在 `src/api/index.js` 中统一配置：
- 请求拦截器：自动附加 Authorization header
- 响应拦截器：统一处理 401/403/500 错误
- 请求取消：组件卸载时自动取消未完成的请求

### 11. 安全性改进
- `src/utils/urlCrypto.js` — 检查加密算法强度，避免使用弱算法
- `src/utils/auth.js` — Token 存储建议使用 `httpOnly` cookie 而非 localStorage
- API 请求中注意 XSS 防护，对用户输入进行转义

### 12. 性能优化建议
- 大型 GeoJSON 数据考虑使用 Web Worker 处理
- 地图图层切换时复用已加载的资源（LRU 缓存）
- 组件懒加载优先级排序：首屏组件 > 交互组件 > 辅助组件

### 13. 代码注释与文档
- Composables 缺少 JSDoc 注释（功能说明、参数、返回值）
- 建议为核心 utils 函数添加使用示例

---

## 📁 审查覆盖的文件清单

| 目录 | 文件数 | 审查状态 |
|------|--------|----------|
| `src/stores/` | 10 | ✅ 全量审查 |
| `src/api/` | 8 | ✅ 全量审查 |
| `src/services/` | 4 | ✅ 全量审查 |
| `src/composables/` | 15+ | ✅ 关键文件审查 |
| `src/utils/` | 20+ | ✅ 关键文件审查 |
| `src/constants/` | 5 | ✅ 全量审查 |
| `src/components/` | 30+ | ✅ 关键组件审查 |
| `src/views/` | 2 | ✅ 全量审查 |
| 配置文件 | 6 | ✅ 全量审查 |

---

## 🎯 修复执行状态

| # | 优先级 | 修复项 | 状态 | 说明 |
|---|--------|--------|------|------|
| 1 | 🔴 | 安装 ESLint 及相关依赖 | ✅ 已完成 | `package.json` 新增 eslint/js/vue/prettier 依赖 + lint/format 脚本 |
| 2 | 🔴 | 拆分 useLayerStore | ✅ 已完成 | 卷帘 → `useSwipeConfigStore.ts`；属性表 → `useAttributeTableStore.ts` |
| 3 | 🔴 | 清理 useCompassStore 死代码 | ✅ 已完成 | 删除 ~233 行注释代码 |
| 4 | 🟡 | 替换 lodash 为 lodash-es | ✅ 已完成 | `package.json` + `useMapState.js` import 已更新 |
| 5 | 🟡 | 移动 useBasemapManager | ✅ 已完成 | 已移动至 `composables/useBasemapManager.ts`，`constants/index.js` 已更新 re-export |
| 6 | 🟡 | 统一 TS/JS 选型 | ⏳ 待后续迭代 | 建议逐步将 .js 迁移为 .ts |
| 7 | 🟢 | 创建统一错误处理 composable | ✅ 已完成 | 新增 `src/composables/useErrorHandler.ts` |
| 8 | 🟢 | 补充 API 拦截器 | ✅ 已完成 | `backend.js` 已有完善的请求/响应拦截器，无需额外改动 |
| 9 | 🟢 | 补充 JSDoc 注释 | ⏳ 待后续迭代 | 建议逐步添加 |

### 新增文件
- `src/composables/useErrorHandler.ts` — 统一错误处理
- `src/composables/useBasemapManager.ts` — 从 constants/ 移入
- `src/stores/useSwipeConfigStore.ts` — 卷帘配置 Store（从 useLayerStore 拆分）
- `src/stores/useAttributeTableStore.ts` — 属性表管理 Store（从 useLayerStore 拆分）

### 修改文件
- `package.json` — 依赖更新（ESLint, lodash-es）
- `src/constants/index.js` — re-export 路径更新指向 composables/
- `src/composables/useMapState.js` — lodash import 更新
- `src/stores/useCompassStore.ts` — 删除死代码
- `src/stores/useLayerStore.ts` — 卷帘逻辑代理到 useSwipeConfigStore

### 删除文件
- `src/constants/useBasemapManager.ts` — 已移动至 composables/

---

*"审查不是为了批评，而是为了让代码变得更好。"*
