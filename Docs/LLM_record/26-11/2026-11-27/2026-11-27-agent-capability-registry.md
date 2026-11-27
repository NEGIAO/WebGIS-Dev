# 2026-11-27 Agent 能力注册表（L3 架构重构）

> **日期**：2026-11-27 11:10–11:20
> **任务等级**：L3 架构级
> **状态**：✅ 已完成
> **关联版本**：V3.7.27
> **方案文档**：`Docs/TODO/2026-11-27-agent-capability-registry-plan.md`

---

## 一、问题分析

### 核心症状

用户提出「项目 Agent 的提示词架构是否应该参考 MCP 或 Skill」。

### 判断过程

事实核查：
- 工具执行链全在前端（`AgentExecutor.TOOL_REGISTRY` → `GISCommander` → `MapCommandBus` → OL/Cesium adapter）；
- 能力定义散落 5 个文件共 1376 行；
- 今天连修的 V3.7.21/22/23 三个 bug，根因都是同一语义写了多份、改一处漏一处。

结论：
- **不引入 MCP 协议**——它解决跨进程能力发现，而本项目工具操作浏览器内存里的地图实例，跨进程层无用武之地；
- **借鉴 Skill 思想**——渐进披露（按需加载）与单一事实来源（能力元数据收敛）。

### 受影响模块

| 模块 | 改动 |
|---|---|
| `agentCapabilityRegistry.ts` | 新增，工具层 SSOT |
| `agentToolRouter.ts` | 触发词改为从注册表派生 |
| `agentToolsSchema.ts` | Prompt 机制段改为按需注入 |
| `chatIntentFallback.ts` | 规则表优先、品牌字典兜底 |
| `basemapQuickCommands.ts` | 新增规则一致性校验函数 |

---

## 二、方案要点（对比见方案文档）

1. **纳入注册表**：20 个工具的分组、触发关键词、交互机制段。
2. **不纳入**：底图品牌映射（50+ 条数据字典）、单要素切片规则（19 条已为 SSOT）、工具 parameters schema、description 全文（措辞敏感，V3.7.22/23 教训，零漂移优先）。
3. **按需注入**：罗盘三段式协议只在工具集含 `enable_compass` 时进入 System Prompt。

---

## 三、实施内容

1. 新增 `agentCapabilityRegistry.ts`：`CORE_CAPABILITIES`（4 工具）、`CAPABILITY_GROUPS`（6 组，触发词从 V3.7.19 router 原样迁入）、`REGISTERED_TOOL_NAMES`、`buildTriggerPatterns()`（英文触发词加 `\b`，中文子串匹配）、`COMPASS_MECHANISM_PROMPT`（V3.7.23 原文逐字保留）。
2. `agentToolRouter.ts`：删除内联分组定义，改为从注册表派生 `ROUTES`；保留宽进策略、未登记工具兜底、工具顺序稳定。
3. `agentToolsSchema.ts`：`buildSystemPromptWithTools(toolNames?)` 新增可选参数；无参数时向后兼容（含机制段）；传入工具集时仅含 `enable_compass` 才拼入机制段。`ChatPanelContent.ts` 调用处传入 `activeTools` 的工具名集合。
4. `chatIntentFallback.ts`：底图兜底路径先调 `resolveTileBasemapArg`（规则表 SSOT），未命中再退回品牌字典。
5. `basemapQuickCommands.ts`：新增 `validateQuickCommandsAgainstRules()`，校验 18 条 intent 均命中规则表且 provider 一致（供回归脚本调用）。

---

## 四、验证结果

### 回归基线（重构前后各跑一次，临时脚本已删）

| 校验项 | 重构前 | 重构后 |
|---|---|---|
| 工具数 | 20 | 20 |
| schema 字符 | 8,752 | 8,752 |
| 规则数 | 19 | 19 |
| 快捷命令数 | 18 | 18 |
| 18 条快捷命令命中 | ✅ | ✅ |
| 代理卫星建议词 | ✅ | ✅ |
| 罗盘协议 7 项 | ✅ | ✅ |
| 自主判断措辞 | ✅ | ✅ |
| 加粗归一化 14 项 | ✅ | ✅ |
| 建议词主路径识别 | ✅ | ✅ |

**8/8 全绿，数值零漂移。**

### 按需注入专项

| 校验 | 结果 |
|---|---|
| 注册表含协议常量 | ✅ |
| schema 已移除内联协议 | ✅ |
| 函数含按需注入逻辑 | ✅ |
| 条件（无参数或含罗盘才注入） | ✅ |
| 协议段长度 | 931 字符，仅含罗盘工具时发送 |

### 门禁

- `npm run typecheck`（vue-tsc --noEmit）：✅ 0 错误
- `CheckStructureTree.py`：✅（结构树已同步注册表文件）
- `CheckConfigRegistry.py`：✅
- Git 写操作：零

---

## 五、行为变化与遗留

### 已知行为变化

- `chatIntentFallback` 改为规则表优先后，「切换到高德卫星」由规则表裁决为 `imagery_amap_preset`（高德纯卫星），原品牌字典给的是 `imagery_amap_wgs_preset`（纠偏版）。这是**规则表作为 SSOT 的统一裁决结果**，若实机发现纠偏版更合适，应改规则表而非回退优先级。

### 遗留与风险

- 注册表触发词从正则简化为纯字符串（如 `places?\s*coordinates` → `coordinates`、`切换.{0,4}视图` → `视图`），匹配更宽松；宽进策略下可接受，但极端表述可能多带工具（不影响能力，仅略增 token）。
- `validateQuickCommandsAgainstRules()` 目前供回归脚本调用，未接入模块加载期告警（避免生产开销）。
- 项目无 vitest/jest，回归基线靠临时脚本；后续若引入测试框架，应把 8 项基线 + 14 项加粗用例固化为单测。

### 待用户实机验证

1. 普通对话（如「你好」）首轮 System Prompt 不再含罗盘协议（省 931 字符）。
2. 「分析当前视图范围的风水条件」仍能触发罗盘协议与三段式流程（V3.7.23 不回退）。
3. 「切换到谷歌代理卫星底图」建议词仍正常（V3.7.21 不回退）。
4. 高德/Google 快捷命令面板 18 项仍全部生效。

## 变更文件清单

- `Docs/TODO/2026-11-27-agent-capability-registry-plan.md`
