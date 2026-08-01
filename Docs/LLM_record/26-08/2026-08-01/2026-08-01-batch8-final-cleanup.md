# Batch 8: 剩余 MEDIUM + 收尾

- **日期与时间**: 2026-08-01 22:10
- **任务等级**: L2
- **问题分析**:

## 核心症状
Code Review 剩余 MEDIUM 优先级问题：
1. `basemapConfig.ts` 散落 `import.meta.env` 直接读取 + 硬编码 token（违反 SSOT 原则）
2. `preferred_model` 未校验可用模型列表（注入风险）
3. `/ipapi/country` 端点缺少 IP 格式校验
4. `useMapSwipeTest.ts` 和 `CesiumContainer.vue` 的 console 语句未全部 DEV-gated
5. `ChatPanelContent.vue` 静默 catch 缺少注释说明

## 根本原因
- 前端 Token 读取未遵循 Force_command.md 规定的 `publicRuntime.ts` 单一入口
- 后端用户偏好模型直接写入数据库前未做候选集校验
- 部分 console 语句遗漏 DEV 守卫

## 受影响模块
- 底图配置链路（basemapConfig.ts）
- Agent 用户偏好（agent_chat/routes.py）
- IP 定位代理（external_proxy.py）
- 测试工具（useMapSwipeTest.ts）
- Cesium 启动（CesiumContainer.vue）

## 候选方案对比

| 方案 | 优点 | 缺点 | 选定 |
|------|------|------|------|
| A. 保持散落 import.meta.env + 变量引用 | 改动最小 | 违反 SSOT，未来新增 token 仍需直接读 env | ❌ |
| B. 统一收口至 publicRuntime.ts | 符合规范，单一真相源 | 需修改 import 路径 + 变量名 | ✅ |

选定方案 B：统一收口至 `publicRuntime.ts`（已有 `MAPBOX_ACCESS_TOKEN`/`MAPTILER_KEY`/`GEOVISEARTH_TOKEN` 导出）。

---

## 修改内容

### 1. basemapConfig.ts — Token 统一收口
- 删除本地 `const MAPBOX_TOKEN/MAPTILER_KEY/GEOVISEARTH_TOKEN` 三个变量声明（直接 import.meta.env 读取）
- 改为从 `@/config/publicRuntime` 导入 `MAPBOX_ACCESS_TOKEN`/`MAPTILER_KEY`/`GEOVISEARTH_TOKEN`
- 所有 12 处硬编码 token URL 统一使用模板变量 `${MAPBOX_ACCESS_TOKEN}` 等
- 文件头注释更新为「禁止直接 import.meta.env」

### 2. agent_chat/routes.py — preferred_model 注入防护
- `update_user_model_preference` 中添加校验逻辑
- 从 `system_config` 表读取可用模型列表（`CONFIG_KEY_AVAILABLE_MODELS`）
- 如果配置了可用列表且用户偏好不在其中，返回 400

### 3. external_proxy.py — IPAPI 端点 IP 校验
- `/ipapi/country` 端点添加 `ipaddress.ip_address()` 输入校验
- 校验失败返回 400

### 4. useMapSwipeTest.ts — console 门禁
- 所有 `console.log`/`console.warn` 调用添加 `if (import.meta.env.DEV)` 守卫

### 5. CesiumContainer.vue — console.warn 门禁
- boot 路径的 `console.warn('[Cesium][boot] start', ...)` 添加 DEV 守卫

### 6. ChatPanelContent.vue — 静默 catch 注释
- 空 catch 块添加注释说明 Markdown 加载失败已有纯文本兜底

---

## 修改原因
- **SSOT 合规**: Force_command.md 规定前端禁止散落 `import.meta.env.VITE_*`，唯一入口为 `src/config/publicRuntime.ts`
- **安全加固**: `preferred_model` 直接写入 DB 无校验，攻击者可注入任意模型名
- **输入校验一致性**: 其他 IP 端点已校验，`/ipapi/country` 遗漏
- **生产环境清洁**: console 语句应在生产构建中完全消除

---

## 影响范围
- 底图配置链路（basemapConfig.ts → publicRuntime.ts）
- Agent 用户偏好存储（agent_chat/routes.py）
- IP 定位代理服务（external_proxy.py）
- 测试工具输出（useMapSwipeTest.ts）
- Cesium 启动日志（CesiumContainer.vue）

---

## 解决方案
详见「修改内容」章节。

---

## 性能指标
无性能相关改动，不适用。

---

## 测试方案

### Agent 已执行
- ✅ `python CheckConfigRegistry.py` — 全部通过（F1 前端散落 import.meta.env: 通过）
- ✅ `python CheckStructureTree.py` — 通过（416 文件 0 漂移）
- ✅ 确认 `publicRuntime.ts` 已导出 `MAPBOX_ACCESS_TOKEN`/`MAPTILER_KEY`/`GEOVISEARTH_TOKEN`
- ✅ 确认 `basemapConfig.ts` 无剩余 `import.meta.env` 直接读取
- ✅ 确认所有 `${MAPBOX_TOKEN}` 变量引用已更新为 `${MAPBOX_ACCESS_TOKEN}`

### 待用户实机验证
1. 启动前端 dev server，验证底图加载正常（Mapbox/MapTiler/GeoVisEarth 图层应正常显示）
2. 验证环境变量覆盖生效：设置 `VITE_MAPBOX_ACCESS_TOKEN=test` 后对应图层 URL 应包含 `test`
3. 验证 preferred_model 防护：调用 `POST /api/agent_chat/user/model-preference` 传入不在可用列表的模型名，应返回 400
4. 验证 IPAPI 端点：`GET /api/proxy/ipapi/country?ip=invalid` 应返回 400

---

## 变更文件清单
| 文件 | 说明 |
|------|------|
| `frontend/src/domains/ol/basemap/constants/basemapConfig.ts` | Token 统一收口至 publicRuntime，消除散落 import.meta.env |
| `backend/api/agent_chat/routes.py` | preferred_model 注入防护 |
| `backend/api/external_proxy.py` | /ipapi/country IP 格式校验 |
| `frontend/src/domains/ol/composables/useMapSwipeTest.ts` | console 语句 DEV 门禁 |
| `frontend/src/domains/cesium/components/CesiumContainer.vue` | boot console.warn DEV 门禁 |
| `frontend/src/domains/common/chat/components/ChatPanelContent.vue` | 静默 catch 注释补充 |
| `README.md` | 版本号 V3.5.11 → V3.5.12（3 处） |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.5.12 条目 |

---

## 遗留与风险
- **Batch 6 组件拆分**（L3 任务）未执行，需单独方案批准：
  - CesiumToolPanel.vue (2701行)
  - TOCPanel.vue (2493行)
  - MapContainer.vue (2383行)
  - RegisterView.vue (2342行)
  - HomeView.vue (2115行)
- basemapConfig.ts 中的 token 默认值仍硬编码在代码中（publicRuntime.ts 同理），生产环境应通过 `.env` 覆盖

---

## 下一步
- 若继续进行组件拆分（Batch 6），请先制定拆分方案并获得批准
- 建议将 publicRuntime.ts 中的 token 默认值移至 `.env.example` 管理，彻底消除代码中的 token 明文
