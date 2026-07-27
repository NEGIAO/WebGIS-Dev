# 下一轮迭代规划：修 Bug 与优化（历史归档，2026-07-27 收口）

> 本文件原为 2026-07-26 会话末的临时下一轮计划。2026-07-27 收口时，B1–B6 与相关优化项已并入 [`bugfix-optimization-plan.md`](./bugfix-optimization-plan.md) 作为唯一滚动规划；本文件仅作为历史归档保留，避免继续承担待办入口职责。
> 新任务请以 [`bugfix-optimization-plan.md`](./bugfix-optimization-plan.md)、[`next-session-prompt-rendering.md`](./next-session-prompt-rendering.md) 和具体专题计划为准。

---

## 历史状态

- B1 稳定 featureId 写回：已完成，见 `Docs/LLM_record/26-07/2026-07-26/2026-07-26-b1-stable-feature-id-writeback.md`。
- B2 数据集签名/几何 revision：已完成或已归入主规划核验口径。
- B3 Shift range 多选链路：已完成，见 `Docs/LLM_record/26-07/2026-07-27/2026-07-27-b3-shift-range-verify-and-highlight-lookup-fix.md`。
- B4 3D 属性表视图筛选：已完成并收口旧副本，见 `Docs/LLM_record/26-07/2026-07-27/2026-07-27-b4-cesium-view-extent-sync-closeout.md`。
- B5 email_service 注释误导、B6 statsField 记忆：已在主规划标记完成。
- O1/O2/O3/O4 与 Phase 3 工程化事项：已迁入 [`bugfix-optimization-plan.md`](./bugfix-optimization-plan.md) 对应 P2/P3 条目滚动维护。

## 当前执行口径

1. 不再从本文件领取未完成任务。
2. B1/B3/B4 仍需用户实机冒烟后再决定是否打 V3.5.0 里程碑。
3. 若后续需要恢复本文件内容，请先确认它不会与主规划形成双源冲突。
