# Agent 天气工具接入 + 演示建议词对齐四能力

- **日期与时间**：2026-10-31 17:20
- **任务等级**：L2（功能开发，多文件协同）

---

## 一、问题分析（阶段一产出）

### 1.1 核心症状

1. 在 AI 助手里输入「查询北京的天气和温度」，Agent 无法真正查询：要么凭记忆编造温度，要么回答"我无法获取天气"。
2. 聊天欢迎区的 4 条演示建议词与项目实际已具备的 Agent 能力不对齐，未覆盖「3D 视图 + POI 搜索」的组合调用，也没有天气示例，用户看不到天气能力存在。
3. 天气能力在 UI 工具执行卡片上会显示为裸工具名 `执行工具：get_weather`（缺少中文标签）。

### 1.2 根本原因

| # | 根因 | 证据位置 |
|:--:|---|---|
| 1 | `AGENT_TOOLS` 工具白名单只有 6 个地图工具，没有天气工具 → LLM 无工具可调 | `chat/constants/agentToolsSchema.js` |
| 2 | `buildSystemPromptWithTools()` 的工具清单与语义说明未提及天气，模型不知道"能查天气、该在何时查、参数怎么给" | 同上（`## 工具` 段） |
| 3 | `AgentExecutor.TOOL_REGISTRY` 未注册 `get_weather` → 即使模型输出该 tool_call，也会被判为"未知的工具" | `chat/agent/AgentExecutor.js` |
| 4 | `formatToolResultForLLM()` 的 `extraKeys` 白名单不含 `weather` → 结构化天气数据不会回传给 LLM，第二轮只能看到一句 message | 同上 |
| 5 | `getToolDisplayName()` 无 `get_weather` 分支 → UI 显示裸工具名 | `chat/composables/chatIntentFallback.js` |
| 6 | 建议词为旧的「郑州大学 / 谷歌卫星底图 / 北京故宫 / Carto 暗色风格」，与本次演示目标不一致 | `locales/zh-CN.js`、`locales/en-US.js` |

> 注：`GISCommander.getWeather()` 的**业务实现已存在**（城市名 → adcode 反解 → 高德天气 → 归一化），本次工作的实质是**把它接进 Agent 工具链路**，而非重写数据层。

### 1.3 受影响模块

- `domains/common/chat`（工具 schema、执行器、提示词、UI 标签）
- `domains/common/command-bus`（GISCommander 工具门面）
- `locales`（演示建议词，中英双语）
- 不改动：`api/weather.js`、`api/backend/weather.js`（数据层已可用）、后端（见方案对比 C）

### 1.4 候选方案对比

| 方案 | 做法 | 结论 |
|---|---|---|
| **A** | 在 `MapCommandBus` 新增 `getWeather` 命令 | ❌ 否决。`MapCommandBus` 的命令规格绑定 `supportedViews: ['ol','cesium']`，语义是"改变画布状态的命令"；天气是只读外部数据，与当前视图无关，塞进去会让 2D/3D 视图校验产生无意义的 `COMMAND_UNSUPPORTED_FOR_VIEW` |
| **B** | `GISCommander` 暴露只读方法 `getWeather`，`TOOL_REGISTRY` 注册，不经过 `MapCommandBus` | ✅ **选定**。与既有 `searchAndZoom` 的处理一致（地理编码在 commander 层完成，只有最终定位才走 bus）；只读工具天然没有 URL/命令注入面 |
| **C** | 后端执行天气工具调用 | ❌ 否决。违反 §11.1.7「后端不得执行 LLM 返回的任何工具调用」，工具声明只能回传前端执行 |

### 1.5 选定方案的数据流

```mermaid
flowchart LR
    U[用户 prompt<br/>「查询北京的天气和温度」] --> LLM[LLM + AGENT_TOOLS]
    LLM -->|tool_call: get_weather{city:'北京'}| EX[AgentExecutor]
    EX -->|TOOL_REGISTRY 映射| CMD[GISCommander.getWeather]
    CMD --> G1[apiAddressGeocode<br/>城市名→adcode]
    G1 -->|adcode 缺失| G2[apiReverseGeocodeWithFallback]
    G1 --> W[apiWeather / 高德天气代理]
    G2 --> W
    W --> N[归一化 weather 对象]
    N -->|formatToolResultForLLM<br/>含 weather 字段| LLM2[LLM 第二轮]
    LLM2 --> R[自然语言播报<br/>不移动地图]
```

---

## 二、修改内容

> **起点说明**：本次会话开始时，工作区已存在未提交的半成品（`agentToolsSchema.js` 的 `get_weather` 声明、`AgentExecutor.js` 的注册、`GISCommander.getWeather` 实现、`zh-CN` 建议词）。以下「已就位」指该部分，本次补齐的是**提示词与回传链路**等真正缺失环节，未回退任何既有改动。

### 2.1 已就位（沿用，逐项复核通过）

| 文件 | 内容 | 复核结论 |
|---|---|---|
| `chat/constants/agentToolsSchema.js` | `get_weather` 工具声明（`city`/`adcode` + `type: base\|all`，`additionalProperties:false`） | ✅ 参数语义与高德接口一致 |
| 同上 | 系统提示词第 7 项工具、4 条意图映射、2 条安全约束 | ✅ 与工具声明一致 |
| 同上 | `formatToolResultForLLM` 的 `extraKeys` 含 `weather` | ✅ 否则结构化载荷不回传 |
| `chat/agent/AgentExecutor.js` | `TOOL_REGISTRY.get_weather = 'getWeather'` | ✅ 与 commander 方法名一致 |
| `command-bus/GISCommander.js` | `getWeather()`：城市名→adcode（正地理编码，失败用逆地理编码兜底）→`apiWeather`→归一化 | ✅ 依赖签名已核对：`addressToLocation` 返回 `{lng,lat,adcode,level,formattedAddress}`；`locationToAddress` 返回 `adcode` |
| `locales/zh-CN.js`、`locales/en-US.js`、`ChatMessageList.vue` | 建议词键 `changeStyle` → `weather`，四条文案与 `heroSubtitle` 同步 | ✅ 三处键名一致，无 `changeStyle` 残留 |

### 2.2 本次补齐

1. **`chat/composables/chatIntentFallback.js`** — `getToolDisplayName()` 新增 `get_weather` 分支：
   `查询天气：<city|adcode>（实况/未来预报）`，保留 `escapeHtml`。修复工具执行卡片显示裸工具名 `执行工具：get_weather`。
2. **同文件（缺陷修复）** — 天气兜底正则的城市捕获会连带时间词：实测 `查询上海未来几天的天气` → `city="上海未来几天"`、`查一下明天北京的天气` → `city="明天北京"`，送进地理编码必然 `ADCODE_NOT_FOUND`。新增 `WEATHER_TIME_TOKENS` 做**双向**剥离（前缀 `明天北京`→`北京`；后缀 `上海未来几天`→`上海`），并补 `city.length < 2` 拦截纯时间词。修正后 5 个用例全部符合预期（见 §7）。
3. **`chat/composables/useAgentMapContext.js`** — `summarizeAction()` 新增 `get_weather` 分支，返回 `查询天气<city>`。修复 `recentActions` 中出现 `[get_weather] get_weather` 的噪声（`default` 分支会原样返回 command）。
4. **`chat/composables/chatIntentFallback.js`（兜底链路）** — 新增 `WEATHER_PATTERNS` / `WEATHER_CITY_EXCLUDE` / `FORECAST_HINT`，在 LLM 未返回 tool_call 时兜底出 `get_weather`；**必须排在 `SEARCH_PATTERNS` 之前**——否则「**查**询北京的天气」里的单个「查」会被 `查找?` 当作搜索动词，解析出 `"询北京的天气和温度"` 这类垃圾 query。
5. **同文件（底图兜底）** — `BASEMAP_PRESET_MAPPING` 新增 `谷歌代理` / `代理卫星` / `代理底图` → `google_Backend_Proxy_preset`，且**必须排在 `谷歌` 之前**（映射按插入顺序首次命中即返回，否则「谷歌代理卫星底图」会被通用键 `谷歌` 抢先解析成直连影像，而直连 Google 瓦片在国内不可用）。
6. **`README.md`** — 版本号三处升至 **V3.6.36**（项目简介行 / 版本演进表首行新增、删除最旧 V3.6.33 / 页脚），表恒 3 行。
   > **版本号说明**：CHANGELOG 的 V3.6.34 条目提到「同日暂存区曾被逐次记为 V3.6.34 / V3.6.35 / V3.6.36，已整合为 V3.6.34」——那次 `V3.6.36` 从未发布，已被整合回收。本次按 §5「L2 任务各自 +1 修订号」以当前 HEAD 版本 V3.6.35 顺延，`V3.6.36` 是唯一的下一顺位，故沿用该号并在此注明，避免与历史整合说明混淆。
7. **`Docs/Guide/CHANGELOG.md`** — 顶部追加 V3.6.36 完整条目。
8. **本日志** — 新增。

> 说明：第 4、5 项与工作区并行编辑同时落地（同一文件），本次复核并修正了其城市捕获缺陷，未回退其余逻辑。

### 2.3 工具链闭环自检（逐环节）

| 环节 | 位置 | 状态 |
|---|---|---|
| ① 工具声明（LLM 可见） | `agentToolsSchema.js` `AGENT_TOOLS` | ✅ |
| ② 何时调用 / 参数语义 / 禁止编造 | 同文件 `buildSystemPromptWithTools()` | ✅ |
| ③ tool_call → 实现方法 | `AgentExecutor.js` `TOOL_REGISTRY` | ✅ |
| ④ 业务实现 | `GISCommander.getWeather()` | ✅ |
| ⑤ 结构化结果回传 LLM | `formatToolResultForLLM` `extraKeys.weather` | ✅ |
| ⑥ UI 工具卡片标签 | `getToolDisplayName` | ✅ 本次补 |
| ⑦ 地图操作日志摘要 | `summarizeAction` | ✅ 本次补 |
| ⑧ 演示建议词（中/英/组件） | `zh-CN` / `en-US` / `ChatMessageList.vue` | ✅ |

---

## 三、修改原因

- **产品侧**：演示建议词是用户对 Agent 能力的第一印象。四条建议应各自命中一条独立能力路径（定位 / 底图 / 组合调用 / 数据查询），其中天气最容易被感知"真的在调 API"。
- **技术侧**：天气数据层早已存在，但 Agent 侧缺声明 → 模型"不知道有这能力"。**工具声明是 LLM 唯一的可用性来源，缺一即等于没有**；而声明了不回传结构化结果，模型仍只能复述摘要、无法回答追问。

---

## 四、影响范围

- AI 助手对话链路（工具声明、执行、结果回传、UI 卡片标签、地图操作日志）
- 中英双语演示建议词与空状态副标题
- **不影响**：地图运行时、URL 同步链、`MapCommandBus` 命令集（仍为 5 条地图命令）、天气面板既有逻辑、后端

---

## 五、解决方案

- 保持 `MapCommandBus` 命令集不变，天气作为 **commander 层只读工具**接入（详见 §1.4 方案对比）。
- 工具声明补"何时调用 / 参数语义 / 不支持场景"，降低误调用与编造。
- 结果回传补 `weather` 字段，使模型基于结构化数据播报。
- 演示建议词四条分别对应：`search_and_zoom`、`switch_basemap`、`set_map_view + search_and_zoom`、`get_weather`。

---

## 六、性能指标

不适用。新增工具为按需调用的外部只读请求，不进入首屏路径；本次 `vite build` 产物无新增首屏依赖。

---

## 七、测试方案

### Agent 已执行

| 检查 | 命令 | 结果 |
|---|---|---|
| 语法检查（7 文件） | `node --check <file>` | ✅ 全部 OK |
| 生产构建 | `vite build --outDir <仓库外临时目录>` | ✅ `✓ built in 10.71s`，无新增错误（仅既有 `rapier` 4.3 MB chunk 体积告警与 `ol/layer/WebGLTile` 动态导入告警，均为既有问题） |
| 工具链完整性 | `grep -rn "get_weather"` 全量审计 | ✅ 8 个环节齐全，无遗漏枚举点 |
| 残留检查 | `grep -rn "changeStyle"` | ✅ 0 处残留 |
| 兜底正则用例 | `node -e` 直接跑 5 个中文用例 | ✅ 全部符合预期（见下表） |

兜底正则实测（`detectGISIntent` 的天气分支）：

| 输入 | 输出 | 判定 |
|---|---|---|
| 查询北京的天气和温度 | `city=北京, type=base` | ✅ |
| 查询上海未来几天的天气 | `city=上海, type=all` | ✅（修复前为 `上海未来几天`） |
| 查一下明天北京的天气 | `city=北京, type=all` | ✅（修复前为 `明天北京`） |
| 今天天气怎么样 | no-match → 交回 LLM | ✅ 符合设计（无动词不兜底） |
| 查询纽约的天气 | `city=纽约, type=base` | ✅ 由工具层返回"不支持境外" |

> **未执行**：Agent 实机联调（需要后端代理 + 高德 Key + 登录态 + 真实 LLM 返回 tool_call）。按 §2.7 不作"已测试通过"表述。

### 待用户实机验证

1. 启动 `npm run dev`，打开地图页 → 打开 AI 助手面板，确认空状态显示四条新建议词（中文：定位到南京师范大学 / 切换到谷歌代理卫星底图 / 切换为3D视图并搜索附近的餐馆 / 查询北京的天气和温度）。
2. 点击第 4 条「查询北京的天气和温度」→ 预期：出现工具执行卡片「查询天气：北京（实况）」，卡片状态为成功，回复播报真实气温/湿度/风力，**地图不发生移动**。
3. 追加一句「那明天呢」→ 预期：模型调用 `get_weather(type="all")`，播报未来 4 天预报（验证结构化结果回传生效，未重复问城市）。
4. 输入「查询纽约的天气」→ 预期：明确说明当前数据源仅覆盖中国行政区，**不编造数值**。
5. 点击第 2 条「切换到谷歌代理卫星底图」→ 预期：底图切为「谷歌代理」(`google_Backend_Proxy_preset`)。
6. 点击第 3 条「切换为3D视图并搜索附近的餐馆」→ 预期：先切 Cesium 3D，再按当前城市搜索餐馆并定位（连续两个工具卡片）。
7. 切换语言到 English，确认四条建议词为英文且点击可用。

---

## 八、变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/chat/constants/agentToolsSchema.js` | `get_weather` 工具声明 + 提示词（工具清单/意图映射/安全约束）+ 结果回传 `weather` 字段 |
| `frontend/src/domains/common/chat/agent/AgentExecutor.js` | `TOOL_REGISTRY` 注册 `get_weather → getWeather` |
| `frontend/src/domains/common/command-bus/GISCommander.js` | 新增 `getWeather()`：城市名→adcode→高德天气→归一化 |
| `frontend/src/domains/common/chat/composables/chatIntentFallback.js` | `getToolDisplayName()` 补 `get_weather` 标签；新增天气意图兜底（`WEATHER_PATTERNS` / 时间词剥离 / 预报判据，排在搜索之前）；`谷歌代理` 系底图关键词映射到 `google_Backend_Proxy_preset`（排在 `谷歌` 之前） |
| `frontend/src/domains/common/chat/composables/useAgentMapContext.js` | `summarizeAction()` 补 `get_weather` 摘要 |
| `frontend/src/domains/common/chat/components/ChatMessageList.vue` | 建议词键 `changeStyle` → `weather` |
| `frontend/src/locales/zh-CN.js` | 四条建议词 + `heroSubtitle` 补天气 |
| `frontend/src/locales/en-US.js` | 同上（英文） |
| `README.md` | 版本号三处 → V3.6.36 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.6.36 条目 |
| `Docs/LLM_record/26-10/2026-10-31/2026-10-31-agent-weather-tool-and-demo-suggestions.md` | 本日志 |

> 无新增文件类型变化（无新建源码文件），`frontend-structure.md` 结构树无需同步。

---

## 九、遗留与风险

1. **数据源覆盖**：仅高德（中国行政区）。境外城市无覆盖，靠提示词约束"如实说明 + 不编造"，属**提示词级保障**而非硬约束。
2. **⚠️ 未验证**：`GISCommander.getWeather()` 在正地理编码时把城市名**同时**作为 `address` 与 `city` 传入（`apiAddressGeocode(requestedCity, requestedCity, {silent:true})`）。对「北京」这类纯城市名有效；对「南京市玄武区」这类「省+市/区县」全称，高德 `city` 参数可能不接受区县全称。若实测出现歧义命中或空结果，建议改为不传 `city` 限定（`apiAddressGeocode(requestedCity, '', ...)`）。
3. **adcode 反解成本**：每次天气查询先做一次地理编码（最多 2 次请求：正 + 逆）。高频追问会消耗高德配额；如后续出现配额压力，可在会话内做「城市名 → adcode」短期缓存。
4. **`MapCommandBus` 未纳入**：天气刻意不进 bus，因此 `getSupportedCommands()` 仍只返回 5 条地图命令。若未来新增其它只读工具，建议在 `agentToolsSchema.js` 显式维护「只读工具集合」以便统一过滤地图日志（当前仅 1 个工具，用 `summarizeAction` 分支即可，未提前抽象）。
5. **并行编辑**：本任务期间检测到工作区有并行编辑（同批文件 mtime 连续变动）。本次未回退任何他人改动，仅做增量补齐；提交前请自行 `git diff` 复核全量。

