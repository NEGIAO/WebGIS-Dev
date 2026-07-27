# 全局消息(灵动岛)二轮打磨维护日志(交互与队列策略,V3.4.32)

## 日期和时间

2026-07-27 00:55

## 修改内容

在 V3.4.30(并行错峰调度)基础上的第二轮优化:交互语义、队列压力策略与观感打磨。

## 修改原因 / 事件逻辑链分析

| 问题 | 现状 | 方案 |
|------|------|------|
| 悬停只暂停单条 | 悬停某条时邻条继续倒计时,阅读中脚下的消息会消失、列表跳动 | 暂停语义提升到整岛:指针进入岛内暂停全部计时,移出统一恢复(Apple 风格) |
| 剩余时间不可感知 | 消息何时消失完全未知,"突然没了" | 每条底部 2px 进度条,时长=实际调度寿命(`_lifeMs`,含错峰偏移,严格同步);悬停随整岛暂停(CSS play-state);`prefers-reduced-motion` 隐藏 |
| 合并改写文本 | dedup 命中把 text 改成"xxx(共N条)",文本回流、原文被污染 | 改为图标角标"×N"计数徽标,原文不动;徽标与进度条以 `_dedupCount` 重键,合并时进度条重走一轮(续时可视化) |
| 快排一刀切 | 高压期 error/warning 也被压到 800ms 闪过,用户看不到错误 | 快排豁免:error/warning 至少保留 2500ms,success/info/soup 仍 800ms 快排 |
| 队列无上限 | 批量导入等场景可积压几十条,即使快排也要消化很久 | 队列上限 8:超限淘汰最旧的低优先级(非 error/warning),无低优先级则淘汰最旧;被淘汰消息触发 onClose 并清理 dedup 缓存 |
| 同帧齐刷刷进场 | burst 多条同帧 enter,动画同时起步显拥挤 | 进场级联:按列表序错峰 45ms(transition-delay,CSS 变量),leave/move 不延迟 |

## 影响范围

- `Shell/Message.vue`(模板/样式)、`useMessageIslandMotion.js`(整岛暂停、_lifeMs)、
  `useMessage.js`(快排豁免、队列上限、dedup 不改写文本)。
- API 兼容;无文件增删、不涉及后端。行为变化:dedup 合并不再在文本尾部追加"(共N条)"(改为徽标)。

## 优化解决方案(实施步骤)

1. motion:新增 `pauseAllTimers/resumeAllTimers`;`startAutoCloseTimer` 首次调度时写回 `item._lifeMs = finalDelay`(resume 走剩余时长不改写,保证进度条与计时器同相位)。
2. Message.vue:暂停事件从逐条移到 TransitionGroup 容器;新增进度条(动画时长绑定 `_lifeMs`,按 `id+_dedupCount` 重键)与计数徽标;`--i` 进场级联延迟;reduced-motion 适配。
3. useMessage:`applyFastDuration(payload)` 统一快排并豁免 error/warning(≥2500ms);`enqueueWithCap` 队列上限 8 优先级淘汰;dedup 分支移除文本改写。

## 性能指标

- 极端 burst(30 条)总消化时间有上界(3 可见 + 8 队列,其余按优先级淘汰),不再无限排队;
- 进度条为纯 CSS transform 动画(合成层),无 JS 逐帧成本。

## 测试方案

### 已执行
- ESLint 零告警;调度/进度同相位推演(暂停窗口两者同源于同一 hover,resume 后剩余壁钟一致)。

### 需人工验证
1. 悬停岛内任意位置:所有消息倒计时与进度条同时冻结,移出恢复;
2. 重复消息 1s 内连发:图标角标 ×N 递增、进度条重走,文本保持原文;
3. 高压 burst(>11 条):队列稳定在 8,error/warning 不被闪过(≥2.5s),低优先级被淘汰;
4. 首屏 burst:进场按 45ms 级联,无齐刷刷弹出;
5. 系统开启"减少动态效果":进度条隐藏、级联延迟为 0,功能正常。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Shell\Message.vue
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\useMessageIslandMotion.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\useMessage.js
- D:\Dev\GitHub\WebGIS-Dev\README.md / Docs\Guide\CHANGELOG.md / frontend\README.md(版本记录)
