# 2026-06-09 路由注册日志添加北京时间 & 整点报时功能

## 日期和时间
2026-06-09 11:15 (北京时间)

## 修改内容
1. **新增时间工具模块** `backend/utils/time_utils.py`：封装北京时间获取函数和整点报时异步任务。
2. **路由注册日志增强**：所有 `app.py` 中的 `logger.info("已注册XXX路由")` 均追加 `[北京时间: YYYY-MM-DD HH:MM:SS]` 后缀，方便运维排查启动时间线。
3. **生命周期日志增强**：lifespan 的 startup/shutdown 阶段关键日志均附带北京时间。
4. **整点报时后台任务**：在 lifespan startup 阶段创建 `asyncio.Task`，精确计算到下一个整点的等待时间后输出报时日志；shutdown 阶段安全取消该任务。

## 修改原因
- 原有日志仅包含 Python `logging` 模块默认的本地时间戳，缺少明确的时区标识。服务部署在国内服务器（UTC+8），需要在日志中直接展示北京时间，减少跨时区换算的认知负担。
- 整点报时功能可用于：运维巡检确认服务存活、日志时间线对齐校验、以及作为后台心跳的辅助参考。

## 影响范围
- **后端启动流程**：lifespan 中新增后台任务创建与取消逻辑。
- **日志输出**：所有路由注册日志格式变更（追加北京时间后缀）。
- **新增文件**：`backend/utils/time_utils.py`、`backend/utils/__init__.py`。

## 优化解决方案

### 事件逻辑链条分析

**核心症状**：路由注册日志缺少时区信息，无法直观判断服务启动时间是否正确。

**根本原因**：Python `logging` 默认使用本地时间但不附带时区标识；模块级代码执行时无法使用 `datetime.now()` 的带时区版本。

**解决方案**：
1. 封装 `utils/time_utils.py`，提供 `get_beijing_now()` 和 `get_beijing_now_str()` 工具函数，统一使用 `timezone(timedelta(hours=8))`。
2. 路由注册阶段（模块级）使用一次性获取的 `_beijing_time` 变量，避免每条日志重复计算。
3. lifespan 运行时阶段（异步上下文）直接调用 `get_beijing_now_str()` 获取实时时间。
4. 整点报时使用 `asyncio.create_task` 创建后台协程，通过精确计算到下一整点的 `timedelta` 来 sleep，避免每分钟轮询的开销。

### 整点报时算法
```
now = get_beijing_now()
next_hour = (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
wait_seconds = (next_hour - now).total_seconds()
await asyncio.sleep(wait_seconds)
```

## 性能指标
- 整点报时任务使用精确 sleep 而非轮询，CPU 开销趋近于零（仅在整点唤醒一次）。
- 路由注册阶段的北京时间仅计算一次（`_beijing_time` 变量），无额外性能影响。

## 测试方案
1. 启动后端服务，观察控制台日志中所有路由注册信息是否包含 `[北京时间: ...]` 后缀。
2. 等待下一个整点，确认日志中出现 `[整点报时] 北京时间 XXXX-XX-XX XX:00:00 现在是 X 点整`。
3. 停止服务，确认日志中出现整点报时任务已停止的信息。

## 修改的文件路径
- `WebGIS_Dev/backend/utils/__init__.py` — 新建
- `WebGIS_Dev/backend/utils/time_utils.py` — 新建
- `WebGIS_Dev/backend/app.py` — 修改