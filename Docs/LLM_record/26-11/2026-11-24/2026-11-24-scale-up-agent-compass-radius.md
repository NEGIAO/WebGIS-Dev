# 2026-11-24 调大 Agent 罗盘半径默认档位

- **日期与时间**：2026-11-24 15:55
- **任务等级**：L2（Agent 参数调整）
- **版本**：V3.7.14

## 问题

V3.7.13 的半径映射上限只有 100 km，乡镇/区县比例尺下仍偏小；小比例尺（全国/省域）时视觉上几乎不可见。

## 调整

将 Agent 工具允许的最大半径由 100 km 提升到 2,000 km（仍在 CompassStore 20,000 km 上限内），并整体上移默认档位。

| OL zoom | 原半径 | 新半径 |
|---:|---:|---:|
| <=5 | 100 km | 2,000 km |
| 6–7 | 80 km | 1,000 km |
| 8–9 | 40 km | 400 km |
| 10–11 | 15 km | 150 km |
| 12–13 | 5 km | 50 km |
| 14–15 | 1.5 km | 10 km |
| >=16 | 500 m | 2 km |

| Cesium cameraHeight | 原半径 | 新半径 |
|---:|---:|---:|
| >=2,000,000 m | 100 km | 2,000 km |
| 500,000–2,000,000 m | 70 km | 800 km |
| 100,000–500,000 m | 30 km | 200 km |
| 20,000–100,000 m | 10 km | 50 km |
| 5,000–20,000 m | 3 km | 10 km |
| <5,000 m | 1 km | 2 km |

## 变更文件

- `frontend/src/domains/common/chat/agent/mapContextSnapshot.ts`
- `frontend/src/domains/common/chat/agent/agentCompassTool.ts`
- `frontend/src/domains/common/chat/constants/agentToolsSchema.ts`
- `backend/api/agent_chat/schemas.py`
- `README.md` / `Docs/Guide/CHANGELOG.md`
- 本文件

## 测试方案

### Agent 已执行

- 后端单测 `tests.test_agent_map_context` 12/12 通过。
- `vue-tsc --noEmit` 0 报错；ESLint（3 个文件）0 warning。
- 结构树 749/749、配置登记、Vue 范式 72/72、领域隔离全绿；生产构建临时目录成功（4774 modules，16.63s）。
- 未做真实 LLM 决策实测；新映射值已写入 context hint 与提示词。

### 待用户实机验证

1. z≈5 / Cesium 高相机高度：罗盘明显可见。
2. z≈13：半径约 50 km，不再过小。
3. z≈16：半径约 2 km，避免过大。
