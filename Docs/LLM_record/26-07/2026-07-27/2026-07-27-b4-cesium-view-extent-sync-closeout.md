# 2026-07-27 3D 模式属性表视图筛选接通核验收账（规划 P0-4 B4，B 簇全清）

- **日期与时间**：2026-07-27 16:40
- **任务等级**：L2
- **版本**：V3.4.62（写入前经 README/CHANGELOG 双 grep 复核取号；今日并行流水：59 B3 收账 → 60 在线人数 → 61 requestRenderMode P1）
- **执行说明**：与 B1/B3 同模式的「代码先行、收尾中断」遗留——开工核查发现 B4 端到端实现已由前序会话完成
  （模块/容器接线/表格状态提示/结构树登记齐全，甚至存在两个并行会话撞车实现、其一已标弃用），
  但无日志、无版本条目、规划未勾选。本会话职责：①全链静态核验；②确认弃用副本零引用；③补齐全部收尾记录。
  **本次零代码改动**（核验未发现需修缺口）。

---

## 问题分析

### 核心症状（B4 原始登记）

属性表「视图筛选范围」依赖 `attrStore.currentMapExtent`；2D 侧由 OL moveend 喂入，3D 模式此前无人喂入 →
勾选后 currentMapExtent 恒 null，筛选静默不生效（仅有提示）。

### 修复实现核验（前序会话产物，五侧闭环）

| 侧 | 文件 | 核验点 | 结论 |
|---|---|---|---|
| 模块 | `useCesiumAttrViewExtentSync.js` | `camera.moveEnd` 监听 + `start()` 首帧立即推送；`computeViewRectangle`（scratch Rectangle 复用零分配）→ 度值 `[west,south,east,north]` 直写 attrStore；**视域不可解**（望天/地球出视锥，rectangle undefined）与**跨反经线**（west>east，min/max 相交语义失效）诚实写 null 降级；`stop()` 解绑 + 写 null + viewer 销毁竞态 try/catch；工厂注入 getViewer/getCesium、句柄留模块不进响应式，符合功能模块范式 | ✅ |
| 容器 | `CesiumContainer.vue` | 工厂创建（L261）→ `cesiumReady` 后 `start()`（L536）→ `resetCesiumViewerForRetry`（L621）与 `onBeforeUnmounted`（L777）双路径 `stop()`，生命周期无泄漏 | ✅ |
| 表格 | `AttributeTable.vue` | 原「3D 不可用」硬提示改为动态 `viewFilterUnavailable`（勾选中但范围 null → 置灰样式 + tooltip「视图未就绪或相机未对准地表」），复选框不再按引擎门控 | ✅ |
| 归一层 | `useAttrStore.setMapExtent` | 4326 度值直传：`looksLikeWebMercatorExtent`（\|值\|>360 判 3857）对度值恒 false 原样放行，与行侧 extent 归一后同系比较 | ✅ |
| 2D 回喂 | `MapContainer.vue` | 3D 卸载 stop() 写 null 后，OL 侧三路径恢复：地图 init 尾同步（L1548）、勾选 watch（L914）、moveend（bindMapEvents 注入）| ✅ |

与今日 V3.4.61 requestRenderMode P1 的交叉核验：`camera.moveEnd` 为相机事件而非渲染帧事件，
按需渲染开启（现默认关）不影响本链路触发。

### 并行撞车发现（已被前序会话自行处置，本会话仅复核）

同目录曾存在重复实现 `useCesiumAttrExtentSync.js`——两个并行会话各自实现 B4 的撞车产物。
本次收口复核确认：当前文件系统已不存在旧副本，全 src 引用扫描为 **零导入方**，
容器实际接线为 `useCesiumAttrViewExtentSync.js`；结构树已同步为仅保留新名实现。

### 受影响模块

3D（Cesium）相机链路 → 属性表视图筛选；2D↔3D 引擎切换的范围交接。

## 修改内容

本会话零代码改动。补齐收尾四件套（本日志 / CHANGELOG / README 三处 / 规划勾选）。

## 修改原因

B4 为 P0-4 B 簇最后一项；账目不闭合则 B 簇无法关账、V3.5.0 里程碑无法启动判定。

## 影响范围

（实现本身）3D 模式下勾选「视图筛选范围」由"永久提示不生效"变为真实筛选；2D 行为零变化。

## 解决方案

实现方案即规划既定思路（相机变化算视域 rectangle → setMapExtent 4326 直传），
前序会话已按功能模块范式落地；候选方案对比不再重复（无重新选型空间）。
弃用副本处置沿用结构树标注 + 本机删除模式。

## 性能指标

未实测。理论：moveEnd 频率低（交互收尾才触发），scratch Rectangle 复用零逐帧分配，可忽略。

## 测试方案

### Agent 已执行

- 五侧链路静态核验（上表，逐文件读源码）；
- 旧副本 `useCesiumAttrExtentSync.js` 当前文件系统不存在，全 src 引用扫描 = 0；
- ESLint 3 文件零告警（模块 / CesiumContainer.vue / AttributeTable.vue，`node node_modules/eslint/bin/eslint.js` exit 0）；
- 结构树登记核对（camera/ 两行均在，弃用行带删除指引）。

### 待用户实机验证（B4 首次实测清单）

1. 切 3D → 导入矢量数据 → 打开属性表 → 勾选「视图筛选范围」→ 行集按当前视域过滤（修复前恒不过滤）；
2. 拖拽/缩放/flyTo 相机后停稳 → 行集随视域刷新（moveEnd 触发）；
3. 相机拉高望向天空或地平线（视域不可解）→ 复选框置灰态 + tooltip「范围不可用」，行集回退全量（诚实降级不误筛）；
4. 视域横跨 180° 经线 → 同上降级表现（不给出错误筛选结果）；
5. 3D 勾选筛选状态下切回 2D → 短暂「范围不可用」提示，地图任意平移/缩放后恢复 2D 筛选；再切回 3D 首帧即恢复 3D 筛选；
6. 开启 requestRenderMode 总开关（若已放开）后重复步骤 2，确认按需渲染下 moveEnd 仍触发。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `Docs/Guide/CHANGELOG.md` | 追加 V3.4.62 条目 |
| `README.md` | 版本三处 → V3.4.62 |
| `Docs/TODO/bugfix-optimization-plan.md` | P0-4 表 B4 勾选 ✅ V3.4.62；B 簇全清标注 |
| （代码零改动） | — |

## 遗留与风险

- **B 簇（B1–B6）至此全清**（代码侧）。**V3.5.0 里程碑建议在 B1/B3/B4 三份实机清单（4+7+6 步）验证通过后由用户拍板打线**——
  未实测先打里程碑违反「禁止谎报验证」；
- 3D→2D 切换后至首次地图交互前范围为 null（诚实降级有提示，首次 moveend 即恢复）；若期望切回即恢复，
  可在引擎切换处补一次 `syncAttributeTableMapExtent()` 主动调用，属体验润色已记规划（只记不改）；
- 旧副本已清账：当前文件系统不存在 `useCesiumAttrExtentSync.js`，结构树已仅保留实际接线的 `useCesiumAttrViewExtentSync.js`。
