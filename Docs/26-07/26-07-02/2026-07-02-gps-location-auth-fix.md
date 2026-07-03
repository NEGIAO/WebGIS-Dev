# 2026-07-02 GPS 定位授权逻辑修复 + Code Review 修复

## 修改时间
2026-07-02 15:30（初版提交） / 2026-07-03 续修（review 修复）

## 修改内容
重构 URL `loc` 参数从二值 `0/1` 为来源感知标记 `gps` / `ip` / `0`，并修复 review 发现的若干正确性与一致性问题：

1. **来源感知的 `loc` 标记**：`loc` 由 `0/1` 改为 `gps`/`ip`/`0`，向后兼容旧 `loc=1`（`normalizeLocationFlag('1')==='gps'`）
2. **GPS 才写坐标到 URL**：仅用户明确授权 GPS（`source==='gps'`）时，才将坐标编码写入 `p` 并设置 `loc=gps`
3. **IP 定位不泄漏 URL**：IP 定位仅保留全局上下文供内部使用，**不写入 `loc` 与 `p`**，避免粗略坐标进入分享/缓存 URL
4. **GPS 降级保护**：URL 已标记 `loc=gps` 后，后续 IP 回退不得降级覆盖

## 修改原因
原有逻辑存在以下问题：
1. `useUserLocation.js::markLocationSuccessFlagInUrl()` 无论 GPS 还是 IP 定位成功，都无条件设置 `loc=1`
2. `useMapState.js::resolveLocationState()` 允许 IP 定位满足写入 `p` 参数的条件
3. `useMapState.js::parseUrlToState()` 在有 IP 定位上下文时也会解码 `p` 参数
4. `useMapState.js::buildQuery()` 同步 `loc` 和 `p` 的逻辑不严格区分 GPS 和 IP

### Code Review 续修原因（2026-07-03）
初版提交后经多维度 Code Review 发现原实现与"仅 GPS 写 p"的目标仍存在偏差，本次续修：
- **C1（严重）**：`resolveLocationState` 返回的 `hasAuthorizedLocation` 含 `ip`，导致 IP 定位的坐标仍被 `resolvePositionCode` 编码写入 URL `p` 参数——与本次修复目标直接矛盾且构成位置信息外泄
- **M1**：JSDoc 声明返回 `hasGpsAuthorization`，实际返回 `hasAuthorizedLocation`，命名与语义双重不一致
- **M2**：`useUrlParamStore.ts` 内的 `normalizeLocationSource` 与 `normalize.ts::normalizeLocationFlag` 逻辑完全重复，违反单一来源
- **M3**：`HomeView.vue::syncVisitPosCodeToUrl` 仍写旧值 `loc='1'/'0'`，迁移不彻底
- **M4**：`markLocationSuccessFlagInUrl` 缺乏优先级守卫，GPS 标记会被后续 IP 回退降级覆盖为 `loc=ip`

## 影响范围
- 前端定位模块：`useUserLocation.js`
- 前端地图状态管理：`useMapState.js`
- URL 参数规范化工具：`utils/normalize.ts`
- URL 参数 Pinia 仓库：`stores/useUrlParamStore.ts`
- 全局定位上下文：`userLocationContext.js`
- 分享 URL 构造：`components/Shell/TopBar.vue`
- 访问日志 URL 写入：`views/HomeView.vue`
- URL 参数同步机制：`loc` 与 `p` 参数

## 优化解决方案

### 1. `utils/normalize.ts` 新增 `normalizeLocationFlag`
- 统一规范化 `loc` 来源标记，支持 `'gps'|'ip'|'0'`，旧值 `'1'` 兼容映射为 `'gps'`
- 同时新增 `normalizeText`（null/undefined→''，其余 trim）供上下文字段复用

### 2. `useMapState.js::resolveLocationState()`（修复 C1 + M1）
- 返回字段从 `hasAuthorizedLocation`（含 ip）改为 `hasGpsAuthorization`（**仅 `source==='gps'`**）
- 核心逻辑：`hasGpsAuthorization = hasGlobalLocation && globalSource === 'gps'`
- JSDoc 与返回对象字段名、语义完全统一

### 3. `useMapState.js::resolvePositionCode()`（修复 C1）
- 仅当 `hasGpsAuthorization` 为 true 时编码 GPS 坐标到 `p`，`locSource` 固定为 `'gps'`
- 否则返回 `{ code: '0', locSource: '0' }`
- IP 定位不再写入 `p` 与 `loc`，避免坐标泄漏

### 4. `useMapState.js::parseUrlToState()`
- 复用 `resolveLocationState().urlHasLocFlag` 判断（消除原先重复计算）
- 仅当 URL 中 `loc=gps` 或 `loc=ip` 时才解码 `p` 参数

### 5. `useMapState.js::buildQuery()`
- 基于 `resolvePositionCode()` 返回的 `{ code, locSource }` 同步设置 `loc` 和 `p`
- 移除冗余三元 `positionCode = compactPosCode !== '0' ? compactPosCode : '0'`（恒等式）

### 6. `useUserLocation.js::markLocationSuccessFlagInUrl(source)`（修复 M4）
- `source` 仅 `gps`/`ip` 时写入；新增优先级守卫：`currentLoc === 'gps' && source !== 'gps'` 时直接返回，防止 GPS 标记被 IP 回退降级覆盖
- 仅授权定位（GPS/IP）写入 `loc`，IP 同样写 `loc=ip` 但不写 `p`（`p` 由 `resolvePositionCode` 的 GPS 判定控制）

### 7. `userLocationContext.js::hasUrlLocFlag()`
- 改为判断 `loc === 'gps' || loc === 'ip'`（toLowerCase 规范化）

### 8. `stores/useUrlParamStore.ts`（修复 M2）
- 删除本地重复实现 `normalizeLocationSource`，复用 `normalize.ts::normalizeLocationFlag`
- `PendingParams.loc` 类型改为 `'gps' | 'ip' | '0'`；JSDoc 同步更新

### 9. `views/HomeView.vue::syncVisitPosCodeToUrl`（修复 M3）
- `loc` 写入从 `'1'/'0'` 迁移为 `'gps'/'0'`，与 `useUserLocation` 写入口径一致

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\utils\normalize.ts`
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\useMapState.js`
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\useUserLocation.js`
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\services\userLocationContext.js`
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\stores\useUrlParamStore.ts`
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Shell\TopBar.vue`
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\views\HomeView.vue`

## 测试方案
1. **GPS 定位授权场景**：用户点击定位按钮授权成功 → 验证 URL 中 `loc=gps` 且 `p=非零编码`
2. **IP 定位场景**：用户拒绝 GPS 授权，回退到 IP 定位 → 验证 URL 中 `loc=ip`（但 `p=0`），IP 坐标**不进入 URL**，仅全局上下文有 IP 信息
3. **GPS 降级保护**：URL 已 `loc=gps` 后触发 IP 定位 → 验证 `loc` 不被降级为 `ip`
4. **页面刷新恢复**：GPS 授权后刷新页面 → 验证 `loc=gps` 保持，`p` 解码恢复坐标
5. **旧链接兼容**：访问 `loc=1` 的旧分享链接 → 验证被规范化为 `loc=gps` 并正常解码 `p`
6. **无定位场景**：首次访问未定位 → 验证 URL 中 `loc=0`、`p=0`

## 性能指标
- 无性能影响，仅逻辑判断分支调整
- 减少了不必要的 URL 写入操作（IP 定位不再写 `p`）

## 验证结果
- ✅ ESLint：改动 7 文件零报错
- ✅ Vite 构建：`vite build` 通过（25.66s，EXIT=0）
- ⏳ 上述测试方案的浏览器实测场景待人工验证
