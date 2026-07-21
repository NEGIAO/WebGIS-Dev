# 2026-06-21 高亮 Pinia 化后置修复（TS 类型 + 破坏性重命名 + dl 合并）

**日期时间**：2026-06-21 22:10
**类型**：🐛 Bug 修复 + ♻️ 重构（Code Review 补遗）
**影响版本**：V3.3.8
**对应提交**：暂存区 + 非暂存区合并后提交

---

## 📋 事件逻辑链条分析

### 核心症状
1. **TypeScript 编译报错**：`useFeatureStyleStore.ts` 出现 7 个 TS 报错
   - `Property 'feature' does not exist on type '{ layerId: string; featureId: string; }'`
   - `Property 'restoreStyle' / 'lookupFeature' / 'applyHighlight' does not exist on type '{}'`
2. **破坏性重命名**：`useMapUIEventHandlers.js` 把入参 `zoomToManagedFeature` 重命名为 `_zoomToManagedFeature`，调用方传 `zoomToManagedFeature` 静默失效，无任何报错
3. **属性解析 bug**：`useLayerMetadataNormalization.js` dl 解析合并顺序反了，解析值被原始 attributes 覆盖

### 根本原因
- **`useFeatureStyleStore.ts`**：Pinia 化重构时 `targets` 数组元素类型与 `syncLayerHighlights` 的 `callbacks` 默认值未补齐，导致 IDE TS 严格模式下报错（虽然 `tsconfig.json` 设了 `noImplicitAny: false`，但 VSCode 仍按 TS 严格模式检查）
- **`useMapUIEventHandlers.js`**：原作者意图是「`focusFeature` 时不缩放」，直接删除 `zoomToManagedFeature` 调用并把入参改名 `_` 前缀，违反了 CLAUDE.md 的「禁止自作主张进行破坏性改动」原则
- **`useLayerMetadataNormalization.js`**：合并顺序笔误 `{ ...dlParsed, ...next }` 应为 `{ ...next, ...dlParsed }`，原 attributes 覆盖了解析出的字段
- **`useManagedFeatureHighlight.js`**：`clearManagedFeatureHighlight` 函数内直接操作 `store.highlightedFeatures.delete` 等内部 state，破坏 Pinia store 封装性
- **代码重复**：`feature.getId() ?? feature.get('_gid') ?? feature.get('id')` 回退逻辑在 4 个文件中重复实现

### 影响的模块
- `frontend/src/stores/useFeatureStyleStore.ts`（TS 类型补齐）
- `frontend/src/composables/map/features/useMapUIEventHandlers.js`（参数名回滚）
- `frontend/src/composables/map/features/useLayerMetadataNormalization.js`（合并顺序修正）
- `frontend/src/composables/map/features/useManagedFeatureHighlight.js`（封装性回填）
- `frontend/src/composables/map/features/useMapEventHandlers.js`（使用新工具函数）
- `frontend/src/composables/map/features/useCreateManagedVectorLayer.js`（使用新工具函数）
- `frontend/src/composables/useUserLayerActions.js`（使用新工具函数）
- `frontend/src/utils/map/featureKey.js`（新增 `getFeatureIdFromFeature`）

---

## 🔧 优化解决方案

### 1. `useFeatureStyleStore.ts` TS 类型补齐

**改动 1**：`highlightFeature` 内 `targets` 数组元素补充 `feature: any` 字段类型注解：
```ts
// 修改前
const targets = [{ layerId: targetLayerId, featureId: targetFeatureId, feature }];

// 修改后
const targets: Array<{ layerId: string; featureId: string; feature: any }> = [
    { layerId: targetLayerId, featureId: targetFeatureId, feature },
];
```

**改动 2**：`syncLayerHighlights` 的 `callbacks` 默认值类型显式声明：
```ts
// 修改前
function syncLayerHighlights(layerId, currentFeatureIds, callbacks = {}) { ... cb.restoreStyle ... }

// 修改后
function syncLayerHighlights(layerId, currentFeatureIds, callbacks) {
    const cb = callbacks || {};
    // ... cb.restoreStyle / cb.lookupFeature / cb.applyHighlight
}
```

**改动 3**：删除 `_addSingle` 内无意义 `void featureKey.slice(layerId.length + 2)` 死代码。

**改动 4**：使用 `getFeatureIdFromFeatureKey` 工具函数替代 `key.slice(targetLayerId.length + 2)` 硬编码 `::` 长度。

### 2. `useMapUIEventHandlers.js` 参数名回滚

```js
// 修改前（破坏性改动）
} = createMapUIEventHandlers({
    ...,
    _zoomToManagedFeature, // ❌ 调用方传 zoomToManagedFeature 静默失效
    ...
});

// 修改后（保持原契约）
} = createMapUIEventHandlers({
    ...,
    zoomToManagedFeature, // ✅ 保留契约
    ...
});
// 函数内 `void zoomToManagedFeature` 保留参数引用避免 lint 报错
```

### 3. `useLayerMetadataNormalization.js` dl 合并顺序修正

```js
// 修改前（解析值被覆盖）
next = { ...dlParsed, ...next };

// 修改后（原 attributes 兜底，解析值优先）
next = { ...next, ...dlParsed };
```

### 4. `useManagedFeatureHighlight.js` 封装性回填

```js
// 修改前（直接操作 store state）
const current = store.highlightedFeatures.get(key);
if (current) {
    store.highlightedFeatures.delete(key); // ❌ 破坏封装
    store.originalStylesByFeature.delete(key);
    store.lastSelectedFeatureKey = store.lastSelectedFeatureKey === key ? '' : store.lastSelectedFeatureKey;
}

// 修改后（委托给 store action）
store.clearHighlight(layerId, featureId, restoreFeatureStyle); // ✅
```

### 5. `featureKey.js` 新增 `getFeatureIdFromFeature` 工具函数

```js
export function getFeatureIdFromFeature(feature) {
    if (!feature || typeof feature !== 'object') return '';
    const directId = typeof feature.getId === 'function' ? feature.getId() : null;
    if (directId !== null && directId !== undefined && directId !== '') {
        return String(directId);
    }
    const gid = typeof feature.get === 'function' ? feature.get('_gid') : null;
    if (gid !== null && gid !== undefined && gid !== '') {
        return String(gid);
    }
    const idProp = typeof feature.get === 'function' ? feature.get('id') : null;
    return idProp !== null && idProp !== undefined && idProp !== ''
        ? String(idProp)
        : '';
}
```

消除以下 4 处重复实现：
- `useCreateManagedVectorLayer.js:122-124`
- `useUserLayerActions.js:164-166`
- `useMapEventHandlers.js:202-204`
- `useManagedFeatureHighlight.js:99-107`

---

## 📊 性能影响

| 维度 | 数值 |
|------|------|
| 新增工具函数开销 | 0（仅类型判断 + String()） |
| 删除死代码 `_addSingle` | -1 行 |
| 硬编码 `::` 长度消除 | 性能等价，代码可维护性提升 |
| TS 类型补齐 | 无运行时影响，仅编译期 |

---

## 🧪 测试方案

### 1. TS 编译验证
```bash
cd frontend
# 期望：0 个 TS 报错（vs 修改前的 7 个）
npx vue-tsc --noEmit
```

### 2. 行为验证
| 场景 | 预期结果 |
|------|---------|
| 单击要素 | 高亮 + 属性表显示 |
| Ctrl+单击已高亮要素 | 取消高亮 |
| Ctrl+单击未高亮要素 | 追加高亮（toggle） |
| Shift+单击要素 | 区间选择（range） |
| TOC 移除图层 | 自动清理该图层所有高亮 |
| LayerStore.syncLayers | 自动清理已移除图层的高亮 |

### 3. 回归测试
- 属性表 description 字段 HTML 解析（dl/table 嵌套）→ 期望解析为多行字段而非乱码
- KML 文件导入后高亮样式不丢失 → 期望备份样式生效
- 连续多选（10+ feature）→ 期望样式不互相覆盖

---

## 📁 修改的文件路径

| 类型 | 文件路径 |
|------|---------|
| 🐛 修改 | `frontend/src/stores/useFeatureStyleStore.ts` |
| 🐛 修改 | `frontend/src/composables/map/features/useMapUIEventHandlers.js` |
| 🐛 修改 | `frontend/src/composables/map/features/useLayerMetadataNormalization.js` |
| ♻️ 修改 | `frontend/src/composables/map/features/useManagedFeatureHighlight.js` |
| ♻️ 修改 | `frontend/src/composables/map/features/useMapEventHandlers.js` |
| ♻️ 修改 | `frontend/src/composables/map/features/useCreateManagedVectorLayer.js` |
| ♻️ 修改 | `frontend/src/composables/useUserLayerActions.js` |
| 🆕 新增 | `frontend/src/utils/map/featureKey.js`（追加 `getFeatureIdFromFeature`） |
| 📝 修改 | `README.md` / `frontend/README.md` / `backend/README.md` |

---

## 📌 经验教训

1. **TS 类型注解不能偷懒**：哪怕 `noImplicitAny: false`，Pinia store 暴露的复杂泛型仍然需要显式声明，否则 IDE 检查会失败
2. **破坏性重命名必须显式标注**：CLAUDE.md 第 3 条「禁止自作主张」原则下，任何破坏调用方契约的改动需先与用户确认
3. **解构赋值合并顺序是易错点**：JS 中 `{ ...A, ...B }` 表示 B 覆盖 A，写反了语义就反了
4. **Pinia store 封装性**：外部代码应通过暴露的 action 操作 state，而不是直接 `store.xxx = yyy`
5. **代码重复是定时炸弹**：`getFeatureIdFromFeature` 在 4 处重复实现，统一后未来 OL Feature 的 ID 提取规则变更只需改一处