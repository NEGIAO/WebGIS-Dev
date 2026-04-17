# TOC 重构后维护指南

本文档面向后续项目管理与升级，包含：

1. 当前 TOC 结构存在的风险点
2. 本轮已完成的优化项
3. 后续迭代优先级建议

## 1. 风险点与潜在缺点

### 1.1 协议字符串分散，改动成本高（已优化）

历史问题：菜单 key、导出格式、layerId 归一化规则散落在多个模块，容易出现“菜单显示一套、命令执行一套”的漂移。

影响：

- 新增菜单命令时需要同时修改多个文件
- 排查 bug 时难以快速定位协议源头

### 1.2 导出能力粒度过粗（已优化）

历史问题：仅有 `exportLayerData` 总开关，缺少 `CSV/TXT/GeoJSON/KML` 的细粒度能力位。

影响：

- 未来新增格式时容易引发 if/else 膨胀
- 不同图层类型的导出权限难精确控制

### 1.3 大树递归多选缺少主动取消（已优化）

历史问题：用户连续点击文件夹递归勾选时，旧任务虽然最终不提交，但仍会继续计算。

影响：

- 主线程被旧任务持续占用
- 大 KML 场景下会产生可感知卡顿

### 1.4 标准 TOC 的 `parentId` 已部分接入（持续优化）

现状：上传图层已支持基于 `parentId` 构建多级目录；绘制/路线/搜索仍以固定根分组为主。

影响：

- 上传域多级目录已可表达，管理体验明显提升
- 其他 sourceType 若未来也引入父子目录语义，仍需扩展统一分层构建器

## 2. 本轮已完成优化

### 2.1 协议统一（菜单命令/导出格式/ID 归一化）

- 新增 `src/composables/map/toc/protocol.js`
- 将菜单命令常量与格式归一化工具集中维护
- 通过 `src/composables/map/toc/index.js` 统一导出

### 2.2 菜单构建与命令分发统一使用协议层

- `menu/contextMenu.js` 改为使用 `TOC_MENU_COMMANDS`
- `menu/commandDispatcher.js` 改为使用协议常量与共享格式解析
- 降低硬编码字符串复制风险

### 2.3 动作管理器统一导出格式校验

- `actions/contextActionManager.js` 改为复用 `normalizeTocExportFormat`
- 增加未知批量操作提示，便于后续诊断

### 2.4 分块递归选择支持协作式取消

- `actions/selectionManager.js` 新增 `shouldCancel` 回调能力
- `TOCPanel.vue` 在文件夹递归勾选时传入 token 取消条件
- 连续操作时可提前终止旧任务，减少主线程占用

### 2.5 导出能力细粒度化

- `useLayerStore.ts` 增加：
  - `canExportCSV`
  - `canExportTXT`
  - `canExportGeoJSON`
  - `canExportKML`
  - `exportFormats`
- 菜单渲染改为按格式能力显示

### 2.6 交互可达性补强

- `TOCTreeItem.vue` 的操作按钮改为“有菜单项即显示”，不仅限 layer
- 文件夹菜单操作在鼠标主交互外也有明确入口

### 2.7 批量导出能力过滤

- `contextActionManager.js` 在导出前按图层能力过滤目标
- 对不支持目标格式的图层给出过滤提示，减少无效导出事件

### 2.8 `parentId` 驱动上传图层多级目录

- `useLayerStore.ts` 已将上传图层从“扁平列表”升级为“动态目录树”
- 新增动态目录节点 ID 规则（`folder-upload-dyn:` 前缀），避免与图层 ID 冲突
- expanded 状态初始化支持目录祖先链，首次加载默认展开
- 保留兼容逻辑：历史 `parentId` 字段仍可回退处理

## 3. 后续迭代优先级建议

### P1（建议下一阶段）

1. 为 `dispatchContextMenuCommand` 与 `handleLayerTreeContextAction` 增加最小单元测试（命令映射与批量行为）。
2. 将 `parentId` 多级分层能力从上传域推广到可选 sourceType（按业务开关）。
3. 为动态目录节点补充可配置展示名（支持 metadata 指定分组标题）。

### P2（中期）

1. 将 TOC 命令协议升级为 schema（可用于自动生成菜单文档与校验）。
2. 增加开发期诊断开关（记录未处理 command/action 到控制台）。

### P3（长期）

1. 引入插件化 TOC action 注册器（按业务域扩展右键菜单）。
2. 将 TOC 操作审计事件接入埋点，支持回溯用户批量操作链路。

## 4. 维护准则

1. 新增菜单项时：先改 `protocol.js`，再改 `contextMenu.js`，最后改 `commandDispatcher.js` 与 `contextActionManager.js`。
2. 禁止在组件内新增大段 command if/else，组件只做渲染与事件透传。
3. 递归选择相关逻辑只允许放在 `actions/selectionManager.js`。
4. 跨层导入统一走 `src/composables/map/toc/index.js`，避免深链耦合。
