# 开发约定

> 📌 本文件由根 [README](../../README.md) 的「开发约定」章节拆分而来。返回 [README 首页](../../README.md)。

---

### 强制规范（摘要）

> ⚠️ **完整权威版本见 [`Docs/Force_command.md`](../Force_command.md)**（含任务分级、硬边界禁止清单、DoD 完成清单、会话交接块格式）。
> 本节仅为速查摘要，**冲突时以 Force_command.md 为准**；本节内容变动必须与其同步。

1. **先定级再动手**：L0 咨询（只读）/ L1 微改（≤20 行单文件）/ L2 常规（默认，全流程）/ L3 架构级（**须先批准方案再施工**）
2. **先写文档，再实施代码改动** —— 分析结论（症状 → 根因 → 影响模块 → 方案选型）先落文档
3. **每次 L2/L3 任务必须创建日志**到 `Docs/LLM_record/YY-MM/YYYY-MM-DD/YYYY-MM-DD-topic.md`（唯一合法路径形式，历史旧写法不迁移）
4. **文档单一事实来源（原子化）**：版本历史统一在 [`CHANGELOG.md`](CHANGELOG.md)，架构索引统一在根 [README](../../README.md)；三个 README 不重复版本记录、架构表、目录树（仅放链接）。**目录树唯一权威**：[project-structure.md](project-structure.md)（根级 + Docs 树）、[frontend-structure.md](frontend-structure.md)（前端）、[backend-structure.md](backend-structure.md)（后端）——任何文件增删改必须同步更新对应 structure 文件
5. **版本号 = 每个 L2/L3 任务 +1 修订号**，同日不合并；根 README **三处**（项目简介行 / 版本表首行 / 页脚）必须同步，格式恒为 `V{主}.{次}.{修订}`
6. **不执行任何 Git 写操作**（`commit` / `push` / `stash` / `reset` / 切分支）—— 版本控制决策权归用户
7. **不在 `/Docs` 外新建说明类文档**；不改 `.env` / `.env.production` / `.github/workflows/` 等密钥与部署面（只提建议）
8. **不臆造、不谎报**：API 签名 / 字段 / 配置 key / 路径必须读代码确认，未确认标 `⚠️ 未验证`；未实机运行不得写"已测试通过"
9. **新功能必须封装**为独立 `.js` / `.ts` 文件，组件内不堆叠业务逻辑（`MapContainer.vue` 等巨型文件只出不进）
10. **新增代码必须有注释**（功能 / 参数 / 返回 / 核心逻辑）
11. **新增配置 key 顺序恒为**：登记根 `.env.example` + `backend/config/catalog.py` → 再写读取代码 → 跑门禁

### 分层边界

| 层 | 职责 | 禁止 |
|----|------|------|
| `components/` | UI 渲染 + 事件 | 业务逻辑 |
| `composables/` | 编排流程 + 地图动作 | 直接操作 store state |
| `stores/` | 状态维护 + 派生 | 依赖 OL / Cesium 类 |
| `utils/` | 纯函数 + 解析 | 副作用 |
| `services/` | 外部 SDK 集成 | UI 逻辑 |

### 坐标系统约定

本项目涉及国内地图服务（高德/天地图）与全球标准（OpenLayers/Cesium/Nominatim），遵循以下统一规则：

```
前端 UI/组件/Composable —— 始终使用 WGS-84
         ↓
  前端 API 包装层 (frontend/src/api/)
    ├─ geocoding.js              —— WGS-84 in, WGS-84 out（内部 wgs84ToGcj02 → AMap → gcj02ToWgs84）
    ├─ backend/location.js       —— WGS-84 in, WGS-84 out（同上）
    ├─ locationSearch.js         —— 高德 POI 搜索结果的 GCJ-02 坐标自动转 WGS-84
    └─ map.js / amapAoiParser / universalAmapParser —— AOI/详情 GCJ-02 自动转 WGS-84
         ↓
  后端代理 (external_proxy.py) —— 透传，不转换
         ↓
  后端服务端点 (location.py)    —— 调用高德前做 wgs2gcj 转换
         ↓
  高德 API                    —— 始终接收/返回 GCJ-02
```

**核心原则**：
1. 前端所有组件、Composable、Store 统一使用 **WGS-84**（OpenLayers `toLonLat`/`fromLonLat` 产出/消费的就是 WGS-84）
2. WGS-84 ↔ GCJ-02 转换仅发生在 **调用高德 API 的前一刻**（前端 API 包装层或后端服务端点），对上层代码完全透明
3. 天地图接受 WGS-84、Nominatim 使用 WGS-84，无需转换
4. 用户手动输入坐标时可通过 `crsType` 参数指定输入坐标系（wgs84/gcj02），系统自动转换后以 WGS-84 进入内部管线
5. 瓦片图层通过后端 `/proxy/gcj2wgs/` 纠偏代理将高德 GCJ-02 瓦片实时转为 WGS-84 瓦片

### 提交前检查（门禁）

**两个门禁脚本为收尾必过项**（`LocalDev.bat` 启动时会自动跑一遍，改动收尾需手动复跑确认）：

```bash
python CheckStructureTree.py     # 结构树漂移：磁盘文件 vs frontend-structure.md 双向 diff
python CheckConfigRegistry.py    # 配置登记：禁裸读 env / key 必须登记 catalog + .env.example
```

脚本非零退出即视为未通过，**必须修到通过或明确说明原因**，禁止无视。完整 DoD 清单见 [`Force_command.md` 第 7 节](../Force_command.md)。

```bash
# 本地启动 —— Windows: 双击 LocalDev.bat
#   自动：生成根 .env → 跑上述门禁 → docker-compose up（后端）+ npm run dev（前端）

# 或手动启动
docker-compose up
```

---

## 相关文档

| 文档 | 内容 |
|---|---|
| [`Docs/Force_command.md`](../Force_command.md) | **Agent 强制执行规范**（权威版）：任务分级、硬边界、SOP、SSOT、DoD、交接块 |
| [`Docs/Example_prompt.md`](../Example_prompt.md) | 任务启动提示词模板（Bug / 功能 / 重构 / 审计四类） |
| [`handover.md`](handover.md) | 接手必读：文档地图、架构速览、代码坐标、坑清单 |
| [`dev-guide.md`](dev-guide.md) | 新增页面 / API 的标准流程与代码风格 |

