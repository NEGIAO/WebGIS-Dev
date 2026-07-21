# V3.3.5 README 与文件结构同步记录

## 日期和时间

2026-06-15 19:38

## 修改内容

- 同步更新根目录 `README.md`、`frontend/README.md`、`backend/README.md` 的版本记录为 V3.3.5。
- 补充三个 README 的文件结构树，加入 `frontend/src/api/backend/runtime.js`、`frontend/src/services/runtimeMapTokens.js` 与后端 `api_keys_management.py` 的新职责说明。
- 新增四类 API 主/备 token 管理说明：高德、Agent、天地图、Cesium Ion 均支持管理员配置主 token 与任意数量备用 token。
- 后端新增 `api_key_backups` 存储结构与备用 token 管理接口，运行时地图配置接口返回天地图/Cesium token 池。
- 前端管理员面板新增备用 Token 池管理区，运行时地图 token 服务新增 token 池缓存与失败切换能力。
- 2D OpenLayers 天地图瓦片连续失败时会切换备用 TK，并重建当前可见底图 source。

## 修改原因

生产环境中天地图 TK 与 Cesium Ion Token 需要由前端浏览器直连第三方服务使用，不能全部走后端代理，否则高频瓦片、地形与 3D Tiles 请求会明显拖慢体验。但如果直接写入 Vite 环境变量，真实 token 会被打入前端产物，安全边界不清晰。

同时，单一主 token 一旦过期、配额用完或权限异常，会导致地图、Cesium 或外部服务不可用，因此需要管理员可维护的备用 token 池，并让系统在主 token 不可用时自动尝试备用 token。

## 影响范围

- 后端 API 密钥管理：`/api/admin/api-keys` 与 `/api/runtime-config/map-tokens`。
- 后端高德代理与 Agent 上游调用：支持主/备 key 顺序兜底。
- 前端用户中心管理员密钥面板：新增备用 token 管理能力。
- 前端 2D 地图、Cesium 初始化与运行时地图 token 服务：支持读取 token 池并在失败时切换备用 token。
- 三个主 README 的版本记录、环境变量说明与文件结构树。

## 优化解决方案

- 保留原 `api_keys` 表作为主 token 存储，新增 `api_key_backups` 表存储备用 token，避免破坏既有数据。
- 管理员面板不回显备用 token 明文，只显示顺序、状态和更新时间，新增 token 时写入，删除时按 ID 删除。
- `/api/runtime-config/map-tokens` 同时保留旧字段 `tianditu_tk`、`cesium_ion_token`，并新增 `token_pools`，兼容旧调用并支持新兜底能力。
- 高德代理检测 key/权限/配额类 infocode 后自动尝试备用 key。
- Agent 平台 key 解析为候选池，聊天请求与模型列表请求按候选顺序调用。
- 前端移除对 `VITE_TIANDITU_TK`、`VITE_CESIUM_ION_TOKEN` 的直接读取，避免 Vite 生产构建内联真实 token。

## 性能指标

- 高频瓦片、地形和 Cesium 3D Tiles 请求仍由浏览器直连第三方服务，避免后端代理成为瓶颈。
- `/api/runtime-config/map-tokens` 仅在前端启动或强制刷新时读取一次，运行期复用本地缓存。
- 高德与 Agent 备用 key 仅在主 key 失败时触发额外请求，正常链路不增加额外调用。

## 测试方案

- 使用 `python -m py_compile` 检查后端改动文件语法。
- 运行前端构建或语法检查，确认新增 API 封装、管理员面板和运行时 token 服务可被 Vite 正常解析。
- 管理员登录后分别为四类 API 新增多个备用 token，刷新状态确认备用数量正确。
- 临时配置不可用主 token，验证高德代理、Agent 上游调用、Cesium 初始化可尝试备用 token。
- 检查生产环境变量示例，确认不再要求 `VITE_TIANDITU_TK` / `VITE_CESIUM_ION_TOKEN`。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS_Dev\README.md`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\README.md`
- `D:\Dev\GitHub\WebGIS_Dev\backend\README.md`
- `D:\Dev\GitHub\WebGIS_Dev\backend\api\api_keys_management.py`
- `D:\Dev\GitHub\WebGIS_Dev\backend\api\external_proxy.py`
- `D:\Dev\GitHub\WebGIS_Dev\backend\api\agent_chat\db.py`
- `D:\Dev\GitHub\WebGIS_Dev\backend\api\agent_chat\routes.py`
- `D:\Dev\GitHub\WebGIS_Dev\backend\api\agent_chat\upstream.py`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\api\backend\admin.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\UserCenter\ApiKeysManagementPanel.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Map\MapContainer.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\services\runtimeMapTokens.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\CesiumContainer.vue`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\.env.example`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\.env.production`
