# 2026-04-29 Compass URL Crypto

- 日期和时间：2026-04-29 21:30

## 修改内容
- 将罗盘 URL 状态从多参数 `clng/clat/crot/cid/cmode` 重构为单参数加密 `cs`。
- 在前端 `urlCrypto.js` 新增罗盘状态编码/解码能力：打包经度、纬度、半径为短码。
- 罗盘恢复逻辑改为应用启动时读取 `cs`，解码后恢复坐标与半径，并调用地图视图中心聚焦。
- 移除前端罗盘配置后端 API 调用，罗盘主题配置改为纯前端本地数据。
- 移除后端罗盘配置接口接入：删除路由注册与初始化逻辑，并删除对应 API 文件。
- 按规范同步更新项目根目录、前端、后端三个 README 的结构树注释。

## 修改原因
- 原罗盘分享参数冗长且暴露过多实现细节，分享链接可读性和可维护性较差。
- 罗盘主题配置无需后端持久化，保留后端接口增加维护复杂度与耦合度。
- 目标是实现无状态、纯前端可还原的罗盘分享链路，降低网络依赖并提升鲁棒性。

## 影响范围
- 前端罗盘 URL 状态同步链路。
- 前端罗盘配置加载链路（后端请求 -> 本地配置）。
- 后端 API 路由装配与启动初始化流程。
- 项目文档结构树与维护日志审计。

## 修改的文件路径
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\urlCrypto.js
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\services\compassUrlState.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\services\CompassManager.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\stores\useCompassStore.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\api\backend.js
- d:\Dev\GitHub\WebGIS_Dev\backend\app.py
- d:\Dev\GitHub\WebGIS_Dev\backend\api\compass_config.py (deleted)
- d:\Dev\GitHub\WebGIS_Dev\README.md
- d:\Dev\GitHub\WebGIS_Dev\frontend\README.md
- d:\Dev\GitHub\WebGIS_Dev\backend\README.md
- d:\Dev\GitHub\WebGIS_Dev\Docs\2026-04-29-compass-url-crypto.md
