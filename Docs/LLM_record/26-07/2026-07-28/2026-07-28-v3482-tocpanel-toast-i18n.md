# V3.4.82 — TOCPanel 坐标 / 地理编码 / 共享资源 toast i18n

> 日期：2026-07-28 20:40  
> 任务等级：L2  
> 版本号：V3.4.82  
> 顺延说明：接 V3.4.81 遗留「TOCPanel 共享资源 / 坐标复制 / 地理编码 toast i18n」

---

## 问题分析

### 核心症状
- 英文界面下工具箱（TOCPanel）仍弹出中文 toast：复制坐标、AOI 弹窗、p 参数解码、地理编码、超大文件、共享资源扫描/加载

### 根本原因
- 模板区 `layer.*` 已大量 `t()`，脚本内 `message.*` / 表单错误文案仍为字面量
- full pack 已有 `layer.copyPoiIdFailed` 等，但坐标/共享/地理编码路径未接线

### 受影响模块
- `TOCPanel.vue`（运行时 toast / 表单 error）
- `locales/zh-CN.js` / `en-US.js` 的 `layer.*`

---

## 修改内容

1. **`layer.*` 增补 toast 键**（zh/en 对齐）：坐标复制、弹窗拦截、AOI 粘贴、p 解码、地理编码、文件超限、共享资源
2. **TOCPanel 调用点**一律 `t('layer.xxx', {…})`；复制失败复用已有 `layer.copyPoiIdFailed`
3. **不改**逆地理/地理编码写入 feature `properties` 的中文键名（数据字段 SSOT，非 UI）

---

## 修改原因

V3.4.81 完成 Weather 后下一刀明确为 TOCPanel 高频操作 toast；用户在英文 UI 下导入/定位仍见中文提示。

---

## 影响范围

- 前端工具箱脚本 toast / 部分 inline error
- 无配置 key / 无结构树文件增删；无 Git 写操作

---

## 解决方案

| 方案 | 说明 | 选择 |
|---|---|---|
| A. 仅改 message 包装层按中文映射 | 脆弱 | 否 |
| B. full pack `layer.*` + TOCPanel t() | 与现有 layer 命名空间一致 | ✓ |
| C. 顺手 i18n feature properties 键 | 破坏已存属性表/导出 | 否 |

---

## 性能指标

未实测（字符串替换）

---

## 测试方案

### Agent 已执行
- [x] TOCPanel 运行时 CJK：仅注释 + properties 键残留
- [x] zh/en full 叶节点对齐
- [x] `CheckStructureTree.py` / `CheckConfigRegistry.py`

### 待用户实机
- [ ] 英文下：复制无坐标图层 → No copyable coordinates…
- [ ] 英文下：扫描空共享目录 → Shared resources empty 文案
- [ ] 英文下：地理编码空地址 / 成功 toast 为英文
- [ ] 中文路径文案无回归

---

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/locales/zh-CN.js` | `layer.*` toast 键 |
| `frontend/src/locales/en-US.js` | 同上 en |
| `frontend/src/components/Layer/TOCPanel.vue` | message / error t() |
| 本日志 + CHANGELOG + README | V3.4.82 |

---

## 遗留与风险

- feature `properties` 中文键（逆地理编码地址 / 来源…）保持原样
- `coordinateInputHandler` / `usePositionCodeTool` 校验错误仍中文（经纬度空值/范围、p=0）— 用户点「绘制」时仍可能见中文，记入下一步
- Admin / Chat 硬编码不在本批
- 未跑浏览器实机

---

## 下一步建议

- `coordinateInputHandler` + `usePositionCodeTool` 错误文案键化
- Admin / Chat message 扫尾
- 或 MapDownloader 调用点扫尾
