# 2026-11-22 思考型模型零正文（empty content）根治 + temperature 兼容修复

- **日期与时间**：2026-11-22 17:15 前后（实施中补记）
- **任务等级**：L2（P0 可用性修复）
- **版本**：V3.7.8（曾用号 V3.7.14，按用户「整合为一个统一的版本：V3.7.8」指令归并，见 CHANGELOG 归并注）

## 问题分析

### 核心症状（生产日志 16:52–16:57，V3.7.12 诊断上线后首次完整成像）

「请求失败：upstream returned empty content」反复出现。V3.7.12 的 `candidate produced nothing` 诊断行首次完整记录子因：

1. **主因（3 次）**：`lines=415 data=208 parsed=207 done=True broke=False finish=length`，模型 `qwen4-max` / `deepseek-v4.1-flash-1017` —— 流完全正常结束但 **`delta.content` 零输出、`finish_reason=length`（max_tokens 耗尽）**。用户换 key 后选用的是**思考型模型**：流式下先生成 `reasoning_content`（思考内容，不透传给用户），思考把 max_tokens 预算全部吃光 → 正文零生成。旧 NVIDIA nemotron 无此模式，故此前未触发。
2. **次因（3 次）**：`HTTP 400: Temperature should be in [0.0, 2.0)` —— 管理面 temperature 配置为 2.0，阿里云新模型**上开区间拒绝**（NVIDIA 接受 2.0）。
3. **小因（1 次）**：`HTTP 404 Model not exist` —— fallback 缓存中的模型 ID 在阿里云新命名空间不存在（管理面重选模型即可）。

### 根本原因

代码对「思考型模型」的两个差异没有防御：① 思考 token 计入 max_tokens，正文可能零生成（finish=length）而报错文案含糊（empty content）；② temperature 上开区间校验。

### 解决方案

1. **零输出 error 消息精确化**：流循环捕获 `delta.reasoning_content` 出现次数（`reasoning_count`，仅诊断不透传）；当 finish=length 且零正文且 reasoning_count>0 时，error 事件改为明确中文提示（含模型名、max_tokens 值、调大建议）；抽纯函数 `_build_zero_output_message` 便于测试。
2. **temperature 统一 clamp**：新增 `_sanitize_temperature()`（clamp 到 [0, 1.99]），流式与非流式 payload 构造统一调用——2.0→1.99 行为差异可忽略，消除阿里云 400。
3. **produced nothing 诊断行补 `reasoning=%d` 与 `max_tokens=%d` 字段**——下次发作可直接确认 token 预算与思考块数量。

## 修改内容

1. `backend/api/agent_chat/upstream.py`：
   - 新增 `_stream_has_reasoning(chunk)` —— 检测 `delta.reasoning_content` 块（仅诊断计数，不透传给用户）。
   - 新增 `_sanitize_temperature(value)` —— clamp 到 [0, 1.99]（阿里云上开区间拒绝 2.0）；流式（:1257 附近）与非流式（:601 附近）payload 构造统一调用。
   - 新增 `_build_zero_output_message(model, max_tokens, finish, reasoning_count, last_error)` —— finish=length 且 reasoning>0 时返回精确中文提示（模型名 / max_tokens 值 / 思考块数 / 调大建议），否则维持 last_error 原语义。
   - 流循环接入 reasoning_count；`candidate produced nothing` 警告补 `reasoning=%d max_tokens=%d` 字段；记录 `last_zero_output` 元数据；尾部 error 事件改用 `_build_zero_output_message`。
2. `backend/tests/test_agent_stream.py`：新增 `ReasoningModelDefenseTests` 4 例（reasoning 检测 / clamp 边界 / 精确文案 / 原语义回退）。

## 影响范围

三通道流式与非流式端点共用 upstream.py——temperature 全局 clamp（2.0→1.99 对 NVIDIA 行为差异可忽略）；error 文案仅在「思考型模型 finish=length 零正文」场景变化，其余错误维持原语义。

## 性能指标

不适用（每次流尝试增加一个布尔字段检查，零开销级）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| 流式域 pytest **20/20**（新增 4 例）；全量 127 passed（1 个 pytest-asyncio 既有环境项）；py_compile 通过；结构树/配置登记门禁通过；表格 3 行核验 ✓ | ① 用 qwen4-max / deepseek-v4.1 对话：若思考耗尽预算，气泡显示精确中文提示（含模型名与调大建议）而非「empty content」；② temperature=2.0 配置下对话不再 400；③ 正常模型对话无回归 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/api/agent_chat/upstream.py` | reasoning 检测 + temperature clamp + 精确 error 文案 |
| `backend/tests/test_agent_stream.py` | 新增 4 测试 |
| `README.md` | 版本号三处（表格增删同步） |
| `Docs/Guide/CHANGELOG.md` | 顶部追加 V3.7.14 条目 |
| `Docs/LLM_record/26-11/2026-11-22/2026-11-22-fix-reasoning-model-empty-content.md` | 本日志（**新建**） |

## 遗留与风险

1. **max_tokens 与思考模型的预算问题本质是配置面问题**：默认 32768 足够，若用户在管理面配置过小值仍会触发（但现在有精确提示指引调大）。可考虑后续在管理面 UI 对思考型模型给出 max_tokens 建议（前端迭代）。
2. `Model not exist`（404）属管理面模型 ID 配置问题——建议在管理面重新拉取模型列表（fallback 缓存中的旧 ID 在新 key 命名空间可能不存在）。
3. V3.7.12 诊断与 V3.7.14 文案形成闭环：下次任何零输出事件，日志可直接定位子因，用户气泡直接给出对策。
