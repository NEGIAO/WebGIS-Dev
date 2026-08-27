# 修复：viewScale 常量导出缺失导致应用启动 SyntaxError

- **日期和时间**：2026-08-26 18:00
- **版本归属**：V3.5.33（2026-08-26，与「统一图层管理 P2 第二批」同日，归并同版本日志）

---

## 事件逻辑链条分析

### 核心症状

浏览器控制台在 `main.js:13`（vue-router `install` 阶段）抛出：

```
SyntaxError: The requested module '/src/domains/common/utils/viewScale/constants.js'
does not provide an export named 'MIN_CESIUM_HEIGHT'
    (at constants-and-precision.js:14:5)
```

应用在路由安装期即中断，白屏无法启动。

### 根本原因

- `viewScale/` 模块化重构中，`constants.js` 被定为双引擎尺度系统常量 **SSOT（单一真源）**，相机离地高度边界以新命名 `MIN_CAMERA_HEIGHT` / `MAX_CAMERA_HEIGHT` 定义，且未提供 OL 缩放级别边界。
- 兼容聚合入口 `constants-and-precision.js` 与旧兼容入口 `viewScaleConverter.js` 仍按历史 API 再导出 `MIN_CESIUM_HEIGHT` / `MAX_CESIUM_HEIGHT` / `MIN_OL_ZOOM` / `MAX_OL_ZOOM`。
- ES Module 为**静态静态解析**：`export { ... } from './constants.js'` 一次性校验所有具名导出，`constants.js` 中不存在 `MIN_CESIUM_HEIGHT` → 立即抛 SyntaxError，且**不产生部分导出**（整个模块作废），导致所有依赖链全部中断。

### 受影响模块

| 模块 | 影响 |
|------|------|
| `frontend/src/domains/common/utils/viewScale/constants.js` | 常量 SSOT，缺失 4 个兼容命名导出 |
| `frontend/src/domains/common/utils/viewScale/constants-and-precision.js` | 聚合入口 re-export 引用不存在的导出，加载即抛错 |
| `frontend/src/domains/common/utils/viewScaleConverter.js` | 旧兼容入口，同样 re-export 上述名字 |
| `frontend/src/domains/common/utils/viewScale/index.js` | 桶式导出（`export *`），下游受影响 |
| `main.js` / vue-router | 模块图加载失败，应用白屏 |

## 优化解决方案

遵循 **SSOT 归一** 原则——不改动聚合入口，而是在唯一真源 `constants.js` 中补齐 4 个兼容命名导出，与 `Docs/Architecture/ol-cesium-dual-engine.md` 常量表保持一致：

```js
/** 兼容别名：旧 viewScaleConverter 命名 */
export const MIN_CESIUM_HEIGHT = MIN_CAMERA_HEIGHT; // 1 米
export const MAX_CESIUM_HEIGHT = MAX_CAMERA_HEIGHT; // 50,000,000 米

/** OL 缩放级别边界 */
export const MIN_OL_ZOOM = 0;
export const MAX_OL_ZOOM = 22;
```

- 语义对齐：`MIN_CESIUM_HEIGHT / MAX_CESIUM_HEIGHT` 与相机高度边界同值（1 / 50,000,000 米）；`MIN_OL_ZOOM / MAX_OL_ZOOM` 为 0 / 22。
- 旧调用方（从 `viewScaleConverter.js` / `constants-and-precision.js` 导入）**零改动**，向后完全兼容。
- 新代码从 `@common/utils/viewScale`（桶入口）导入时也自动获得这些常量（`export *` 覆盖）。

## 性能指标

- 无运行时性能损耗：常量在模块初始化期一次性解析，ESM 缓存复用。
- 消除了启动期白屏（原为启动即中断的阻塞性错误）。

## 测试方案

1. **环境**：Node.js 直接以 ES Module 实际导入全部入口。
2. **步骤与结果**：
   ```bash
   node --input-type=module -e "import('./.../viewScale/constants-and-precision.js'); import('./.../viewScaleConverter.js'); import('./.../viewScale/index.js')"
   ```
   三个入口全部加载成功，导出名完整（含 `MIN_CESIUM_HEIGHT`、`MAX_CESIUM_HEIGHT`、`MIN_OL_ZOOM`、`MAX_OL_ZOOM`、`clampCesiumHeight`、`clampOlZoom` 等）。
3. **预期结果**：无 SyntaxError；`main.js` 路由安装正常；应用可正常渲染。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\domains\common\utils\viewScale\constants.js`（SSOT 补齐 4 个兼容导出）
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md`（V3.5.33 追加修复小节）
- `D:\Dev\GitHub\WebGIS-Dev\README.md`（V3.5.33 版本行概要追加修复说明）
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\frontend-structure.md`（`constants.js` 注释同步边界常量）

> 注：`viewScale/` 目录整体为未提交的新模块（git untracked），本次修复归入 V3.5.33（2026-08-26）日志；版本控制提交决策权归用户。