# 账号中心浮层面板 UI 优化（FloatingAccountPanel）

> **状态**：✅ 已实施（V3.4.55 · 2026-07-26，原记 V3.4.53 经 07-27 对账顺延；日志 `Docs/LLM_record/26-07/2026-07-26/2026-07-26-account-panel-height-fix.md`），待实机验收（第 4 节清单）· **建议等级**：L2 · **创建**：2026-07-26
> 📌 07-27 会话补注：eslint（涉及两文件）+ tsc 已补跑零报错（原沙盒 403 欠账已清）；同面板 V3.4.57 又动过头部（blur-bg 死类清除），实机验收以当前代码为准。
> 实施偏差三处：全屏 `:deep` 段补 `max-height:none` 豁免（本文遗漏）；移动端 52vh 上界一并移除；头部瘦身经 `:not(.is-fullscreen)` 作用域实现（保全屏零触碰）。实机验收通过后本文件可删除（Cowork 挂载盘禁 rm，需本机执行）。
> **目标文件**：`frontend/src/components/UserCenter/FloatingAccountPanel.vue`（定位样式在 `views/HomeView.vue` `:deep(.home-account-panel)`）
> ⚠️ 本文的高度数字均由**静态读取 CSS 推算**得出，未经浏览器实测，实施时以 DevTools 实测为准。

---

## 1. 用户反馈原话

> "这个 UI 很糟糕，最顶部元素很少，高度还超过了 mapcontainer"

拆成两个独立问题：**A 头部空间浪费**（元素少却占得高）、**B 面板总高溢出地图容器**。

---

## 2. 问题分析

### 2.1 布局链路（先看清约束来自哪里）

```
HomeView .map-wrapper（flex:1，position:relative，overflow:hidden ← 关键）
  └── .home-account-panel        position:absolute; top:5px; left:215px; z-index:--z-modal-high
        └── .account-panel        width:min(430px,96vw); display:flex; column
              ├── .panel-header   padding:18px 20px  + 56px 头像 + 竖排双按钮
              ├── .quick-strip    padding:8px 14px
              ├── .panel-nav      padding:12px 0 11px
              ├── .panel-body     min-height:280px; max-height:min(58vh,540px) ← 关键
              └── .panel-footer   padding:12px 18px + 42px 按钮
```

### 2.2 问题 B：高度溢出（根本原因）

`panel-body` 的 `max-height: min(58vh, 540px)` 以 **视口高度 vh** 为基准，但面板实际被约束在 **`.map-wrapper`** 内——后者高度 = 视口 − 顶栏 − 页面内边距，**恒小于 100vh**，且面板还有 `top: 5px` 的起始偏移。

推算总高（默认非全屏）：

| 区块 | 高度推算 |
|---|---|
| `.panel-header` | 18+18 padding + 56 头像 ≈ **92px**（竖排按钮 34+6+34=74px，不是高度瓶颈但接近） |
| `.quick-strip` | 8+8 + ~17 内容 ≈ **33px** |
| `.panel-nav` | 12+11 + ~21 ≈ **44px** |
| `.panel-body` | **280px（最小）～ 540px（最大）** |
| `.panel-footer` | 12+12 + 42 ≈ **66px** |
| **合计** | **约 515px（最小）～ 775px（最大）** |

在 1080p 常见窗口下 `.map-wrapper` 净高约 700–800px；一旦 `58vh` 取到上限，**面板总高逼近甚至超过容器**。因为 `.map-wrapper` 是 `overflow: hidden`，超出部分被**直接裁掉**——最先被裁的是最底部的 `.panel-footer`，即**「退出系统」按钮在小窗口下会不可见且不可点**。

> 这是功能性缺陷，不只是观感问题。

### 2.3 问题 A：头部空间浪费

- `.profile-avatar.large` 为 **56×56**，配 `padding: 18px 20px`，仅为了显示「昵称 + 邮箱 + 角色徽章」三行文字。
- `.header-btns` 设为 **`flex-direction: column`**，两个 34px 按钮竖排 + 6px 间距 = **74px**，成为头部高度的第二根支撑柱；而右上角横向空间明明富余（430px 宽面板，左侧内容区最多占 ~300px）。
- 结果：头部 92px 里真正承载信息的只有中间 ~40px，视觉上"很空但很高"。

### 2.4 次要观察

- `.panel-body { min-height: 280px }` 是**硬地板**：即使可用空间不足也不肯收缩，加剧了 2.2 的溢出。
- 全屏态（`.is-fullscreen`）已正确使用 `flex: 1 + max-height: none`，**说明正确的弹性写法在本文件里已有先例**，非全屏态只是没跟上。
- `.btn-fullscreen:active` 规则被插在 `.quick-item i` 之后（约第 1249 行），与其它 `.btn-fullscreen` 规则分离，属样式组织凌乱，顺手归位即可。

---

## 3. 建议方案

### 核心思路

**把面板高度的基准从「视口 vh」换成「父容器 100%」**，让 `.panel-body` 成为唯一的弹性伸缩区，其余区块保持内容高度。这与全屏态已有的写法一致，属于同一模式的延伸。

### 改动清单

**① `HomeView.vue` — 给面板一个明确的高度上界**

```css
:deep(.home-account-panel) {
    /* 新增：以容器为基准封顶，替代组件内的 vh 计算 */
    max-height: calc(100% - 10px) !important;   /* 上下各留 5px */
    display: flex !important;
}
```

**② `FloatingAccountPanel.vue` — 面板改为弹性布局**

```css
.account-panel {
    max-height: 100%;        /* 新增：继承父级上界 */
    min-height: 0;           /* 新增：允许在 flex 容器中收缩 */
}

.panel-body {
    flex: 1;                 /* 新增：唯一伸缩区 */
    min-height: 0;           /* 改：原 min-height: 280px 硬地板 */
    max-height: none;        /* 改：删除 min(58vh, 540px) 的 vh 依赖 */
}
```

> 头部 / 速览条 / 导航 / 页脚保持 `flex-shrink: 0`（默认即可，必要时显式声明），确保**页脚永远可见**。

**③ `FloatingAccountPanel.vue` — 头部瘦身（约 92px → 60px）**

```css
.panel-header   { padding: 12px 16px; gap: 12px; }
.profile-avatar.large { width: 44px; height: 44px; border-radius: 12px; }
.profile-name   { font-size: 15.5px; }
.header-btns    { flex-direction: row; gap: 6px; }   /* 改：竖排 → 横排，消除 74px 支撑柱 */
.btn-fullscreen { width: 30px; height: 30px; border-radius: 8px; font-size: 12px; }
```

**④ 可选（视实测效果决定是否做）**

- `.quick-strip` padding `8px 14px → 6px 12px`，省 4px。
- 把 `.btn-fullscreen:active` 规则移回其它 `.btn-fullscreen` 规则旁（纯整理，零视觉变化）。

### 不要做什么

- **不改** `.is-fullscreen` 相关样式——全屏态目前工作正常，本次只修非全屏态。
- **不改** 任何 JS 逻辑、组件 props、事件——这是纯样式任务。
- **不动** `--z-overlay-top` 层级（V3.4.41 刚修过，有专门语义）。

---

## 4. 验收标准

- [ ] 浏览器高度 **1080 / 900 / 768 / 600** 四档下，面板底部「退出系统」按钮**始终完整可见可点**
- [ ] 面板总高**不超过** `.map-wrapper`，不出现被 `overflow: hidden` 裁切的情况
- [ ] 内容超长时（如「总览」页留言较多）**由 `.panel-body` 内部滚动**承接，而非整体溢出
- [ ] 头部高度较改动前明显降低，昵称 / 邮箱 / 角色徽章三行不折行、不截断
- [ ] 两个头部按钮（刷新 / 全屏）横排后不与左侧文字重叠，窄屏（≤480px）下仍可点击
- [ ] 全屏态切换前后表现与改动前**完全一致**（无回归）
- [ ] 绿 / 蓝双主题下均正常
- [ ] `npx eslint` 与 `tsc --noEmit` 无新增报错

---

## 5. 交接提示词（复制到新会话）

```text
开工前请完整阅读 Docs/Force_command.md 并严格遵守，先声明任务等级。

任务：优化账号中心浮层面板 UI。
分析文档已就绪：Docs/TODO/account-panel-ui-optimization.md —— 请先完整阅读，
其中第 2 节是根因分析、第 3 节是改动清单、第 4 节是验收标准。

目标文件：
- frontend/src/components/UserCenter/FloatingAccountPanel.vue
- frontend/src/views/HomeView.vue（:deep(.home-account-panel) 定位样式段）

要求：
1. 按文档第 3 节 ①②③ 实施，④ 为可选项由你判断
2. 纯样式改动，不碰 JS 逻辑 / props / 事件，不改全屏态样式
3. 文档中的高度数字为静态推算未经实测，实施时以实际渲染为准，
   若发现与推算不符，以实测为准并在日志中记录差异
4. 完成后按 Force_command 第 7 节 DoD 收尾并输出交接块

注：本任务的分析文档由上一会话产出（V3.4.52），未做任何代码改动，
你是第一个动这两个文件的会话。
```

---

## 6. 备注

- 本文档由分析会话产出，**未做任何代码改动**，`FloatingAccountPanel.vue` 与 `HomeView.vue` 均为原始状态。
- 实施完成后，建议把本文件移入 `Docs/TODO/` 的已完成区或直接删除，避免与维护日志重复留存（按 SSOT，实施细节应落在 `Docs/LLM_record/` 日志中）。
