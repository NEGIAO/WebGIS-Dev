# 删除专用 ships66 海图代理，改走通用 /proxy

## 元信息

- **日期与时间**：2026-10-25 18:48
- **任务等级**：**L2**（前端预设改造 + 后端路由删除 + 部署面配置清理，跨 3 个仓库）
- **版本**：V3.6.26 → **V3.6.27**
- **用户要求**：「清理掉这个专用的海图代理，将它的瓦片改为 proxy 通用代理即可，没有必要专门搞一下代理」

---

## 一、问题分析

### 1.1 背景

`/tiles/ships66/{z}/{x}/{y}.png` 是为「船舶网」底图单设的专用代理端点。它需要四处配置同时正确才能工作：

| 位置 | 配置项 |
|---|---|
| FastAPI | `SHIPS66_TILE_URL_TEMPLATE` 环境变量 |
| systemd | `Environment=` 注入该变量 |
| nginx | `location /tiles/` 转发到 `:9002` |
| 前端 | `backendTilesUrl('ships66/...')` 拼 `/tiles/...` |

任一处漏配，整条链路就会静默失效（今日就因 nginx 缺 location + systemd 缺 env + 部署钩子旧版三重叠加而彻底不通）。

### 1.2 通用代理已能覆盖该场景

`/proxy/{target_url:path}` 通用流式代理可直接代理任意上游 URL。线上实测：

```
GET https://vpn.negiao.cn/proxy/http://g3.ships66.com/maps/one/5/27/15.png
→ 200 image/png 4469B  0.47s / 0.42s / 0.47s（连续 3 次）
```

源站直连（`127.0.0.1:9002`）与经本机 nginx（443 + Host 头）同样 200，确认 nginx 未合并 `//`、协议原样透传。

**结论：专用端点纯属重复建设，可整体删除。**

---

## 二、解决方案

| 方案 | 做法 | 结论 |
|---|---|---|
| **A. 前端改用 `tileProxyUrl`，后端删专用路由** | 一步到位，无额外维护面 | ✅ **采纳** |
| B. 保留专用路由，仅前端切走 | 少改后端 | ❌ 死代码常驻，未来仍要维护 env/nginx |
| C. 专用路由内部转调通用代理 | 保留端点 | ❌ 多一跳，且仍是死代码 |

---

## 三、修改内容

### 3.1 前端（WebGIS-Dev）

| 文件 | 改动 |
|---|---|
| `frontend/src/domains/ol/basemap/constants/basemapConfig.ts` | `ships66` 预设两处 URL：`backendTilesUrl('ships66/{z}/{x}/{y}.png')` → `tileProxyUrl('http://g3.ships66.com/maps/one/{z}/{x}/{y}.png')`；移除 `backendTilesUrl` 导入 |
| `frontend/src/config/publicRuntime.ts` | 删除 `backendTilesUrl()`（仅 ships66 使用，已无引用） |

最终请求形态：

```
https://vpn.negiao.cn/proxy/http://g3.ships66.com/maps/one/{z}/{x}/{y}.png
```

### 3.2 后端（tile-proxy 仓库 + vpn 部署副本，两份同步）

| 文件 | 改动 |
|---|---|
| `domains/tiles/routes_passthrough.py` | 删除 `# 专用海图代理` 整段（69 / 70 行）与随之失效的 `from config import get_str` |
| `domains/tiles/__init__.py` | 模块文档串去掉 `+ ships66` |
| `docs/configuration.md` | 删除 `SHIPS66_TILE_URL_TEMPLATE` 配置行 |
| `.env.example` | 删除该变量示例 |

删除后该文件只剩一条路由：`@router.get("/proxy/{target_url:path}")`。

### 3.3 部署面（vpn.negiao.cn）

| 文件 | 改动 |
|---|---|
| `src/backend/ops/tile-proxy.service` | 移除 `Environment=SHIPS66_TILE_URL_TEMPLATE=...` 及三行注释 |
| `src/backend/ops/nginx-vpn.negiao.cn` | 移除 `location /tiles/`（今日刚加，端点下线后即无用） |

---

## 四、修改原因

1. **减少失效面**：专用端点需要 4 处配置协同，任一漏配即静默失效；通用代理只需 1 处（上游 URL 由前端给出）。
2. **消除死代码**：`backendTilesUrl()` 在全仓仅 ships66 使用，删除后不留指向已下线端点的 helper。
3. **不改协议语义**：通用代理原样透传 `http://` 上游，与专用端点行为一致（实测同为 `image/png`）。

---

## 五、影响范围

| 维度 | 是否受影响 | 说明 |
|---|---|---|
| 船舶网底图 | 是 | 路径从 `/tiles/ships66/...` 改为 `/proxy/http://g3.ships66.com/...` |
| 其他底图 | 否 | 通用代理路由未改动 |
| 其他 `/tiles/*` 用途 | 无 | 全仓无其它 `/tiles/` 调用点（已 grep 确认） |
| 后端路由表 | 是 | 减少 1 条路由 |
| 部署面 | 是 | nginx 减少 1 个 location、systemd 减少 1 个 env |
| 缓存 | 是（良性） | 新路径与旧路径不同，不存在旧缓存命中问题 |
| 构建 | — | 4401 modules 通过 |

---

## 六、性能指标

| 指标 | 数值 |
|---|---|
| 通用代理单瓦片耗时（公网，3 次） | 0.47s / 0.42s / 0.47s |
| 源站直连 | 0.15s |
| 经本机 nginx | 0.14s |

多一跳 `/proxy/` 路由匹配，开销可忽略（同一 FastAPI 进程内）。**未做长时压测**。

---

## 七、测试方案

### 7.1 Agent 已执行

| 项目 | 命令 / 方式 | 结果 |
|---|---|---|
| 通用代理可用性 | 线上 curl `/proxy/http://g3.ships66.com/...` × 3 | ✅ 3/3 `200 image/png` 4469B |
| 源站直连 | `127.0.0.1:9002/proxy/http://...` | ✅ 200 image/png 0.15s |
| 经本机 nginx | `https://127.0.0.1/proxy/http://...` + Host 头 | ✅ 200 image/png 0.14s |
| nginx 是否合并 `//` | 同上对照 | ✅ 未合并，协议原样透传 |
| Python 语法 | `py_compile`（两份副本） | ✅ OK |
| nginx 括号配平 | 花括号计数 | ✅ 19/19，depth 0 |
| 残留扫描 | `grep ships66\|SHIPS66` | ✅ 代码/配置/文档均 0 |
| 前端类型检查 | `tsc --noEmit` | ✅ 0 error |
| 前端 ESLint | 2 个改动文件 | ✅ 0 problems |
| 前端构建 | `vite build` | ✅ 4401 modules / 15.89s |

### 7.2 待用户验证（前端发布后）

| 步骤 | 预期结果 |
|---|---|
| 1. 发布 V3.6.27 后打开 WebGIS，选「船舶网」底图 | 瓦片正常显示 |
| 2. DevTools → Network 过滤 `ships66` | 请求为 `https://vpn.negiao.cn/proxy/http://g3.ships66.com/maps/one/...`，状态 200 `image/png` |
| 3. 访问旧路径 `/tiles/ships66/5/27/15.png` | 404（端点已下线，符合预期） |

---

## 八、变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/ol/basemap/constants/basemapConfig.ts` | ships66 预设改走通用代理 |
| `frontend/src/config/publicRuntime.ts` | 删除 `backendTilesUrl()` |
| `README.md` / `Docs/Guide/CHANGELOG.md` | 版本与更新日志 |
| `tile-proxy/domains/tiles/routes_passthrough.py` / `__init__.py` | 删除专用路由与文档串 |
| `tile-proxy/docs/configuration.md` / `.env.example` | 删除配置项 |
| `vpn.negiao.cn/src/backend/tile-proxy/**`（副本） | 同上 |
| `vpn.negiao.cn/src/backend/ops/tile-proxy.service` / `nginx-vpn.negiao.cn` | 移除 env 与 location |
| `Docs/LLM_record/26-10/2026-10-25/2026-10-25-ships66-proxy-removal.md` | 本日志（新增） |

---

## 九、遗留与风险

1. **发布顺序**：后端已先下线端点，前端需发布 V3.6.27 才会切到新路径。在两者之间的窗口内，船舶网底图不可用（此前因 Cloudflare 缓存 404 本就不可用，故无实质回归）。
2. **Cloudflare 缓存**：旧路径 `/tiles/ships66/5/27/15.png` 的 404 仍可能被 CF 缓存 7 天；新路径不受影响。
3. **上游仍是 http 明文**：`http://g3.ships66.com` 经通用代理透传，属既有事实，本次未改变；若该域名日后支持 https，改一处 URL 即可。
4. **tile-proxy 仓库未推送**：本次只改了工作区（该仓库的推送流程未确认），vpn 副本已同步删除，二者内容一致。
5. **未做真机底图验证**：需前端发布后确认。
