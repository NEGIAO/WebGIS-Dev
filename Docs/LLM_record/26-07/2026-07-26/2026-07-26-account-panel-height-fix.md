# 2026-07-26 账号中心浮层面板高度溢出修复 + 头部瘦身（account-panel-height-fix）

- **日期和时间**：2026-07-26 21:25
- **所属版本**：V3.4.55（📌 2026-07-27 对账修正：原记 V3.4.53 与「后端安全批次」撞号且未入 CHANGELOG，按 §5 顺延补录为 V3.4.55）
- **任务等级**：L2
- **变更类型**：Bug 修复（功能性缺陷）+ UI 优化；纯 `<style>` 改动，零 JS/模板变更
- **分析文档**：`Docs/TODO/account-panel-ui-optimization.md`（上一会话产出，本次为首个实施会话）
- **附带决策记录**：规划 P2-2 CesiumToolPanel 设计方向经用户拍板为「组件域令牌收敛」（见文末）

---

## 问题分析（事件逻辑链条）

| 环节 | 内容 |
|------|------|
| 核心症状 | 用户反馈「最顶部元素很少，高度还超过了 mapcontainer」。拆解为：**A** 头部 92px 仅承载三行文字（空间浪费）；**B** 面板总高溢出 `.map-wrapper`，小窗口下页脚「退出系统」按钮被 `overflow: hidden` 裁掉——**不可见且不可点，属功能性缺陷** |
| 根本原因 | **B**：`.panel-body` 的 `max-height: min(58vh, 540px)` 以**视口 vh** 为基准，但面板实际被约束在 `.map-wrapper`（= 视口 − 顶栏 − 页面内边距，恒小于 100vh）内，加 `top: 5px` 偏移与 `min-height: 280px` 硬地板，总高 515~775px 在常见窗口下逼近甚至超过容器净高。**A**：56px 大头像 + 18px 内边距 + `.header-btns` 竖排双按钮（34+6+34=74px）构成两根高度支撑柱 |
| 受影响的模块 | 账号中心浮层（`FloatingAccountPanel.vue` 非全屏态）+ HomeView 定位样式段；全屏态不受影响（其已用 `flex:1 + max-height:none` 正确写法） |
| 候选方案对比 | a) 调小 vh 系数（治标，换个窗口尺寸继续溢出）；b) JS 监听容器高度动态设置（引入逻辑复杂度，纯样式可解则不上 JS）；c) **高度基准从视口 vh 换成父容器 100%，`.panel-body` 作唯一弹性伸缩区**（与全屏态既有写法同一模式，纯 CSS）——选 c，理由：根治 + 零 JS + 模式统一 |

## 修改内容

### ① `HomeView.vue` — 宿主给面板容器封顶（3 处 `:deep` 段）

1. 基础段：`display: flex !important`（激活原有 `flex-direction: column`，让 `.account-panel` 参与弹性收缩）+ `max-height: calc(100% - 10px) !important`（以 `.map-wrapper` 为基准，top:5px + 底部留 5px）。
2. **全屏段补 `max-height: none !important` 豁免**——分析文档遗漏点：基础段 `:deep(.home-account-panel)` 同样命中带 `.is-fullscreen` 的同一元素，不豁免则全屏矮 10px。
3. 移动端媒体段：`max-height: calc(100% - 16px) !important`（top:8px，上下对称）。

### ② `FloatingAccountPanel.vue` — 弹性链建立

1. `.account-panel`：补 `max-height: 100%; min-height: 0`（继承宿主上界、允许在 flex 容器中收缩）。
2. `.panel-body`：`min-height: 280px` → `0`（去硬地板）、`max-height: min(58vh, 540px)` → `none`（去 vh 依赖）、补 `flex: 1 1 auto`（唯一伸缩区，超长内容内部滚动）。
3. `.panel-header / .quick-strip / .panel-nav / .panel-footer` 四区块显式 `flex-shrink: 0`——收缩压力全部由 `.panel-body` 承担，**页脚退出按钮永远可见**（此项为弹性链正确性必需，非可选：flex 子项默认 shrink:1，不锁定则头部/页脚会被等比压扁）。
4. 移动端媒体查询内 `.panel-body { max-height: min(52vh, 480px) }` 整条移除（同类 vh 基准问题，统一交弹性链封顶；原位留注释说明）。

### ③ `FloatingAccountPanel.vue` — 头部瘦身（约 92px → 60px）

以 `.account-panel:not(.is-fullscreen)` 前缀新增 7 条规则（**全屏态零触碰**，比直接改基础规则再逐条恢复更稳）：`panel-header` 内边距 18/20 → 12/16、gap 14 → 12；头像 56 → 44（圆角 14 → 12，内图 10 = 外框 − 2px 边框）；`profile-name` 17 → 15.5px；**`header-btns` 竖排 → 横排**（消除 74px 支撑柱）；按钮 34 → 30px；速览条内边距 8/14 → 6/12（分析文档可选项 ④，采纳）。

### ④ 样式组织归位（可选项 ④，采纳）

游离在 `.quick-item i` 之后的 `.btn-fullscreen:active` 规则移回 `.btn-fullscreen` 族群旁，零视觉变化。

## 修改原因

用户反馈原话「这个 UI 很糟糕，最顶部元素很少，高度还超过了 mapcontainer」；其中溢出裁切退出按钮属功能性缺陷需修复，头部空间浪费属观感优化。分析文档已就绪（上一会话 V3.4.52 产出），本次按文档实施并补强其遗漏的全屏豁免。

## 影响范围

- 账号中心非全屏态：任意窗口高度下面板不再溢出 `.map-wrapper`，内容超长时 `.panel-body` 内部滚动；头部变矮、按钮横排；大屏下内容多时面板可比原 540px 上限更高（基准改为容器后的预期行为）
- 全屏态：**零变化**（瘦身规则 `:not` 排除；宿主上界显式豁免；组件内全屏规则未动）
- 双主题：改动仅涉及尺寸/布局属性，颜色全部未动，绿/蓝主题均不受影响
- JS 逻辑 / props / 事件 / 模板：零改动（已用脚本核实 script+template 与改前逐字节一致）

## 解决方案（实施要点）

分析文档第 3 节 ①②③ 全部实施，④ 两项均采纳；三处偏差/补强：全屏 `max-height` 豁免（遗漏修补）、移动端 52vh 一并移除（同类问题不留双轨）、瘦身用 `:not(.is-fullscreen)` 作用域（替代改基础规则，保证全屏零回归）。

## 性能指标

- 无（纯 CSS 布局属性变更，不涉运行时开销）。

## 测试方案

### Agent 已执行（静态验证，全部通过）

- 自写结构化 CSS 校验：两文件 `<style>` 块逐规则解析（84 规则 333 声明 / 68 规则 289 声明），花括号/圆括号配平、逐条声明语法校验，零错误；
- script + template 与改前**逐字节一致**性核对（确认纯样式改动）；
- 12 项定向断言：58vh/52vh 清零、`:not(.is-fullscreen)` 规则恰 7 条、flex-shrink 锁定齐全、`panel-body` 弹性化、宿主上界/全屏豁免/移动端上界在位、`:active` 归位后仅 1 处；
- ⚠️ 沙盒 npm/pip 源均被策略拦截（403），compiler-sfc/ESLint 未能运行——但本次仅动 `<style>` 块且结构解析零错误，风险面等价覆盖。

### 待用户实机验证（对照分析文档第 4 节验收标准）

1. 浏览器高度 1080 / 900 / 768 / 600 四档：面板底部「退出系统」按钮始终完整可见可点；
2. 面板总高不超过地图容器，无被裁切；「总览」页内容多时由内容区内部滚动承接；
3. 头部明显变矮，昵称/邮箱/角色徽章不折行不截断；刷新/全屏两按钮横排后不与左侧文字重叠，窄屏（≤480px）可点；
4. **全屏态切换前后与改动前完全一致**（头像仍 56px、按钮仍竖排、高度满容器无 10px 缺口）；
5. 绿/蓝双主题下均正常；
6. 有条件时补跑 `npx eslint` 与 `tsc --noEmit` 确认无新增报错（沙盒源被拦未跑成）。

## 变更文件清单

| 文件 | 说明 |
|------|------|
| `frontend/src/components/UserCenter/FloatingAccountPanel.vue` | 弹性链（②）+ 头部瘦身 `:not` 域（③）+ `:active` 归位（④）；纯 style 块 |
| `frontend/src/views/HomeView.vue` | `:deep(.home-account-panel)` 三段：容器封顶 + 全屏豁免 + 移动端上界（①）；纯 style 块 |
| `README.md` | 版本三处 → V3.4.53 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.4.53 条目 |
| `Docs/LLM_record/26-07-26/2026-07-26-next-bugfix-optimization-plan.md` | P2-2 行标注设计方向已定（组件域令牌收敛）；本修复登记备注 |
| `Docs/TODO/account-panel-ui-optimization.md` | 头部状态改「已实施 V3.4.53」+ 日志链接 |
| 本日志（新增） | — |

## 遗留与风险

1. **实机回归欠账**：本项 6 条验收 + 全线约 40 项静态改动仍待 `LocalDev.bat` 实机回归（P0-1）。
2. **发现前会话合规缺口（未越权代修，待用户定夺）**：CHANGELOG 缺 V3.4.52 条目（README 版本表已有该行），系 V3.4.52 会话漏写；补录为 1 条机械改动，建议下次顺手补齐。
3. 大屏 + 长内容下面板高度上限由 540px 变为容器净高 − 10px，属方案预期行为；若实机观感过高，可加一条 `max-height: min(calc(100% - 10px), 720px)` 之类的绝对上限微调（一行改动）。
4. 移动端 ≤768px 非全屏按钮 30px（原媒体查询 32px 被 `:not` 域规则优先级覆盖）——比原值更紧凑、仍在可点击尺寸范围，实机若嫌小可给媒体查询规则加 `:not` 前缀恢复。

## 附：规划 P2-2 设计决策记录（用户拍板，本次仅记录不实施）

- **议题**：`CesiumToolPanel.vue`（2686 行，56 处硬编码色，独立暗色风格）如何接入令牌体系。
- **决策**：**组件域令牌收敛**——仿 `toc-theme.css` 先例建 cesium 域专用变量文件，56 处硬编码收敛为域内变量；保持暗色身份，不并入全局 `--panel-*`，零全局命名空间污染，为 P3-1 拆分（各页签拆子组件后共享该变量文件）铺路。
- **落地**：另开会话执行（中型机械改动）；已在规划文档 P2-2 行标注。
