# 开发约定

> 📌 本文件由根 [README](../../README.md) 的「开发约定」章节拆分而来。返回 [README 首页](../../README.md)。

---

### 强制规范（来自 CLAUDE.md）

1. **每次任务必须创建日志**到 `Docs/LLM_record/yy-mm-dd/yyyy-mm-dd-topic.md`
2. **先写文档，再实施代码改动**
3. **文档单一事实来源（原子化）**：版本记录统一在 [`CHANGELOG.md`](CHANGELOG.md)，架构索引统一在根 [README](../../README.md)；三个 README 不再重复版本记录、架构表、目录树（仅放链接）。**目录树唯一权威**：[project-structure.md](project-structure.md)（根级 + Docs 树）、[frontend-structure.md](frontend-structure.md)（前端）、[backend-structure.md](backend-structure.md)（后端）——任何文件增删改必须同步更新对应 structure 文件
4. **不执行** `git commit` / `git push` —— 版本控制决策权归用户
5. **新功能必须封装**为独立 `.js` / `.ts` 文件，组件内不堆叠业务逻辑
6. **新增代码必须有注释**（功能 / 参数 / 核心逻辑）

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

### 提交前检查

```bash
# Windows: 双击 LocalDev.bat
# 自动启动：
#   - npm install && npm run dev （前端）
#   - docker-compose up （后端）

# 或手动启动
docker-compose up
```

---

#### ✅ 使用者收益

1. **专业地图导出**：生成标准 GeoTIFF，可直接用于 GIS 分析
2. **坐标系无缝支持**：自动纠偏 GCJ-02，避免国内地图叠加偏移
3. **简化部署**：Docker Compose 统一环境，减少配置复杂度
4. **开发体验升级**：LocalDev.bat 一键启动，无需手动配置

---

#### 🔄 兼容性说明

- ✅ **无破坏性变更**：现有功能完全保持
- ✅ **渐进式增强**：新功能可选使用
- ✅ **向后兼容**：旧版本接口仍可用

