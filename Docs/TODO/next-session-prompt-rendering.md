# 渲染/性能工作流 · 新会话接续提示词

> 本文件供"渲染/性能优化"工作流的下一个 AI 会话无缝接续使用。
> 与 `next-session-prompt.md`(属性表/架构治理流水)并行,互不接管。

---

## 直接粘贴给新会话的开场白

```
你接手 WebGIS 项目的"渲染/性能优化"工作流。开工前按顺序完整阅读:
1. Docs/Force_command.md(最高行为准则,v2:任务分级/日志路径/门禁/交接块)
2. Docs/Guide/handover.md(项目认知)
3. Docs/LLM_record/26-07-26/2026-07-26-handover-rendering-optimization.md
   (本流水交接:9 个版本的改动总览、BSM 四不变量等关键机制、验收清单、调参回退表)
4. Docs/LLM_record/26-07-26/2026-07-26-next-round-plan.md(本流水路线图,第 0~3 轮)
5. Docs/TODO/requestrendermode-plan.md(L3 方案,已完成,P1~P3 已启用;剩余实机冒烟)

当前进度:路线图第 1 轮(V3.4.42)与第 2 轮的 2.1/2.4/3.1(V3.4.49)已完成;
2.2(requestRenderMode)P1~P3 已完成并在 V3.4.64 启用;2.3(LogMonitor 虚拟滚动)未做;
第 0 轮 GPU 全量实测验收始终未执行。

你的第一件事:向我(用户)确认两个执行事项——
① 是否已完成/何时执行第 0 轮实测验收(清单在交接文档第三节+各轮日志);
② requestRenderMode P2 日志中的实机冒烟何时执行;若出现画面不刷新,优先补点 requestRender,大面积异常则一行回退总开关。
然后按我的答复执行:有回归先修回归;否则做 2.3 或路线图第 3 轮。
```

---

## 当前状态快照(2026-07-27 会话末)

- 仓库版本:V3.4.64(多会话并行,以根 README 项目简介行为准,撞号后完成者顺延);
- 门禁:CheckStructureTree ✅(385/385)/ CheckConfigRegistry ✅(会话末次运行);
- 本流水全部改动 ESLint 零告警,**全部未实机 GPU 验证**;
- 用户未提交 git(规范禁止 Agent 操作 git)。

## 本流水已完成(版本 → 日志)

| 版本 | 内容 | 日志位置 |
|------|------|---------|
| V3.4.7/12/16/25/26/30/32/34/38 | 云影锚定、性能、地形 Worker、流体清除、消息岛等 9 项 | `Docs/LLM_record/26-07-26/`(旧平铺路径,合法保留) |
| V3.4.42 | 第 1 轮:天空 Tyndall 伪值修复、GeoTerrain 语义、BSM 层参数同步 | `Docs/LLM_record/26-07/2026-07-26/2026-07-26-round1-tyndall-terrain-bsm.md` |
| V3.4.49 | 第 2 轮:云分辨率运行时切换、流体时机、风场 GC | `Docs/LLM_record/26-07/2026-07-26/2026-07-26-round2-runtime-scale-fluid-timing.md` |

## 待办(优先级序)

1. **第 0 轮实测验收**(用户执行,Agent 陪跑修回归)——清单:交接文档第三节 + 两轮日志"待用户实机验证";
2. **2.2 requestRenderMode**:✅ P1~P3 全部完成(P1=V3.4.61 接入,P2+P3=V3.4.64 置 true 生效+普查补漏+参数定夺,
   日志 `26-07/2026-07-27/2026-07-27-requestrendermode-p1.md` 与 `-p2-enable.md`);剩余:实机冒烟验收(清单在 P2 日志),
   回归处置 = 补点 requestRender 或总开关一行回退;
3. **2.3 LogMonitor 虚拟滚动**(L2,视口 ±30 行);
4. 第 3 轮:3.2 风场 index.d.ts 校准、3.3 cascade 近距 f32 精度(仅实测可见才做);
5. 天地图 bottomLevel 放宽评估(需真机携 token,方法记录在 round1 日志)。

## 高危提醒(改坏必翻车)

- 改 BSM/云影前必读交接文档"关键机制与不变量"节(矩阵配对/世界锚定噪声/published 契约/签名门控);
- 地形 Worker 池契约:失效必须永久回退主线程,严禁悬死 Promise;
- 消息系统:关闭调度禁改回串行叠加;`_lifeMs` 仅首次调度写入;
- 新日志一律 `Docs/LLM_record/YY-MM/YYYY-MM-DD/YYYY-MM-DD-<英文短横线主题>.md`;
- 收尾必跑两个门禁脚本 + 根 README 三处版本 + CHANGELOG + 交接块(Force v2 第 7/8 节)。
