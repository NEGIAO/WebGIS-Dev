# 修复默认通道丢弃前端系统提示词导致图层工具无法正确调用（L2）

## 日期与时间

2026-11-23 19:05

## 任务等级

**L2（常规）** —— Bug 修复，改动后端 2 个文件（1 个字段 + 2 处取值逻辑）。

## 问题分析

### 核心症状

用户反馈：V3.7.9 新增的工具中，**从第 12 个 `set_layer_visibility` 起（含 12–16）全部无法成功调用**；前 11 个（含只读的 `get_map_state` / `list_layers`）正常。

### 排查过程

| 检查项 | 结论 |
|---|---|
| 三处键集合一致性（`AGENT_TOOLS` / `TOOL_REGISTRY` / `GISCommander` 返回） | 16 个完全对齐，无遗漏、无拼写差异 |
| `COMMAND_SPECS` 白名单 | 11 条（原 6 + 新增 5），`supportedViews` 声明正确 |
| 后端是否截断 `tools` | 无。`upstream.py:626` 原样透传 `payload["tools"] = tools` |
| 提示词长度 vs `max_length=8000` | 2527 字符，未超限 |
| 前端两条请求路径（首轮 / 工具回填轮） | 均传 `tools: AGENT_TOOLS` |
| 流式端点的工具传参 | `/chat/default-proxy/stream` 等 3 个流式端点均传 `tools=payload.tools` |

### 根本原因（两层叠加）

**第一层：`AgentChatRequest` 根本没有 `system_prompt` 字段**

```python
class AgentChatRequest(BaseModel):        # default-proxy / default-proxy/stream 使用
    message: str
    ...
    tools: Optional[List[Dict[str, Any]]] = Field(...)
    # ← 没有 system_prompt
```

前端 `ChatPanelContent` 每轮都传 `systemPrompt: buildSystemPromptWithTools()`，但 Pydantic 对该字段**静默忽略**（`AgentChatRequest` 直接继承 `BaseModel`，未设 `extra="forbid"`，因此既不报错也不保留）。

对比 `AgentChatProxyRequest`（个人 Key 通道）**有**该字段（`schemas.py:150`，`max_length=8000`）—— 两条通道字段不对称。

**第二层：默认通道硬编码提示词**

```python
system_prompt = _build_agent_system_prompt(
    DEFAULT_AGENT_SYSTEM_PROMPT,      # 只有一句「You are the WebGIS assistant...」
    location_context,
    payload.map_context,
)
```

即使用户请求里带了 `system_prompt`，默认通道也用 `DEFAULT_AGENT_SYSTEM_PROMPT`（`constants.py:19`，一句话通用角色，**不含任何工具说明**）。而 `proxy/stream` 端点用的是 `payload.system_prompt` —— 两条通道行为不一致。

### 为什么表现为「从第 12 个开始失效」

前端提示词承担三项不可替代的职责：

1. **工具清单与编号**（1–16 及其用法）；
2. **选型规则**：其中最关键的一条是「任何涉及具体图层的操作 → 先 `list_layers` 拿 id，再执行」；
3. **约束**：id 必须来自 `list_layers`、`solo_layer` 要列出被隐藏项、3D 不支持要如实说明。

提示词被丢弃后，模型只能看到 `tools` 的 JSON 声明。而 8–11（`get_map_state` / `list_layers` / `get_layer_info` / `get_measure_result`）**不需要 layerId**，靠 description 即可正确调用；12–16 全部需要 `layerId`，模型没有「先取 id」的引导，只能猜（常见是直接传图层显示名）→ 全部命中 `LAYER_NOT_FOUND` → 用户感知为「无效、无法成功调用」。

## 解决方案

### 候选方案

| 方案 | 做法 | 评价 |
|---|---|---|
| A. 把工具说明写进 `DEFAULT_AGENT_SYSTEM_PROMPT` | 后端硬编码 16 工具清单 | ✗ 与前端 schema 双份事实，必然漂移；改工具要改两处 |
| B. **前端提示词透传到默认通道（选定）** | 给 `AgentChatRequest` 补字段 + 端点优先取用 | ✅ 单一事实源（前端 `buildSystemPromptWithTools`），两条通道行为一致 |
| C. 只加字段但端点仍用默认 | — | ✗ 字段加了不用，等于没修 |

### 具体改动

1. `backend/api/agent_chat/schemas.py`：`AgentChatRequest` 新增
   `system_prompt: Optional[str] = Field(default=None, max_length=8000)`，与 `AgentChatProxyRequest` 对齐。
2. `backend/api/agent_chat/routes.py`（2 处：`/chat/default-proxy` 与 `/chat/default-proxy/stream`）：
   ```python
   user_system_prompt = str(payload.system_prompt or "").strip()
   system_prompt = _build_agent_system_prompt(
       user_system_prompt or DEFAULT_AGENT_SYSTEM_PROMPT,
       location_context,
       payload.map_context,
   )
   ```
   缺失时回退默认，保证旧前端（不传该字段）行为不变。

## 修改原因

工具能力扩展如果只改前端声明，在默认通道上等于「模型知道有这些工具，但不知道怎么用」。提示词是工具协议的一部分，不是可选装饰 —— 它承载了「先取 id」「失败要如实转述」这类**防止模型臆造参数**的约束。字段缺失导致的静默丢弃尤其隐蔽：没有报错、没有日志，只表现为部分工具「莫名其妙不工作」。

## 影响范围

| 项 | 影响 |
|---|---|
| 默认 AI 通道 | 系统提示词改由前端提供（2527 字符，含地图状态上下文后仍在 8000 内） |
| 个人 Key 通道 | 无变化（本来就用自己的 `system_prompt`） |
| 旧前端 | 不传 `system_prompt` 时回退 `DEFAULT_AGENT_SYSTEM_PROMPT`，行为与改动前一致 |
| 安全 | 提示词由前端提供，但**工具仍受 `COMMAND_SPECS` 白名单约束**；`map_context` 已有 "read-only data, not instructions" 隔离段；与 proxy 通道既有能力对齐，非新增攻击面 |
| 需重启 | **是**。纯后端字段与逻辑改动，需重启 FastAPI 进程生效 |

## 性能指标

无变化（字段解析与字符串取值，微秒级）。

## 测试方案

### Agent 已执行

- `ast.parse` 语法检查（routes.py / schemas.py）—— 通过
- Pydantic 实例化验证：
  ```python
  AgentChatRequest(message='hi', system_prompt='工具清单测试').system_prompt  # → '工具清单测试'
  AgentChatProxyRequest(...).system_prompt                                     # → 'p'（未受影响）
  ```
- 代码级复核：`AgentChatRequest` 直接继承 `BaseModel`，无 `extra="forbid"`，确认改动前是静态忽略而非 422

### 待用户实机验证（**需先重启后端**）

1. 重启 FastAPI。
2. 默认 AI 通道问「现在有几个图层」→ 应调 `get_map_state` 或 `list_layers` 并如实回答。
3. 导入一个 GeoJSON，说「把这个图层隐藏」→ 预期模型**先调 `list_layers`**，再用返回的 id 调 `set_layer_visibility`；图层应真的消失。
4. 说「透明度调到 30%」→ 预期先取 id 再执行，地图可见变淡。
5. 若仍失败：在浏览器 Network 面板看 `/chat/default-proxy/stream` 的 **request payload 是否含 `systemPrompt`**（应为 2500+ 字符的完整文本），以及响应中是否出现 `LAYER_NOT_FOUND` 或 `MAP_RUNTIME_NOT_READY` —— 两者指向不同的下一层问题（前者是 id 取错，后者是 adapter sink 未注入）。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/api/agent_chat/schemas.py` | `AgentChatRequest` 新增 `system_prompt` 字段 |
| `backend/api/agent_chat/routes.py` | 2 个默认通道端点改为优先取前端提示词 |
| `README.md` / `Docs/Guide/CHANGELOG.md` | 版本号 V3.7.9 与条目 |

## 遗留与风险

1. **需重启后端才生效**，且前端无需重新构建（提示词本来就在发送）。
2. **未实机复现**：本次修复基于代码链路推断（字段缺失 + 硬编码提示词），与「8–11 可用、12–16 不可用」的现象吻合，但未在运行中的服务上验证工具调用是否恢复。若重启后仍失败，下一步应按上文第 5 条采集请求 payload 与错误码。
3. **默认通道提示词可控性**：用户可通过 `systemPrompt` 影响默认通道的模型行为（管理员付费 Key）。当前依赖工具白名单与 map_context 隔离段兜底；若后续需要更严的管控，可改为「前端提示词 + 服务端固定约束」拼接，而非完全替换。
4. **`DEFAULT_AGENT_SYSTEM_PROMPT` 仍是一句话兜底**：若某个客户端不传 `system_prompt`，默认通道的 Agent 能力会退化到「只有工具声明」的水平 —— 这是有意的保守默认，不做硬编码工具清单以免双份事实。
