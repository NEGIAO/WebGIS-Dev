# 2026-07-26 属性表稳定要素 ID：兜底 ID 写回要素本体（修复规划 P0-4 B1）

- **日期与时间**：2026-07-26 21:30
- **任务等级**：L2
- **版本**：V3.4.56（📌 2026-07-27 对账修正：原记 V3.4.54 与「前端加载性能」会话撞号且未入 CHANGELOG，按 §5 顺延补录为 V3.4.56。初记 V3.4.53 亦曾与并行会话撞号）
- **执行说明**：本任务跨两个会话完成——前一会话完成分析与代码实施后在 ESLint 验证阶段因会话限额中断；本会话核验改动完整落盘、补跑验证并收尾全部记录（README 三处 / CHANGELOG / 本日志 / 规划勾选）。

---

## 问题分析

### 核心症状

无稳定 id 的图层（属性里没有 OBJECTID/FID 等标识字段、导入时也未 `setId`）打开属性表后：

1. 按任意列**排序 / 搜索筛选 / 数据刷新**导致行序变化，再点选某行时，地图上的**高亮与缩放定位落到别的要素**；
2. 同一要素在不同快照重建轮次持有不同 featureId，选中态跨重建漂移。

### 根本原因

旧实现的 featureId 解析只查平面属性（裸 OL Feature 的 `getId()`/`get('_gid')` 访问器候选缺失），查不到就用 `feature_${index}` **行序兜底**——ID 绑定的是"行的位置"而不是"要素本身"：

- 行序一变，同一要素解析出不同 ID；同一 ID 指向不同要素 → 选中/高亮错位；
- 该索引 ID 只存在于属性表快照行上，**map 侧（`getFeatureById` / `_gid` 扫描）无法反解**，
  这类数据的属性表 → 地图高亮/缩放链路整体不可达；
- 另有隐患：`useAttrStore` 维护了一份本地 toFeatureId 索引兜底副本，与归一化模块各自为政，回退顺序有漂移风险。

### 受影响模块

属性表数据链（`useAttrStore` 行构建）、图层元数据归一化（`useLayerMetadataNormalization`）、要素高亮/缩放消费链（`featureStyleStore` / `useManagedFeatureHighlight` 按 featureId 寻要素）。

## 修改内容

1. **稳定 ID 单点收敛**（`useLayerMetadataNormalization.js`）：
   - 新增 `readExistingFeatureId(feature)`：候选链 `getId()` → `get('_gid')` → `get('id')` → 平面 `id`/`_gid` → `properties._gid`/`id`/`OBJECTID`/`FID`/`objectid`/`fid`；判空用 `??` 而非 `||`，保 `OBJECTID=0` 合法，与 map 侧语义对齐；
   - 新增 `ensureStableFeatureId(feature, index)`：已有 ID 直接返回；缺失则生成 `gid_<时间戳36>_<模块级自增>_<随机段>`（图层内外均唯一）并**写回要素本体**——OL Feature 走 `set('_gid', id, true)`（第三参 silent，避免归一化过程触发要素 change 事件）+ `setId`（供 `getFeatureById` O(1) 命中）；普通对象直写 `_gid` 并镜像 `properties._gid`（属性展开类浅重建后 ID 仍存活）；冻结/密封对象等不可写场景退回 `feature_${index+1}`（行为不劣于修复前）；
   - 快照行 `id`/`featureId` 构建改走上述稳定 ID；`ensureStableFeatureId` 加入工厂导出。
2. **store 侧替换**（`useAttrStore.ts`）：删除本地 toFeatureId 索引兜底副本，`buildLayerDataset` 行构建改用归一化模块导出的 `ensureStableFeatureId`。

## 修改原因

B1 是属性表 B 簇（P0-4）中仅剩的"联测类"高危项之一：错位选中直接误导用户对数据的判断；且 B 簇全清是 V3.5.0 里程碑的验收前提。

## 影响范围

属性表全部行构建路径（含 revision 快路径失效后的慢路径重建）、属性表 → 地图选中/高亮/双击缩放链路、无 id 数据源（拖拽导入 GeoJSON/KML/SHP 等）的要素定位能力。**不改**：有稳定 id 数据的解析结果（候选链优先返回既有 ID，零行为变化）。

## 解决方案

### 候选方案对比

| 方案 | 说明 | 结论 |
|------|------|------|
| a. 首次分配后写回要素本体（选定） | ID 与要素绑定、行序无关；map 侧可经 `getFeatureById`/`_gid` 反解；与导入侧 `ensureFeatureId` 的 setId+`_gid` 约定同构 | ✅ |
| b. 属性内容哈希作 ID | 无需写回，但属性重复的要素撞 ID；纯几何编辑（属性不变）无法区分；每轮重建全量哈希有性能成本 | ✖ |
| c. 快照内 Map 缓存 feature→id | 不落要素本体；但 revision 契约要求内容变更**整体重赋值** `item.features`，引用一变缓存即失效，与既有契约冲突 | ✖ |

### 实施要点

- 写回策略与导入侧 `useManagedFeatureSerialization.ensureFeatureId`（setId+`_gid`）**同构**，且补齐了普通对象（GeoJSON-like 记录）的持久化——导入侧只写 OL 实例；
- 三方回退顺序核验一致：归一化 `readExistingFeatureId` ↔ 序列化 `ensureFeatureId` ↔ map 侧 `featureKey.getFeatureIdFromFeature`（getId → `_gid` → id），同一要素在任意位置解析出同一 ID。

## 性能指标

未实测（功能性修复）。理论开销：已有 ID 数据仅多一次候选链读取；无 ID 数据首轮各写回一次，后续轮次直接命中候选链首段。

## 测试方案

### Agent 已执行

- 改动 2 文件 ESLint 零告警：`node node_modules/eslint/bin/eslint.js`（沙盒直呼 bin）exit 0；
- 全 src grep：本地 toFeatureId 副本零残留（仅存 store 内注释提及）；`ensureStableFeatureId` 定义/导出/导入三处闭环；
- 归一化 / 序列化 / featureKey 三方 ID 约定静态比对一致（候选顺序与写回字段）。

### 待用户实机验证

1. 导入一份**无 id/OBJECTID 属性**的 GeoJSON → 打开属性表 → 按任意列排序 → 点选行 → 地图高亮与双击缩放定位到同一要素（修复前会错位）；
2. 反复切换排序/搜索后再点选，选中行与地图高亮保持一致、选中态不跨重建漂移；
3. 带 OBJECTID/FID 数据回归：选中/高亮/缩放行为与修复前一致；
4. 几何编辑触发 revision 重建后，原选中要素的高亮不跳变。

## 变更文件清单

| 文件 | 说明 |
|------|------|
| `frontend/src/composables/map/features/useLayerMetadataNormalization.js` | 新增 `readExistingFeatureId` 候选链 + `ensureStableFeatureId` 生成写回；快照行 ID 改走稳定 ID；工厂导出补齐 |
| `frontend/src/stores/useAttrStore.ts` | 删除本地 toFeatureId 索引兜底副本，改用归一化模块 `ensureStableFeatureId` |
| `README.md` | 版本三处 → V3.4.54 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.4.54 条目 |
| `Docs/TODO/bugfix-optimization-plan.md` | P0-4 表 B1 勾选 ✅ V3.4.54；执行顺序 Sprint 2 行同步（B1/P1-1/P1-2 标注） |

## 遗留与风险

- **实机联测未做**（沙盒无 vite 运行时），已列入上方待用户验证四步；B 簇余 B3（Shift range 透传实测）/ B4（3D 视域筛选），全清后打 V3.5.0；
- 冻结/密封对象的退化路径仍是索引兜底（等同修复前行为，不劣化）；
- **顺带发现（非本任务范围，未改动）**：CHANGELOG 缺 `V3.4.48` 与 `V3.4.52` 两条目（README 版本表已有 V3.4.52 行，简介/页脚亦曾推进到 V3.4.52）——疑似并行会话未收尾留下的记录空洞，待认领会话补记或用户定夺；
- V3.4.46 合并收尾遗留的用户侧 git 操作仍待执行：`git rm Docs/TODO/next-sprint-bugfix-and-optimization.md Docs/TODO/next-session-prompt.md`。
