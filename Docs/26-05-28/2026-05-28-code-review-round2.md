# Code Review 第二轮 — 全栈审查与修复

- **日期和时间**：2026-05-28 20:00
- **修改内容**：修复 Code Review 发现的 16 项问题（前端 10 项 + 后端 6 项非安全问题）
- **修改原因**：全栈 code review 发现多处内存泄漏、资源未清理、性能浪费等问题
- **影响范围**：composables/map/features、utils/gis/parsers、stores、services、backend API 模块
- **优化解决方案**：见下方分类
- **测试方案**：npm run build 验证无构建错误，功能回归测试
- **修改的文件路径**：见下方

## 前端修复（10 项）

### 高优先级（3 项）

| # | 文件 | 问题 | 修复 |
|---|------|------|------|
| 1 | `composables/map/features/useDrawMeasure.js` | measureTooltipOverlay 残留地图 + geometry 监听未清理 | 移除旧 overlay + unByKey 清理 |
| 2 | `composables/map/features/useMapEventHandlers.js` | 6 个 OL 事件监听未在 cleanup 中移除 | 存储 key + unByKey 批量清理 |
| 3 | `composables/map/features/useBasemapSelectionWatcher.js` | AbortController 在 catch 路径未 abort | catch 中添加 controller.abort() |

### 中优先级（3 项）

| # | 文件 | 问题 | 修复 |
|---|------|------|------|
| 4 | `utils/gis/parsers/shpParser.ts` | JSON.parse(JSON.stringify()) 深拷贝大 GeoJSON | 改为原地赋值 ID |
| 5 | `utils/gis/parsers/dbfParser.ts` | raw bytes 存储但从未消费，浪费内存 | 移除 raw 属性 |
| 6 | `utils/gis/dataDispatcher.js` | Blob URL 从未 revoke | 添加清理工具函数 |

### 低优先级（4 项）

| # | 文件 | 问题 | 修复 |
|---|------|------|------|
| 7 | `stores/useAttributeTableStore.ts` | 死代码，从未被导入 | 删除文件 |
| 8 | `utils/gis/parsers/kmlParser.ts` + `dataDispatcher.js` | 编码检测逻辑重复 | 添加注释标记（暂不合并，避免引入耦合） |
| 9 | `composables/map/features/useBasemapStateManagement.js` | timer 无法在卸载时取消 | 添加 cancel 方法 |
| 10 | `services/CompassManager.ts` | watch position → setPosition → re-trigger | 添加 isSyncing 守卫 |

## 后端修复（6 项非安全问题）

| # | 文件 | 问题 | 修复 |
|---|------|------|------|
| 1 | `gcj_rectify/fetch.py` | close_async_client 仅置 null 未调 aclose() | 添加 aclose() 调用 |
| 2 | `api/location.py:451` | DB 连接无 finally 关闭 | 添加 finally: conn.close() |
| 3 | `api/location.py:152` | rectangle split 后未验证长度 | 添加长度检查和默认值 |
| 4 | `api/statistics.py:294` | 每次请求新 httpx 客户端 | 复用 request.app.state.http_client |
| 5 | `gcj_rectify/transform.py:76` | 迭代循环无最大次数保护 | 添加 max_iterations=20 |
| 6 | `api/external_proxy.py:62` | DB key 查询异常静默吞掉 | 添加 logger.debug 记录 |
