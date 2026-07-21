# 2026-06-11 修复头像选择与保存功能

## 日期和时间
2026-06-11 16:00

## 修改内容
修复用户偏好设置页面中头像无法选中并保存的 Bug。

## 修改原因
用户在偏好设置 Tab 点击头像后，"保存头像" 按钮始终不出现，导致头像无法更换。

## 影响范围
- 前端：`FloatingAccountPanel.vue` — 头像选择事件绑定
- 后端：无改动（后端 `/api/auth/change-avatar` 接口正常）

## 问题分析（事件逻辑链条）

### 核心症状
用户点击头像 → 选中态不显示 → "保存头像" 按钮不出现 → 无法保存。

### 根本原因
**Vue 3 模板中 ref 自动解包**：

```js
// FloatingAccountPanel.vue 第 801 行（修复前）
@update:selected-avatar-index="(idx) => { selectedAvatarIndex.value = idx }"
```

在 Vue 3 `<template>` 中，`ref` 会被自动解包，`selectedAvatarIndex` 直接就是原始数值（`number`），而非 ref 对象。写 `selectedAvatarIndex.value = idx` 等价于给一个 `number` 赋 `.value` 属性 —— **静默失败**，ref 的 `.value` 从未改变。

因此：
1. `selectedAvatarIndex` 始终等于初始值（`userAvatarIndex`）
2. 模板中的条件 `selectedAvatarIndex !== (user?.avatar_index || 0)` 始终为 `false`
3. "保存头像" 按钮的 `v-if` 永远不满足

### 受影响模块
- `PreferencesTab.vue`：头像网格点击（正常 emit，无问题）
- `FloatingAccountPanel.vue`：事件接收与 ref 更新（**此处出错**）
- 后端 `change-avatar` API：未被调用（因前端永远无法触发保存）

## 优化解决方案

将 `.value` 去掉，直接赋值：

```js
// 修复后
@update:selected-avatar-index="(idx) => { selectedAvatarIndex = idx }"
```

Vue 3 `<script setup>` 中的 `ref` 在模板里自动解包，无需手动 `.value`。

## 测试方案
1. 登录后打开账号中心 → 偏好设置 Tab
2. 点击一个不同于当前头像的头像 → 应出现选中态 + "保存头像" 按钮
3. 点击 "保存头像" → 应提示"头像已更新"
4. 刷新页面确认头像持久化

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\UserCenter\FloatingAccountPanel.vue`（第 801 行）
