# V3.4.83 — 坐标输入 / p 参数校验错误 i18n

> 日期：2026-07-28 20:55  
> 任务等级：L2  
> 版本号：V3.4.83  
> 顺延说明：接 V3.4.82 遗留「coordinateInputHandler + usePositionCodeTool 错误文案键化」

---

## 问题分析

### 核心症状
- 英文 UI 下 TOC「坐标定位 / p 参数解析」校验失败仍弹出中文（空值、非数字、范围、标准化失败、p 为空/0、解码失败）

### 根本原因
- 校验逻辑在纯 utils/composable 中硬编码中文 `error` / `message`；V3.4.82 只修了 TOCPanel 自身字面量，未下沉到工具函数
- 工具层无 setup，但可与 Weather 一致 `import { translate as t }`

### 受影响模块
- `utils/coordinateInputHandler.js`
- `composables/map/usePositionCodeTool.js`
- `locales/zh-CN.js` / `en-US.js` 的 `layer.*`
- 调用方 TOCPanel（透传 `result.message` / `decodeResult.error`）无需再改

---

## 修改内容

1. **`layer.*` 增补校验键**：coord 空值/数字/经度纬度范围/标准化；p 参数必填（解码失败复用已有 `pDecodeFailed`）
2. **`coordinateInputHandler`**：`validateCoordinateInput` / `processCoordinateInput` 错误走 `t('layer.*')`
3. **`usePositionCodeTool`**：p 空/0 与解码失败走 `t()`；feature properties 中文键不改

---

## 修改原因

V3.4.82 交接明确下一步；用户点「绘制/解析」时 toast 仍可能中文，工具层键化一次覆盖所有调用方。

---

## 影响范围

- 坐标定位与 p 解码校验错误文案
- 无配置 key / 结构树文件增删；无 Git 写操作

---

## 解决方案

| 方案 | 说明 | 选择 |
|---|---|---|
| A. TOCPanel 映射中文 result.message | 脆弱、重复 | 否 |
| B. 工具层 translate + layer.* | 与 weatherUtils 一致 | ✓ |
| C. 返回 errorCode 由 UI t() | 调用方多、改签名 | 未选 |

---

## 性能指标

未实测（字符串替换）

---

## 测试方案

### Agent 已执行
- [x] 两工具文件无运行时 CJK 用户文案（properties 键除外）
- [x] zh/en full 叶节点 1227/1227 对齐
- [x] `node --check` 两 JS
- [x] CheckStructureTree 398=398 / CheckConfigRegistry 全绿

### 待用户实机
- [ ] 英文：坐标空/非法/超范围 → 英文校验 toast
- [ ] 英文：p 空或 0 / 乱码 → 英文错误
- [ ] 中文路径无回归

---

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/locales/zh-CN.js` | coord/p 校验键 |
| `frontend/src/locales/en-US.js` | 同上 en |
| `frontend/src/utils/coordinateInputHandler.js` | t() |
| `frontend/src/composables/map/usePositionCodeTool.js` | t() |
| 本日志 + CHANGELOG + README | V3.4.83 |

---

## 遗留与风险

- feature properties 中文键仍不翻译
- Admin / Chat / MapDownloader 硬编码不在本批
- 未跑浏览器实机

---

## 下一步建议

- Admin / Chat message 扫尾
- 或 MapDownloader 调用点扫尾
