# 2026-07-26 会话交接文档（UI/UX 工作流线）

> 面向：下一个开发会话（人类或 AI Agent）。本会话专注**前端 UI/UX 与交互功能**，
> 与同日并行的「OAuth/属性表/架构治理」线（见 `2026-07-26-session-handover.md`）及全局
> [`Docs/Guide/handover.md`](../../Guide/handover.md) 互补。逐项细节见各任务日志（文末索引）。
> ⚠️ 全部改动**尚未 git 提交**，提交决策权归用户。

---

## 一、当日完成（本会话负责的版本条目）

| 版本 | 主题 | 核心产出 |
|------|------|----------|
| V3.4.5(部分) | 注册/登录页现代化 | 单卡片精修：品牌徽标 + 经纬网格头部、胶囊提示、分段式切换、主次按钮分层；修复注册模式头部被压缩（`.form-header` 补 `flex-shrink:0`） |
| V3.4.9 | 图层管理统一与编辑全图层开放 | `useGeometryEdit` 由仅 draw 泛化为全矢量托管图层（路线/栅格/WebGL 除外）；TOC 右键新增「编辑要素」定向编辑（10 文件全链接线）；Delete 快捷删除；DrawPanel 职责收敛 |
| V3.4.14 | UI 主题令牌统一治理 | theme.css 三组令牌（--z-\*/--panel-\*/--fs-\*）；25 组件 44 处硬编码色同值替换；35 处 z-index 魔数令牌化；DrawPanel/MeasurePanel 试点 |
| V3.4.21 | AI 对话面板拆分与网页版增强（四轮迭代） | 2378 行拆为容器 + 4 子组件 + 3 composable；会话持久化/复制/重新生成/停止/智能滚动/建议词；气泡非对称重设计（头像+文档卡/渐变胶囊）；打字机逐字 + 渲染缓存 + Hero 首屏 + 未读徽标 + 导出 MD；Agent 配置面板四卡片化（Key 显隐/Temperature 滑杆） |
| V3.4.28 | 账号中心重设计（两轮） | 内容区 210px 固定高 → `min(58vh,540px)` 自适应（实用性根因）；双层样式单套化 + 品牌横幅；Overview 统计卡 + 配额进度条；速览条/手动刷新/Esc 分级退出/密码显隐/留言相对时间+彩色头像/联系一键复制 |
| V3.4.33 | 偏好设置真实落地 | 默认底图（2D+3D 双端，URL > 偏好 > 管理员默认）、单位制（`utils/units.js` + 测量接入，8 断言）、偏好 Agent 模型（Chat 三链路锁定优先）、语言项如实化；全屏按钮对比度修复 |
| V3.4.36 | 面板令牌推广 | SpatialAnalysis/District/ControlsPanel/MapControlsBar 30 处接入 --panel-\*；ControlsPanel 面板族群令牌化收官 |

## 二、新增架构约定（后续开发必须遵守）

1. **设计令牌（theme.css）**
   - 跨组件浮层 z-index 必用 `--z-float(100)/--z-panel(1000)/--z-popover(1200)/--z-modal(2000)/--z-modal-high(2200)/--z-toast(9999)`，组件内局部堆叠（1~10）不用令牌；**禁止新增魔数**。
   - 地图浮层面板框架用 `--panel-bg/--panel-radius/--panel-radius-sm/--panel-shadow/--panel-border/--panel-header-gradient`。
   - 新代码字号用 `--fs-xs(11)~--fs-xl(20)` 六档；存量渐进迁移。
   - 颜色一律主题变量（绿/蓝双主题联动）；白/黑与刻意设计（LogMonitor 暗色终端、vendored Cesium 模块）除外。
2. **Chat 模块结构**（`components/Chat/` + `composables/chat/`）
   - 容器 `ChatPanelContent` 只做编排（发送流程/工具两轮/软取消 requestSeq/打字机）；展示归 4 子组件；配置对象经 `provide('chatAgentConfig')` 共享（store 型 reactive，规避 prop 变异告警）。
   - 会话持久化 `chat:history:v1`（≤200 条，300ms 防抖）；`chatIntentFallback` 为纯函数可单测。
   - 消息列表有 Markdown 渲染缓存（key 含 libs-ready 位）——改渲染器输出格式时注意缓存键语义。
3. **几何编辑引擎**（`useGeometryEdit`）
   - 可编辑范围 = 全矢量托管图层；`getOlLayerFromItem` 兼容 `layer/_layer` 双字段（行政区划记录用 `_layer`）。
   - 非绘制图层删空要素**保留空图层记录**（移除权归 TOC）；绘制图层维持删空即移除。
   - TOC「编辑要素」链路：`protocol.EDIT → commandDispatcher('edit-layer') → contextActionManager 转发 → TOCPanel/SidePanel emits → HomeView → MapContainer.activateGeometryEditForLayer(layerId)`。
4. **用户偏好消费模式**（新偏好项照此接入）
   - store（`useUserPreferencesStore`）bootstrap/保存时写 runtime 缓存（`webgis_pref_*` localStorage key）；
   - 消费方经 store 导出的同步读取函数（`readCachedPreferredBasemap/readCachedPreferredAgentModel` 或 `utils/units.js`）接入，**不引 Pinia、不阻塞初始化**；
   - 2D/3D 底图共用 preset id 体系（`URL_LAYER_OPTIONS`），优先级恒为 URL 参数 > 用户偏好 > 管理员默认。

## 三、关键文件坐标（本线高频改动点）

| 场景 | 入口 |
|------|------|
| 改对话面板 UI/交互 | `components/Chat/ChatMessageList.vue`（气泡/操作条/滚动）、`ChatInputBar.vue`（输入壳）、`ChatConfigPanel.vue`（配置四卡片） |
| 改对话逻辑/模型选择 | `composables/chat/useChatAgentConfig.js`（三通道 callLLM + 模型优先级）、`useChatSession.js`（持久化/上下文）、容器 `dispatchSend`（工具两轮/打字机） |
| 改账号中心 | 壳 `UserCenter/FloatingAccountPanel.vue`（速览条/头部横幅）+ `tabs/`（Overview/Security/Preferences 均单套浅色样式） |
| 改注册页 | `views/RegisterView.vue`（头部有 flex-shrink:0 关键注释勿删） |
| 加/改偏好项 | store 加字段与 runtime key → 按 §2.4 模式接入消费方 → PreferencesTab 描述写清实际生效范围 |
| 编辑能力扩展 | `composables/map/features/useGeometryEdit.js` + `useDrawingFeatureStyle.js`（高亮样式） |
| 单位换算 | `utils/units.js`（displayUnit 形参可显式覆盖，供 3D 侧复用） |

## 四、验收状态

- **静态验证已全过**：所有改动文件 compiler-sfc（parse+compileScript+compileStyle）+ ESLint 零告警 + TS transpile 无诊断 + units.js 8 断言 + 各轮类名/行尾/图标存在性复查。
- **待实机回归**（沙盒无法起 vite，各日志「测试方案」节有逐条勾选清单，共约 40 项）。最关键六条：
  1. 注册页切"注册"模式头部不再被遮挡；
  2. TOC 右键「编辑要素」对上传 GeoJSON 生效，路线/TIF 无此菜单；
  3. 切蓝色主题：绘制/测量/空间分析/区划/账号中心/对话面板全部联动无残绿；
  4. 对话面板：刷新历史仍在、停止生成立即解锁、打字机逐字、导出 MD；
  5. 偏好：设默认底图（2D/3D 双端验证）、切英制测距、设偏好模型重开面板；
  6. 账号中心：内容区随视口伸展、速览条数值、密码显隐。

## 五、本线待办（按优先级）

1. **P1 实机回归**上面六条 + 各日志清单。
2. **P2 Routing/Cesium 面板令牌接入**（BusPlanner/DrivingPlanner 同族机械替换；CesiumToolPanel 暗色风格需先做设计决策：保留独立暗色 or 并入 panel 令牌加暗色变体）。
3. **P2 --toc-\* 与品牌令牌合流**（toc-theme.css 已部分映射 brand 变量，剩余为独立值）。
4. **P3 字号阶梯存量迁移**（490+ 处，按组件分批，纯机械）。
5. **P3 完整 i18n**（vue-i18n + 文案抽取）后接通语言偏好；Chat 流式输出需后端 SSE 支持（当前打字机为前端模拟）。

## 六、本线任务日志索引

- `2026-07-26-register-ui-modernize.md` — 注册页重设计 + flex-shrink 修复补记
- `2026-07-26-unified-layer-editing.md` — 编辑统一（含 15 文件清单与 8 条验收）
- `2026-07-26-ui-theme-token-unification.md` — 令牌治理 + V3.4.36 面板推广补记
- `2026-07-26-chat-panel-split-and-enhance.md` — Chat 四轮（拆分/增强/气泡/打磨/配置面板，五节补记）
- `2026-07-26-user-center-ui-redesign.md` — 账号中心两轮（含二轮补记与 14 条验收）
- `2026-07-26-preferences-implementation.md` — 偏好落地（含 3D 续接补记）

---

*同日并行线交接：`2026-07-26-session-handover.md`（OAuth/属性表/架构治理）；全局入门：`Docs/Guide/handover.md`。*
