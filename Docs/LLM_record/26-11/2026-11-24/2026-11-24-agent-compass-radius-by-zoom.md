# 2026-11-24 Agent 按视图缩放级别自动决定罗盘半径

- **日期与时间**：2026-11-24 15:45
- **任务等级**：L2（Agent 上下文与工具决策）
- **版本**：V3.7.13

## 问题

OL 的 `z` 是瓦片级别，Cesium 的 `z` / 相机高度是米。二者语义不同，但 `enable_compass` 不传 `radiusMeters` 时会沿用当前固定半径。小比例尺（全国/省域）下罗盘过小，用户几乎看不到，AI 应用罗盘后体验很差。

## 目标

把当前视图的缩放强度转换为 Agent 可直接使用的半径提示，并强制 AI 在启用罗盘时显式决定 `radiusMeters`，不再沿用默认小半径。

## 设计

### 新增上下文字段

`AgentMapContextV1.compassRadiusHintMeters`（100~100000 米）：

- OL 依据 `ol.zoom`；
- Cesium 依据 `cesium.cameraHeight`（URL `z` 在 3D 下即相机高度）；
- 运行时状态优先，URL 兜底，与既有 map context 原则一致。

### 映射（上限 100 km，受 enable_compass 工具约束）

| OL zoom | 建议半径 | Cesium cameraHeight | 建议半径 |
|---:|---:|---:|---:|
| <=5 | 100000 m | >=2,000,000 m | 100000 m |
| 6–7 | 80000 m | 500,000–2,000,000 m | 70000 m |
| 8–9 | 40000 m | 100,000–500,000 m | 30000 m |
| 10–11 | 15000 m | 20,000–100,000 m | 10000 m |
| 12–13 | 5000 m | 5,000–20,000 m | 3000 m |
| 14–15 | 1500 m | <5,000 m | 1000 m |
| >=16 | 500 m | — | — |

### Agent 规则

- `enable_compass` 必须显式传 `radiusMeters`；
- 优先使用 `map_context.compassRadiusHintMeters`；
- 字段缺失时按 z / cameraHeight 表估算；
- 不允许沿用默认值导致小比例尺罗盘不可见；
- 半径仍受工具上限 100 km 约束。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/chat/agent/mapContextSnapshot.ts` | 新增 compassRadiusHintMeters |
| `backend/api/agent_chat/schemas.py` | Pydantic 严格模型接纳新字段 |
| `backend/api/agent_chat/upstream.py` | 把提示写入 system prompt 摘要 |
| `frontend/src/domains/common/chat/constants/agentToolsSchema.ts` | 提示词与工具描述 |
| `backend/tests/test_agent_map_context.py` | 覆盖新字段解析与摘要 |
| `README.md` / `Docs/Guide/CHANGELOG.md` | 版本记录 |
| 本文件 | L2 维护日志 |

## 测试方案

### Agent 已执行

- 后端单测 `tests.test_agent_map_context` 12/12 通过；新增断言确认 `compassRadiusHintMeters=5000m` 进入 system prompt 摘要。
- `vue-tsc --noEmit` 0 报错；ESLint（2 个文件）0 warning。
- 结构树 749/749、配置登记、Vue 范式 72/72、领域隔离全绿；生产构建临时目录成功（4774 modules，15.83s）。
- 未执行真实 LLM 决策验证（需外部模型），提示词已强制优先使用 `compassRadiusHintMeters`。

### 待用户实机验证

1. 小比例尺（z≈5）问“分析某地风水”，罗盘半径应接近 100 km，肉眼可见。
2. 乡镇级（z≈13）启用罗盘，半径应约 5 km，不应过大。
3. Cesium 高相机高度与低相机高度分别启用罗盘，半径差异明显且可见。
