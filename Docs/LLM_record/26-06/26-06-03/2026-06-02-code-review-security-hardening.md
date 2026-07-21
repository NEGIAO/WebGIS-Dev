# WebGIS 开发维护日志

## 日期和时间
- 2026-06-02 08:59

## 问题事件逻辑链条分析
- 核心症状: 全局消息组件使用 `v-html` 渲染未转义文本，存在 XSS 注入风险; 通用代理默认关闭 TLS 校验且未限制私有/本地目标，存在中间人攻击与 SSRF 风险。
- 根本原因: 文本渲染层缺少 HTML 转义; 代理模块缺少安全默认值与目标地址校验。
- 受影响模块: 前端 Shell 消息系统; 后端通用代理/纠偏代理 HTTP 客户端。
- 潜在影响: 恶意消息可执行脚本; 代理可能被滥用访问内网/本机资源或被劫持。
- 解决方向: 为消息文本增加 HTML 转义并保留字体分组; 代理默认开启 TLS 校验并阻断本地/私网目标, 通过环境变量保留必要的自定义能力。

## 修改内容
- 前端全局消息文本增加 HTML 转义，保留中英文分段渲染样式，消除 XSS 注入风险。
- 后端通用代理新增安全默认值：TLS 校验默认开启，阻断本地/私网目标；提供环境变量开关以兼容特殊部署。
- 补充后端 README 的代理安全环境变量说明，同步更新根/前端/后端 README 的目录树与更新日期。

## 修改原因
- `v-html` 渲染未转义文本存在脚本注入风险。
- 代理默认关闭 TLS 校验且允许访问本地/私网目标，存在 MITM 与 SSRF 风险。
- 代理行为变更需要同步文档，避免部署配置缺失。

## 影响范围
- 前端 Shell 消息提示组件。
- 后端通用代理与纠偏代理的上游请求。
- 文档目录结构树展示。

## 优化解决方案
- 新增文本转义函数，对所有消息文本进行安全处理后再输出 `v-html`。
- 增加代理目标校验：仅允许 http/https，默认阻断 localhost/私网 IP；同时通过环境变量控制。
- 统一更新 README 树与更新时间，确保结构同步。

## 性能指标
- 无性能指标变更。

## 测试方案
- 未执行自动化测试。
- 手工验证建议：
	1) 触发消息文本包含 `<script>` 或 `<img onerror>` 时，页面不执行脚本且显示转义文本。
	2) 访问 `/proxy/127.0.0.1/...` 返回 403；正常公网瓦片请求保持可用。

## 修改的文件路径
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Shell\Message.vue
- d:\Dev\GitHub\WebGIS_Dev\backend\api\proxy.py
- d:\Dev\GitHub\WebGIS_Dev\README.md
- d:\Dev\GitHub\WebGIS_Dev\frontend\README.md
- d:\Dev\GitHub\WebGIS_Dev\backend\README.md
- d:\Dev\GitHub\WebGIS_Dev\Docs\26-06-02\2026-06-02-code-review-security-hardening.md

---

## 日期和时间
- 2026-06-02 14:30

## 问题事件逻辑链条分析
- 核心症状: 卷帘状态恢复仅按数组对半分（midIndex 启发式），左右底图图层数量不一致时恢复错误。
- 根本原因: 卷帘持久化仅存 `targetLayerIds`（左右拼接），缺少左右边界信息；`restoreSwipe` 用 `Math.ceil(len/2)` 拆分，无法正确区分左右图层。
- 受影响模块: `useSwipeConfigStore`、`useBasemapSwipe`。
- 潜在影响: 刷新后卷帘左右图层错位，导致对比结果失真。
- 解决方向: 卷帘配置持久化左右图层 ID，恢复时优先使用显式左右列表并兼容旧数据。

## 修改内容
- 卷帘配置持久化新增 `leftLayerIds`/`rightLayerIds` 字段，`enableBasemapSwipe` 写入显式左右列表。
- `restoreSwipe` 优先读取持久化的左右列表，兼容旧数据回退到 midIndex 拆分。
- `useSwipeConfigStore` 的 `ref` 添加显式 `SwipeConfig` 类型标注，防止类型漂移。
- `normalizeLayerIdList` 统一处理图层 ID 数组的类型安全归一化。

## 修改原因
- 卷帘恢复仅按数组对半分（midIndex 启发式），左右底图图层数量不一致时恢复错误。
- `enableBasemapSwipe` 仅写入拼接后的 `targetLayerIds`，未持久化左右分界信息。

## 影响范围
- 前端卷帘持久化/恢复流程。
- 卷帘配置 Store (`useSwipeConfigStore`)。

## 优化解决方案
- `enableBasemapSwipe` 同时写入 `leftLayerIds`/`rightLayerIds` 到 Store。
- `restoreSwipe` 优先读取 `config.leftLayerIds`/`config.rightLayerIds`，仅在旧数据（无显式左右列表）时回退到 midIndex 拆分。
- `SwipeConfig` 类型定义新增 `leftLayerIds`/`rightLayerIds` 字段。
- `ref<SwipeConfig>` 显式类型标注，防止 ref 推断类型与 `SwipeConfig` 漂移。

## 性能指标
- 无性能指标变更。

## 测试方案
- 未执行自动化测试。
- 手工验证建议：
	1) 卷帘启用后刷新页面，左右底图组正确恢复（特别是左右底图图层数量不一致的场景）。
	2) 旧版 localStorage 数据（无 `leftLayerIds`/`rightLayerIds`）仍能正常恢复卷帘状态。

## 修改的文件路径
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\useBasemapSwipe.js
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\stores\useSwipeConfigStore.ts
