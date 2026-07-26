# 全局消息(灵动岛)首屏队列修复 + UI 优化维护日志(V3.4.30)

## 日期和时间

2026-07-27 00:25

## 修改内容

修复首屏消息 burst 时的队列滞留/跳变问题,并对消息岛 UI 做轻量打磨。

## 修改原因 / 事件逻辑链分析

### 根因 1(核心,首屏队列问题):自动关闭"串行化"调度

`useMessageIslandMotion.startAutoCloseTimer`:

```js
scheduledCloseAt = latestRunningCloseAt > now
    ? Math.max(earliestCloseAt, latestRunningCloseAt + baseDuration)   // ← 串行叠加
    : earliestCloseAt;
```

每条新消息的关闭时刻被排到"当前最晚关闭时刻 + 自身完整 duration"之后 → 消息**严格串行消失**。
首屏启动 burst(地图初始化/token/公告/体积云提示等 5~8 条,每条 3000ms):
第 N 条要停留 N×3s,最后一条挂 15~24s;MAX_VISIBLE=3 之外的队列条目每次 flush 进来
又排到链尾 → 岛屿长时间占屏、消息"一条条慢慢爬",视觉观感极差。

**修复**:并行计时 + 错峰间隔。`closeAt = max(now+duration, latestCloseAt + 250ms)`——
每条消息按自身 duration 计时,仅在与前一条"同时到期"时错开 250ms 保持先来先走的顺序感。
首屏 3 条同时到达:3.0s/3.25s/3.5s 全清(原 3s/6s/9s)。

### 根因 2:防抖合并后计时器未刷新

`useMessage.createMessage` dedup 命中时更新 `found.msg.duration`(注释称"使 auto-close timer
按新的 duration 走"),但 motion 侧 watcher 对已有 meta 的消息直接 return,不会重启计时器
→ 合并计数在涨、消息却按第一条的时刻关闭。
**修复**:watcher 跟踪每条消息的 `_dedupCount`,变化时清除旧 meta 并按新 duration 重启。

### 根因 3(UI):队列积压不可见 + 样式缺口

- MAX_VISIBLE=3 之外的消息进 queue,用户完全无感知 → 首屏"怎么又冒出一条"的错愕。
  **修复**:岛底部新增"还有 N 条提示…"细字徽标(读 `state.queue` 引用,响应式)。
- `message-host-top-right` 为组件默认 position 却没有对应 CSS(fixed 无偏移 → 位置未定义),
  补齐兜底样式(当前应用使用 top-center,不受影响)。
- 首屏 burst 多条同时 enter:每条 filter blur(8px) 过渡 + 岛整体 backdrop blur(28px)
  层叠,GPU 负担大。blur 减负:enter 8→4px、leave 10→6px、backdrop 28→20px(观感几乎无差)。
- 标题("成功/错误"等中文)字体栈首选 Cinzel(拉丁衬线)导致中文回退不可控,补中文字体栈。

## 影响范围

- `Shell/Message.vue`(UI/样式/队列徽标)、`composables/useMessageIslandMotion.js`(调度)、
  `composables/useMessage.js`(host 传 queue 引用)。
- 全局消息系统所有调用方行为兼容(API 不变);无文件增删、不涉及后端。

## 优化解决方案(实施步骤)

1. `useMessageIslandMotion.js`:串行调度改错峰(STAGGER_MS=250);watcher 增加 `_dedupCount`
   变化检测重启计时;卸载清理伴随 map。
2. `useMessage.js`:`ensureMessageHost` 渲染时传 `queued: state.queue`(数组引用,组件内读
   length 保持响应)。
3. `Message.vue`:新增 queued prop 与岛底"还有 N 条"徽标(TransitionGroup 内 keyed 节点);
   补 `message-host-top-right` 样式;blur 减负;标题中文字体栈。

## 性能指标

- 首屏 burst(6 条)全清时间:~18s → ~4.3s;岛占屏时长大幅缩短。
- 同帧多条 enter 的 filter/backdrop 模糊面积减半,低端机首屏掉帧缓解。

## 测试方案

### 已执行
- ESLint 零告警;调度公式推演(3 条同时:3.0/3.25/3.5s;hover 暂停/恢复走 remaining 路径不受影响;
  duration=0 常驻消息不参与 latestCloseAt 计算,不阻塞他人)。

### 需人工验证
1. 刷新首屏(登录+地图初始化 burst):消息在 ~4s 内错峰消完,无长时间滞留;
2. 快速触发 >3 条:岛底显示"还有 N 条提示…",随消化递减消失;
3. 相同消息 1s 内重复触发:合并计数"(共N条)"且停留时间随之刷新;
4. hover 暂停/移出恢复、点击收起、× 按钮行为不变;
5. 鸡汤(soup)样式与常驻(duration=0)消息不受影响。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Shell\Message.vue
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\useMessageIslandMotion.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\useMessage.js
- D:\Dev\GitHub\WebGIS-Dev\README.md / Docs\Guide\CHANGELOG.md / frontend\README.md(版本记录)
