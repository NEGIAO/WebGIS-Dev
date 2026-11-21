# 2026-11-21 移除前端启动关键路径上的第三方 IP 服务依赖（api.ipify.org）

- **日期与时间**：2026-11-21 19:20
- **任务等级**：L2（Bug 修复 / 可用性）
- **版本**：V3.7.6（归并批次 D）

## 问题分析

### 核心症状

用户实机截图：启动请求链 `webgis.negiao.cn/` → `assets/index-*.js` → `https://api.ipify.org/?format=json` 报 **`net::ERR_BLOCKED_BY_CLIENT`**（广告拦截插件对 ipify 的普遍封禁），并伴随「国内用户无法正常使用站点」的反馈。

### 根本原因

`client.ts` 的 axios 请求拦截器在**每个**后端请求的临界路径上 `await getPublicIp()`——前端经第三方服务 `api.ipify.org` 取公网 IP 后以 `X-Client-IP` 自报给后端。三类问题：

1. **被拦截即报错**：uBlock / AdGuard 等按 EasyPrivacy 名单普遍封禁 ipify，所有用户常驻一条红色失败请求；
2. **国内时延放大**：ipify 国内访问慢/不稳，30s 负缓存过期后每 30s 的首个请求**空等 3s 超时**，登录/统计/聊天全链路被拖慢；
3. **自报值无安全价值**：后端 `_extract_client_ip` 文档明示「不是信任边界」（`constants.py:397`），IP 维度登录节流以账号为主、IP 仅次级。

### 受影响模块

`frontend/src/api/backend/client.ts`（ipify 获取 + 拦截器附加）、`frontend/src/domains/common/map-view/useUserLocation.ts`（两处 `await getPublicIp()` 预热）。后端 `_extract_client_ip` 读取优先级 `X-Client-IP → XFF → X-Real-IP → client.host`，**无任何硬依赖**；V3.7.6 批次 A 的游客桶派生已改用 XFF 末跳，同样不依赖自报头。

## 解决方案

**彻底移除前端 ipify 依赖**（候选对比：保留但 fire-and-forget 会让「IP 国别/IP 定位」的就绪语义复杂化，且第三方依赖与拦截报错依旧存在 → 否决）：

- 删除 `getPublicIp` 及其缓存/预热/导出；拦截器不再发送 `X-Client-IP`；
- `useUserLocation` 两处预热删除；
- 公网 IP 语义转由后端 `_extract_client_ip` 回落 **XFF（HF 反代追加的真实末跳）** 承担——展示、审计、IP 国别判定（`/api/location`）、高德 IP 定位全部更准（真实值优于可伪造的自报值）且零第三方依赖；
- 已知退化：本地直连后端开发（无反代）时 `request.client.host` 为回环地址，IP 国别/定位退化为 unknown，属预期。

## 修改内容

1. **fix**：`client.ts` 移除 ipify 获取链与拦截器 `X-Client-IP` 附加，留注释说明替代语义。
2. **fix**：`useUserLocation.ts` 删除两处 `await getPublicIp()` 预热与 import。

## 影响范围

前端请求拦截器（每请求少一次第三方 await）、IP 定位/国别判定链路；后端零改动（header 本就可选）。

## 性能指标

未实测。预期：移除「每 30s 首请求 +3s ipify 超时」的周期性卡顿源；被广告插件拦截的红色请求消失。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `eslint`（2 文件）→ 0 problems；`vue-tsc --noEmit` → 0 错误；全仓无残留功能性 `ipify/getPublicIp/X-Client-IP` 引用（仅存说明注释） | ① 装 uBlock 的浏览器打开站点 → Network 不再出现 ipify 请求与红色 canceled/blocked 行；② 管理面板「在线统计/IP 展示」与登录节流行为正常（后端走 XFF）；③ 侧栏 IP 定位、语言/国别自适应（isDomestic）在生产环境正常 |
| 后端兼容性静态核验：`X-Client-IP` 全部消费点均有 XFF/client.host 回落（throttle.py 明示 IP 仅次级约束） | ④ 高德 IP 定位在生产返回真实城市（走 HF 反代 XFF） |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/api/backend/client.ts` | 删 ipify 链与拦截器附加块 |
| `frontend/src/domains/common/map-view/useUserLocation.ts` | 删两处预热与 import |
| `Docs/Guide/CHANGELOG.md` | V3.7.6 归并条目追加 D 批 |
| `Docs/TODO/bugfix-optimization-plan.md` | 「HF 国内不可达」L3 项补记 ipify 依赖已移除 |
| `Docs/LLM_record/26-11/2026-11-21/2026-11-21-remove-ipify-critical-path.md` | 本日志 |

## 遗留与风险

1. **「国内无法访问」的主因未解**：HF Space 后端（`*.hf.space`）国内可达性差是 bugfix-plan 已登记的 **L3 决策项**（多活 / 国内中转 / 游客只读降级，涉部署面与预算）——本修复只摘除了前端自加的第三方依赖，后端可达性需用户拍板方案后另行立项。
2. 本地直连开发时 IP 国别/IP 定位退化为 unknown（生产不受影响）。
3. 若未来某端点确需客户端自报 IP（现无），须重新评估伪造面。
