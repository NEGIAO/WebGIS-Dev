# 2026-07-27 账号中心全页签 UI/逻辑优化（usercenter-tabs-ui-logic-optimization）

- **日期和时间**：2026-07-27 （实施中，完成后补精确时间与版本号——当前 README 已被并行会话推进至 V3.4.61，完成时顺延取号）
- **任务等级**：L2
- **变更类型**：Bug 修复 + UI/UX 优化 + 死代码清理；纯前端
- **用户指令**：「优化各个 tab 中的 UI 和逻辑」，范围经确认为 P0+P1+P2 全做、含管理/API 两个重面板
- **分析方式**：三个轻 tab + 宿主由本会话逐行走读；三个重面板（AdminControlPanel 1187 / ApiManagementPanel 1047 / ApiKeysManagementPanel 1797）+ useAgentConfig.js 由 Explore 子代理深扫，产出带行号缺陷清单

---

## 问题分析（按文件汇总，√=本轮修，⏭=记 TODO 另立任务）

### 轻 tab（tabs/ 三件套 + FloatingAccountPanel 宿主）

| # | 档 | 问题 | 修法 |
|---|---|------|------|
| A1 √ | P0 | OverviewTab 留言**提交即清空输入框**，发布失败内容无法找回 | emit 增加成功回调参：父组件 API 成功后才回调清空 |
| A2 √ | P0 | PreferencesTab 头像「保存/当前」判定基准 `user.avatar_index \|\| 0` 与实际显示基准（admin 默认 1）不一致 → admin 误显「保存头像」 | 父组件下传归一化 `currentAvatarIndex` prop，判定与显示同源 |
| A3 √ | P0 | SecurityTab OAuth 解绑零确认，误触即解绑 | 按钮二段式确认（首点转「再点确认解绑」，3s 未点自动还原） |
| A4 √ | P1 | 导航「偏好」与「API」页签图标同为 fa-sliders-h | 偏好改 fa-palette |
| A5 √ | P1 | 密码/昵称表单无 form 包裹：回车不提交、密码管理器识别差；新密码无强度提示 | form + @submit.prevent + 隐藏 username autocomplete 字段；新密码三档强度条（长度+字符类） |
| A6 √ | P1 | OAuth 按钮文案小写 google/github | 品牌名映射 Google/GitHub |
| A7 √ | P1 | 昵称框不预填当前昵称，仅 placeholder | 预填 + 仅在未编辑时跟随 user 变化（防 30s 轮询覆盖输入） |
| A8 √ | P1 | 三 tab 内 #fff / #fbfdfb 等硬编码色未走主题变量 | 换 var(--bg-primary) 等既有令牌（theme.css 已有） |
| A9 √ | P2 | 导航无 tablist/tab/aria-selected；面板无 dialog 语义 | 补 role + aria |
| A10 √ | P2 | 每次切入偏好页强拉偏好+模型列表、切入安全页强拉 OAuth 状态 | 面板每次打开首个进入才拉，后续切换走缓存；手动刷新按钮保留强拉 |
| A11 √ | P2 | 剪贴板复制失败静默 | execCommand 降级 + 失败提示 |

### useAgentConfig.js（共享 composable）

| # | 档 | 问题 | 修法 |
|---|---|------|------|
| B1 √ | P0 | `DEFAULT_AGENT_CONFIG.extra_body` 模块级共享引用 + 类型错配（对象 vs 其余链路全字符串）→ 未加载先保存必失败、textarea 显 `[object Object]` | 默认值改 JSON 字符串、每实例独立生成 |
| B2 √ | P0 | `resetChatQuota` 全站破坏性操作：无确认、不置 submitting、可连点双发 | composable 内补 confirm + submitting 置位 + 再入守卫 |
| B3 √ | P1 | `saveAgentConfig` 无再入守卫 | 入口补 submitting 检查 |
| B4 √ | P1 | 配额/超时/token 用 `\|\|` 兜底，管理员故意设 0 被吞成默认值 | 六处改 `??` |

### AdminControlPanel.vue

| # | 档 | 问题 | 修法 |
|---|---|------|------|
| C1 √ | P0 | 行列表 `:key` 兜底 `Math.random()` → 每轮询全量重渲染 | `?? index` 稳定链 |
| C2 √ | P1 | onMounted 与 selectedTable watcher 重复各拉一次行数据 | onMounted 去掉手动 loadRows；loadRows 加请求序号防陈旧覆盖 |
| C3 √ | P1 | 行列表无 loading 分支，加载中即显「暂无数据」 | 补 loading 分支 |
| C4 √ | P1 | `loadDefaultBasemapIndex` 裸 catch 静默吞错（误导管理员并可能反向覆盖真值） | 报错提示 |
| C5 √ | P1 | 发布公告（全员广播）无确认无长度上限 | confirm + maxlength/计数 |
| C6 √ | P1 | 「重置为默认」只改本地态无提示，易误以为已保存 | 文案改「恢复默认值（需保存）」 |
| C7 √ | P1 | 「重新加载」丢弃未保存草稿无确认 | confirm |
| C8 √ | P2 | env 徽章标签 ellipsis 截断无 title | 补 title |
| C9 √ | P2 | 硬编码色约 10 处（danger 渐变/env 徽章/品牌 rgba）| 换既有变量 |
| C10 √ | P2 | `agentConfig: _agentConfig` 解构未用；label 未关联 input | 清理；补 for/id |
| C11 ⏭ | — | `window.prompt` 整行 JSON 编辑（无校验无 diff） | 改 inline textarea 编辑器——中型改造记 TODO |
| C12 √ | P2 | `placeholder="...\n..."` HTML 属性内 `\n` 为字面量 | 改 v-bind 绑定 |
| C13 √ | P2 | 表行数上限 30 无提示（静默截断） | meta 行标注「最多 30 行」 |

### ApiManagementPanel.vue

| # | 档 | 问题 | 修法 |
|---|---|------|------|
| D1 √ | P0 | **日志分页彻底失效**：翻页按钮只改 offset 不调 loadLogs，页码却在涨 | 点击后调 loadLogs |
| D2 √ | P0 | `role.toLowerCase()` 遇 null 整页白屏 | String 包裹兜底（2 处） |
| D3 √ | P1 | 筛选变更不重置 offset → 第 3 页换筛选显「暂无数据」 | applyFilters 归零 offset |
| D4 √ | P1 | loading 中 spinner 与「暂无数据」同显（v-else 挂错分支） | v-else-if=!loading |
| D5 √ | P1 | `calcSuccessRate` 空值出 NaN%；formatTime 无 NaN 检查 | 补数值兜底（两文件同修） |
| D6 √ | P2 | `font-family: '' Courier New ''` 非法 CSS 整条失效（2 处）；`border:none` 死声明 | 修正/删除 |
| D7 √ | P2 | 嵌套 ApiKeysManagementPanel 用 v-show 常驻挂载，API 页签一开 7 串行请求 | 改 v-if + visited 保活；onMounted 改 Promise.all |
| D8 √ | P2 | th 无 scope、tab 条无 tablist/aria、username 列无溢出保护 | 补齐 |
| D9 √ | P2 | 硬编码色 11 处（状态码/角色徽章/#444 等） | 换变量（状态码语义色保留字面量、集中成映射注释） |
| D10 √ | P2 | display:none 的 .management-header 死标记 | 删除 |

### ApiKeysManagementPanel.vue

| # | 档 | 问题 | 修法 |
|---|---|------|------|
| E1 √ | P0 | 六个变更处理器（保存/删除主备密钥、保存参数、保存默认 AI 配置）全部无在飞守卫、按钮无 :disabled → 连点重复追加/重复删除 | 统一 busy ref + 全部变更按钮 :disabled |
| E2 √ | P0 | 「恢复默认额度」后 agentQuota 显示陈旧（漏 hydrate） | agentQuota 改 computed 派生（连根移除该类 bug） |
| E3 √ | P0 | 默认 AI 配置 api_key 回填草稿：后端若返回掩码，保存会把掩码写成真 key | 草稿恒空 + 「留空表示不修改」+ 空值不入 payload |
| E4 √ | P1 | h2 28px/副标题 14px/卡 8px 圆角/输入 4px 圆角，与面板 430px 设计语言脱节；max-width:1200px 死样式 | 对齐轻 tab（13px/12px、12px/10px 圆角）；删死样式；嵌套时去双层卡 chrome |
| E5 √ | P1 | 硬编码色约 34 处、零变量使用（#214a31×6 → --text-primary 等） | 全量换既有变量 |
| E6 √ | P2 | ~75 行 @media 与 @container 逐字节重复 + 第三份局部拷贝 | 只留 @container |
| E7 √ | P2 | 删除按钮×5 无差异 aria；target=_blank 无 rel；unset 徽章对比度 3.4:1 | 补 aria-label/rel；徽章加深 |
| E8 √ | P2 | 死代码：loadAgentConfigWrapper 纯转发、flattenProviderToTop 死条件、`?? 0` after .length | 清理 |
| E9 ⏭ | — | 四份密钥卡模板重复 ~290 行（metadata 已在 managedApiKeys） | v-for 收敛——中型模板重构记 TODO |
| E10 ⏭ | — | Agent 配置编辑器与 AdminControlPanel 整段模板重复（同一后端配置两处编辑、后保存者胜） | 抽 AgentConfigForm.vue 单点化——跨文件重构记 TODO |

### 全局性 ⏭（记 TODO，需独立会话）

- formatTime 三变体 / 错误信息提取 / spinner CSS 三份 → 抽共享 util 与样式（涉新文件+结构树+约 30 调用点）
- 重面板整体卡片材质（毛玻璃 vs 轻 tab 实底白卡）统一——视觉决策需用户实机比对后拍板

## 候选方案对比（关键决策）

| 决策点 | 候选 | 选定与理由 |
|---|---|---|
| 留言失败保内容 | a) 状态提升到父 b) 成功回调参 c) watch isPostingMessage 猜测成败 | **b**：改动最小、语义显式，Vue emit 天然支持多参 |
| OAuth 解绑确认 | a) window.confirm b) 按钮二段式 | **b**：不打断式、无原生弹窗观感割裂；全站广播/配额重置等**跨用户**破坏操作仍用 confirm（后果重，值得强打断） |
| agentQuota 陈旧 | a) 补一处 hydrate b) 改 computed | **b**：根除同类漂移，删除手动同步函数 |
| 重构三项（C11/E9/E10） | 本轮硬做 vs 记 TODO | **记 TODO**：合计 >600 行模板手术，本会话无浏览器实测通道，回归风险不可控；按 Force_command「越权扩大范围」边界另立任务 |

## 修改内容 / 测试方案 / 变更文件清单 / 遗留与风险

（实施后补全）
