# 2026-06-28 编辑参数功能修复

**日期和时间**：2026-06-28（WebGIS 3.0.x）

---

## 修改内容

- 修复 `ApiKeysManagementPanel.vue` 中"编辑参数"按钮点击无反应的问题

## 修改原因

`useAgentConfig()` composable 仅导出了 `agentConfig`、`agentConfigDraft`、`loading`、`submitting` 四个 ref 及 `load`/`save`/`resetQuota`/`hydrate` 四个方法，未提供编辑模式的切换能力。

模板中引用了 `editingAgentConfig` 和 `startEditAgentConfig`，两者均为 `undefined`，导致：
- `v-if="!editingAgentConfig"` 永远为 `true`（`!undefined === true`），编辑表单区域始终隐藏
- `@click="startEditAgentConfig"` 点击后执行 `undefined()`，静默失败

## 影响范围

- `frontend/src/composables/useAgentConfig.js` — composable 公共模块
- `frontend/src/components/UserCenter/ApiKeysManagementPanel.vue` — 用户中心 API 密钥管理面板

## 问题逻辑链条

```
点击"编辑参数"
  → @click="startEditAgentConfig"
    → startEditAgentConfig 未定义（undefined）
      → 静默失败，无任何 UI 变化
```

**根本原因**：composable 设计时只关注了数据的加载/保存，遗漏了编辑模式状态的管理职责。

## 优化解决方案

### useAgentConfig.js

新增 3 个成员：

| 名称 | 类型 | 说明 |
|------|------|------|
| `editingConfig` | `ref(false)` | 编辑模式开关 |
| `startEdit()` | Function | hydrate 草稿 + 切换 editingConfig 为 true |
| `cancelEdit()` | Function | 将 editingConfig 重置为 false |

### ApiKeysManagementPanel.vue

更新解构，增加 3 个别名映射：

```js
const {
    editingConfig: editingAgentConfig,
    startEdit: startEditAgentConfig,
    cancelEdit: cancelEditAgentConfig,
    // ...原有成员保持不变
} = useAgentConfig();
```

`saveAgentConfigWrapper` 保存成功后：
1. 自动调用 `cancelEditAgentConfig()` 退出编辑模式
2. 调用 `hydrateWithQuotaSync()` 同步额度显示

## 测试方案

1. 进入用户中心 → API 密钥管理
2. 点击"编辑参数"按钮 → 验证编辑表单正确显示
3. 修改任意字段（如 Base URL）→ 点击"保存参数" → 验证保存成功并自动退出编辑模式
4. 点击"取消"按钮 → 验证退出编辑模式，恢复只读视图
5. 点击"刷新"按钮 → 验证配置数据正确加载

## 修改的文件路径

- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\useAgentConfig.js`
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\components\UserCenter\ApiKeysManagementPanel.vue`
