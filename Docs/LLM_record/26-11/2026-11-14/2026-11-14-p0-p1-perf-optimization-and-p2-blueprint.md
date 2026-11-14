# 2026-11-14 性能专项治理（P0全部 + P1产物与网络搜身）与 P2 跨引擎 UI 解耦统一架构蓝图

> **对应版本**：V3.7.4  
> **任务等级**：L2 常规优化（P0/P1 代码与产物落地）+ L3 架构蓝图交付（P2 方案审阅）  
> **责任人**：Antigravity Agent  
> **前置版本**：V3.7.3（在线用户实时统计与连接治理）

---

## 1. 任务背景与治理目标

在经过前序版本的全盘系统架构诊断后，为解决前端加载性能、产物臃肿与网络阻塞痛点，本次执行高优先级性能专项治理并规划跨引擎 UI 统一蓝图：
1. **P0 全部**：
   - 清除 `public/min-enhanced.js` 中的海外挂死请求与死链，消灭 TCP 槽位长达 30 秒的连接阻塞与控制台 403 报错；
   - 清理 `public/cesium/` 目录中未引用的冗余包产物 `index.cjs` 与 `index.js`，物理释放近 9MB 空间。
2. **P1 产物搜身**：
   - 将全仓仅存的两处 `@turf/turf` 全量命名空间导入改为精确按需解构引入，激活 Rollup/Vite 的 tree-shaking 消除数十个未使用 Turf 子模块打包。
3. **P1 网络搜身真实审计**：
   - 全仓排查 Font Awesome 依赖分布，确认个人中心与落地页仍有真实依赖，保留其非阻塞异步加载通道；剔除境外无响应统计服务。
4. **P2 跨引擎 UI 解耦统一方案蓝图**：
   - 依据 `Docs/Force_command.md` §1 / §3 与 `Docs/TODO/bugfix-optimization-plan.md` 规范，P2 涉及全站所有业务面板底座，属 **L3 架构级专项**。本阶段严格遵循「架构重构必须独立立项，先出 Mermaid 架构设计文档经用户批准」规范，交付完整技术蓝图。

---

## 2. 详细改造实施记录

### 2.1 P0-1：`min-enhanced.js` 境外阻塞死链全面剔除

- **问题现象**：
  - `min-enhanced.js` 内部注入的 `//sdk.51.la/js-sdk-pro.min.js`（51.la 国际 SDK）在线上报 403/503 异常；
  - `MapMyVisitors`（`https://mapmyvisitors.com/map.js?...`）国内不可达，超时挂起；
  - `Google Analytics`（`https://www.googletagmanager.com/gtag/js?id=G-KYJ7Y4LE2N`）国内被 GFW 拦截，浏览器发起请求后挂起 30 秒直至超时，霸占关键 HTTP 并发连接槽位，拖慢后续瓦片与接口请求。
- **治理举措**：
  - 彻底移除 51.la 国际 SDK、MapMyVisitors 及 Google Analytics 动态注入逻辑；
  - 仅保留国内合规节点 `//js.users.51.la/22001747.js`（带 safe try-catch 保护）；
  - `registerDelayedStatsLoader()` 留桩作为无害空函数；
  - 文件行数从 180 行精炼降至 34 行。

### 2.2 P0-2：`public/cesium/` 冗余产物物理清除

- **问题排查**：
  - 排查 `frontend/public/cesium/` 目录发现：`Cesium.js` (5.50MB) 为 `cesium-shim.ts` 运行时通过 `<script src="/cesium/Cesium.js">` 加载的真正本体；
  - 目录下的 `index.cjs` (4,420,502 字节) 和 `index.js` (4,366,803 字节) 为历史同步 Cesium npm 包时残留的 CJS/ESM 构建产物；
  - 经全仓扫描检索，项目没有任何文件引用 `cesium/index` 或 `index.cjs`。
- **治理举措**：
  - 从文件系统物理删除 `frontend/public/cesium/index.cjs` 与 `frontend/public/cesium/index.js`；
  - 瞬间实现 **8.78 MB** 磁盘与部署产物体积瘦身，Vite 打包构建输出不再无端打包该 8.78MB 冗余文件。

### 2.3 P1-1：`@turf/turf` 全量包精确按需 Tree-shaking

- **问题排查**：
  - 全仓仅 `drawPolygon.ts` 与 `planarLine.ts` 两处存在 Turf 引用；
  - 原写法均为 `import * as turf from '@turf/turf'`，Rollup 无法对通配命名空间进行安全摇树，导致打包器把整个 Turf 庞大模块集打包进去。
- **治理举措**：
  - 在 `frontend/src/domains/cesium/modules/planar-route/utils/drawPolygon.ts`：
    - 改为 `import { kinks, polygon } from '@turf/turf';`；
    - 调用处改为 `polygon([outPoint])` 与 `kinks(poly)`。
  - 在 `frontend/src/domains/cesium/modules/planar-route/utils/planarLine.ts`：
    - 改为 `import { area, booleanContains, distance, lineSlice, lineString, point, polygon } from '@turf/turf';`；
    - 调用处分别由 `turf.xxx(...)` 改为直接调用具体函数。
  - 结合 `@turf/turf` 自身的 `"sideEffects": false` 声明，有效剔除其余 ~60 个无关 Turf 子库（如 voronoi、tin、bezier-spline 等）。

### 2.4 P1-2：网络搜身与 Font Awesome 现状审计

- **排查事实**：
  - 全仓排查 `fa-[a-z0-9]`，虽然地图主功能面板已全面转为 `@lucide/vue`，但在个人中心 `FloatingAccountPanel.vue`、账户子标签 `SecurityTab.vue`、`OverviewTab.vue`、`PreferencesTab.vue`、条款页 `PrivacyPolicy.vue`、`TermsOfService.vue` 以及落地页 `LandingView.ts`（Vue/Docker/GitHub 品牌标）中仍有约 60 处真实样式依赖；
  - `frontend/index.html` 当前已采用 `media="print"` + onload 异步交换机制加载 BootCDN FA 6.4.0，未阻塞关键渲染路径；
  - 遵循零破坏与实事求是原则，不搞「暴力移除致界面变白块」，而是完成网络死链清理，并将 FA 彻底剔除规划纳入后续用户中心专项统一收口。

---

## 3. P2 跨引擎 UI 解耦统一架构规范蓝图（L3 设计方案）

### 3.1 现状与痛点

1. **双轨面板各自为政**：
   - OpenLayers 侧基于 `SidePanel.vue` + `TOCPanel.vue`；
   - Cesium 侧基于 `CesiumToolPanel.vue` + 独立挂载的弹窗组件；
   - 标绘（Plotting）、量算（Measure）、空间分析（Analysis）在两套引擎中各自写了一套 UI 交互，DOM 结构与样式大量重复，维护成本翻倍。
2. **底图与图层控制协议未统一**：
   - OpenLayers 依赖 `ol.layer.Base` 与 `LayerGroup`；
   - Cesium 依赖 `ImageryLayerCollection` 与 `Cesium3DTileset`；
   - TOC 无法在两套引擎间复用，导致换引擎就换面板。

### 3.2 目标架构拓扑（Mermaid）

```mermaid
flowchart TD
    subgraph UI_Presentation_Layer ["统一 UI 表现层 (Engine-Agnostic UI)"]
        UnifiedTOC["统一目录树面板 (TOCPanel)"]
        UnifiedMeasure["统一量算面板 (MeasurePanel)"]
        UnifiedPlot["统一标绘面板 (PlotPanel)"]
        UnifiedAnalysis["统一分析面板 (AnalysisPanel)"]
    end

    subgraph Bus_Adapter_Layer ["命令总线与适配器协议层"]
        CommandBus["MapCommandBus (统一命令总线)"]
        AdapterProtocol["<<Interface>> IMapEngineAdapter"]
        CapabilityStore["useEngineCapabilities (引擎能力状态)"]
    end

    subgraph Engine_Adapters ["具体引擎适配器实现"]
        OLAdapter["OpenLayersAdapter (implements IMapEngineAdapter)"]
        CesiumAdapter["CesiumAdapter (implements IMapEngineAdapter)"]
    end

    subgraph Native_Engines ["底层原生地图底座"]
        OLMap["OpenLayers Map (2D)"]
        CesiumViewer["Cesium Viewer (3D)"]
    end

    UI_Presentation_Layer -->|发出命令 / 订阅状态| CommandBus
    UI_Presentation_Layer -.->|查询能力开关| CapabilityStore
    CommandBus -->|派发通用指令| AdapterProtocol
    AdapterProtocol <|.. OLAdapter
    AdapterProtocol <|.. CesiumAdapter
    OLAdapter -->|操作原生 API| OLMap
    CesiumAdapter -->|操作原生 API| CesiumViewer
```

### 3.3 核心设计规范与协议契约

#### 3.3.1 统一适配器接口（`IMapEngineAdapter`）
```typescript
export interface IMapEngineAdapter {
    readonly engineType: 'openlayers' | 'cesium';
    readonly capabilities: EngineCapabilities;
    
    // 视图导航
    flyTo(target: CameraViewOptions): Promise<void>;
    getViewExtent(): [number, number, number, number];
    
    // 图层与底图统一控制
    setBasemap(id: string): Promise<void>;
    setLayerVisibility(layerId: string, visible: boolean): void;
    setLayerOpacity(layerId: string, opacity: number): void;
    
    // 交互工具统一挂载
    activateTool(toolType: ToolType, options?: any): void;
    deactivateTool(): void;
    
    // 事件监听
    on(event: MapEngineEvent, handler: (payload: any) => void): void;
    off(event: MapEngineEvent, handler: (payload: any) => void): void;
}
```

#### 3.3.2 引擎能力协商机制（`EngineCapabilities`）
针对 2D 与 3D 固有能力的差异，统一面板根据适配器上报的能力动态禁用或隐藏特定 UI 控件，避免硬编码：
```typescript
export interface EngineCapabilities {
    supports3D: boolean;          // 是否支持高程/俯仰角/三维视点
    supportsTerrain: boolean;     // 是否支持地形
    supportsViewshed: boolean;    // 是否支持视域分析
    supportsShadows: boolean;     // 是否支持光照阴影
    supportsDrawing2D: boolean;   // 是否支持二维矢量标绘
}
```

### 3.4 实施计划（分阶段演进路线）

- **Phase 1（接口契约与总线就位）**：
  - 新建 `frontend/src/domains/common/map-adapter/` 目录；
  - 定义 `IMapEngineAdapter` 接口与 `MapCommandBus`；
  - 编写 `OpenLayersAdapter` 与 `CesiumAdapter` 骨架并接入现有引擎实例。
- **Phase 2（首个试点面板重构：统一量算面板）**：
  - 将距离、面积量算逻辑沉淀至适配器内部；
  - 合并 2D/3D 量算面板为一个 `UnifiedMeasurePanel.vue`，实现一键跨引擎切换。
- **Phase 3（全面收网：TOC 与空间分析面板统一）**：
  - 归并两套图层管理协议为统一图层元数据描述（LayerDescriptor）；
  - 全面下线双轨面板冗余代码。

---

## 4. 门禁验证结果

- **TypeScript 静态检查**：`npm run typecheck` (`vue-tsc --noEmit`) 0 报错，通过。
- **结构树漂移门禁**：`CheckStructureTree.py`（文档 729 · 磁盘 729 · 漏登记 0 · 幽灵条目 0），通过。
- **配置与域名门禁**：`CheckConfigRegistry.py` 全部 7 项检查通过。
- **Vue 范式门禁**：`CheckVueParadigm.py` 全部通过。
- **域依赖红线门禁**：`CheckDomainDeps.py` 0 违规，通过。
- **Git 状态检查**：无任何 Git 写入，工作区与暂存区完整保留。
