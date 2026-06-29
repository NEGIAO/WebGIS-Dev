# 2026-06-29 下载底图按钮跳转工具箱Tab修复

## 日期和时间
2026-06-29 14:30

## 修改内容
修复左侧控制面板"下载底图"按钮点击后无法正确跳转到工具箱面板"下载"Tab的问题。

## 修改原因
用户点击"下载底图"按钮后，虽然 ControlsPanel 正确发出了 `open-toolbox-tab` 事件，但由于 HomeView.vue 中 `<SidePanel>` 组件缺少 `:toolbox-tab` 属性绑定，导致 toolboxTab 状态无法传递到 TOCPanel，下载 Tab 无法激活。

## 影响范围
- 侧边面板导航系统（SidePanel → TOCPanel Tab 切换）
- 下载底图功能入口

## 问题分析（事件逻辑链路）

### 核心症状
点击"下载底图"按钮后，右侧工具箱面板停留在默认"图层"Tab，未跳转到"下载"Tab。

### 根本原因
HomeView.vue 模板中 `<SidePanel>` 组件**遗漏了** `:toolbox-tab="toolboxTab"` 属性绑定。

### 完整事件链路
```
ControlsPanel
  ├── emit('open-tab', 'toolbox')           → HomeView.handleControlsOpenTab('toolbox') ✅
  └── emit('open-toolbox-tab', 'download')  → HomeView.handleControlsOpenToolboxTab('download') ✅
                                                  ├── toolboxTab.value = 'download' ✅
                                                  └── SidePanel.toolboxTab (未传递) ❌ ← 断链点
                                                        └── TOCPanel.defaultTab (永远是 'layers')
```

### 修复方案
在 HomeView.vue 的 `<SidePanel>` 组件绑定中添加 `:toolbox-tab="toolboxTab"` 属性。

## 测试方案
1. 点击左侧"下载底图"按钮
2. 预期：右侧工具箱面板自动展开，Tab 切换到"下载"
3. 再次点击：Tab 应重新激活下载（toggle-reset 机制）

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\views\HomeView.vue` — 添加 `:toolbox-tab="toolboxTab"` 属性绑定
