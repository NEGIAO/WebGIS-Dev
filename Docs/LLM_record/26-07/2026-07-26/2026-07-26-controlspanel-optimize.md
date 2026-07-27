# ControlsPanel 目录代码优化维护日志(V3.4.34)

## 日期和时间

2026-07-27 01:25

## 修改内容

对 `components/ControlsPanel/` 七个文件逐一审查,修复其中的真实性能热点与逻辑缺陷;结构良好的文件不做为改而改。

## 事件逻辑链分析

### LogMonitor.vue(性能核心)

1. **`v-for :key="index"` + 头部裁剪 = 全列表重 patch**。
   日志超过 `maxLines`(2500)后每帧 `splice(0, ...)` 从头部裁剪,所有行索引整体前移,
   以 index 为 key 使 Vue 认为**每一行都变了** → 高频日志时每帧 diff/patch 2500 行 DOM,
   是该组件最大热点。修复:`pushLine` 赋稳定自增 `id` 作 key(行号显示仍用 index+1,语义不变)。
2. **2500 条日志对象全部进入深响应式代理**。每条 {message,time,className,id} 被 Vue reactive
   包装,读取走 proxy。修复:`Object.freeze` 条目(Vue 对冻结对象跳过响应式转换),
   数组 push 仍触发列表更新,渲染读取零代理开销。
3. **裁剪节奏**:超限即裁 → 高频时每帧一次 O(n) 头部搬移。改为超限 10% 才批量裁剪一次。
4. **SSE"一错即停"**:`onerror → closeConnection()` 把用户意图(streamDesired)一并置 false,
   瞬时网络抖动/后端重启就静默停流,必须手动再点"开启"。修复:错误时保留 streamDesired,
   标记未连接并 3s 后自动重连;手动"停止"才真正关闭。
5. **LOCAL 判定**:仅识别 `localhost`,`127.0.0.1` 被判为 REMOTE(显示错误的类型切换器)。补齐。

### ControlsPanel.vue

6. **`message.warning('未识别的 Action:', currentItem.action)` 参数 bug**:
   useMessage 的 `warning(text, options)` 第二参是 options 对象,action 字符串被当作
   options 吞掉,提示永远只显示前半句。改为模板字符串。
7. 两处 `import ... from 'vue'` 合并为一条。

### 审查通过、不改动的文件(核查记录)

- `DrawPanel.vue` / `MeasurePanel.vue`:V3.4.5 刚重构,注册表驱动、无监听泄漏、computed 轻量。
- `SpatialAnalysisPanel.vue`:8 工具 run 函数 + canRun computed 结构统一,长度来自模板/样式,无热点。
- `AdministrativeDivisionPanel.vue` / `TreeNode.vue`:过滤为纯函数、按 visible 懒加载树,规模小无需防抖。

## 影响范围

- ControlsPanel 目录内 2 个文件;日志监控与侧栏交互行为兼容(SSE 断线行为由"静默停止"变为"自动重连")。
- 无文件增删、不涉及后端。

## 性能指标

- 日志高频场景:裁剪期从每帧 patch 2500 行 → 仅 patch 新增行(key 稳定,复用 DOM);
  响应式代理读取开销归零;裁剪频率降约 10 倍。

## 测试方案

### 已执行
- ESLint 零告警;key 稳定性与 freeze 兼容性推演(push 触发数组响应,行内容不可变故冻结安全)。

### 需人工验证
1. 打开日志监控并开启流:高频日志滚动流畅,锁定滚动/复制/清空正常;
2. 后端重启或断网 3s:状态点转黄(pending),恢复后自动续流,无需手动点开启;手动"停止"后不再重连;
3. 本地 127.0.0.1 环境显示 LOCAL;远程显示 REMOTE 且 RUN/BUILD 切换正常;
4. 侧栏触发一个未识别 action(开发场景)提示完整包含 action 名。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\ControlsPanel\LogMonitor.vue
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\ControlsPanel\ControlsPanel.vue
- D:\Dev\GitHub\WebGIS-Dev\README.md / Docs\Guide\CHANGELOG.md / frontend\README.md(版本记录)
