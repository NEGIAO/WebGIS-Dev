/**
 * cesiumLayers.ts
 * Cesium 三维数据图层元数据店（统一图层管理·第一步）。
 *
 * 核心原则「元数据入店、句柄留场」：本 store 只存可序列化元数据，
 * Cesium 句柄（DataSource/Tileset/Model/ImageryLayer）仍由 useCesiumDataImport
 * 的 loadedDataSources 持有；场景操作经 CesiumContainer 注册的 adapter 回调触达，
 * adapter 注销后各 action 降级为纯元数据操作（防守销毁时序）。
 *
 * 消费方：3D 数据页签卡片（可见性/透明度/重命名）与 TOC「三维数据」分组
 * （经 cesiumLayerNodeBuilder 映射，动作按 id 前缀 cesium: 分流回本 store）。
 */

import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

/**
 * 支持透明度调节的类型（二期已放开矢量类：per-entity 原色快照缩放，
 * 实现见 dataSourceDisplay.js applyVectorDataSourceOpacity）
 * 注：draw（绘制）支持 per-handle 回放；route（路线）材质透明度基线在创建时固化，暂不开放
 */
const OPACITY_SUPPORTED_TYPES = new Set([
    'tif',
    'gltf',
    '3dtiles',
    'geojson',
    'kml',
    // KMZ 解包后同为 KML DataSource，透明度路径与 kml/geojson 同构
    'kmz',
    'czml',
    'shp',
    'wayline',
    'draw',
    // Ion 等外部影像图层：ImageryLayer.alpha 原生支持透明度调节
    'imagery',
]);

/** 引擎内生成类目（非导入数据）：生命周期由管理器句柄表驱动 */
const MANAGED_CATEGORIES = new Set(['draw', 'route']);

/** Cesium 图层元数据记录（禁止出现任何 Cesium 对象字段） */
export interface CesiumLayerRecord {
    id: string;
    name: string;
    type: string;              // geojson|kml|kmz|czml|shp|tif|gltf|3dtiles|wayline|draw|route|imagery
    /** 记录来源：data=导入数据（默认）；draw=绘制/测量；route=公交/驾车路线 */
    category?: 'data' | 'draw' | 'route';
    /**
     * 绘制 / 路线成品的具体几何类型（Point / Polygon / MeasureHeight / drive …）。
     * `type` 只能表达 category，TOC 能力位（是否可编辑要素等）需要更细的判据。
     */
    shapeType?: string;
    engine: 'cesium';
    visible: boolean;
    opacity: number;           // 0~1
    supportsOpacity: boolean;
    createdAt: number;
    /** 3D Tiles 高程范围（min/max 米），由 CesiumContainer 采样回填 */
    heightRange?: { min: number; max: number };
    /** 当前基座高程（米，3dtiles 专用，TOC 高程滑杆值源） */
    baseHeight?: number;
    /** 当前材质模式（3dtiles 专用） */
    materialMode?: string;
    /** 标注显隐（矢量类可切换；TOC 右键「开启 / 关闭标注」回写） */
    labelVisible?: boolean;
    /** 最近一次应用的样式补丁（仅元数据留痕，供审计与后续回填；样式页签当前不自动回填表单） */
    style?: CesiumLayerStylePatch;
    /** GLTF 相对地形的高度偏移（米，TOC 高程滑杆值源；正值抬升，用于修正原点在几何中心的模型） */
    modelHeightOffset?: number;
}

/** 矢量样式补丁（与 OL drawingToolRegistry 的字段口径对齐） */
export interface CesiumLayerStylePatch {
    fillColor?: string;
    strokeColor?: string;
    /** 0~1 */
    fillOpacity?: number;
    strokeWidth?: number;
}

/** 场景操作适配器（由 CesiumContainer 挂载时注册） */
export interface CesiumLayerAdapter {
    setVisible: (id: string, visible: boolean) => void;
    setOpacity: (id: string, opacity: number) => void;
    flyTo: (id: string) => void;
    remove: (id: string) => void;
    /** 3D Tiles 高程调节（可选） */
    setBaseHeight?: (id: string, height: number) => void;
    /** 3D Tiles 材质模式切换（可选） */
    setMaterialMode?: (id: string, mode: string) => void;
    /** GLTF 重定位（打开坐标弹窗，可选） */
    reposition?: (id: string) => void;
    /** GeoTIFF 单波段拉伸至高程（可选） */
    stretchToHeight?: (id: string) => void;
    /** 矢量样式应用（draw 走绘制管理器，导入矢量走 DataSource 遍历） */
    setStyle?: (id: string, patch: CesiumLayerStylePatch) => void;
    /** 标注显隐切换（可选） */
    setLabelVisible?: (id: string, visible: boolean) => void;
    /** 复制坐标为文本（返回 false = 无可复制坐标） */
    copyCoordinates?: (id: string) => boolean;
    /** 导出坐标为文件 */
    exportData?: (id: string, format: string) => boolean;
    /** 打开属性表（只读，UI 挂在 CesiumContainer） */
    openAttributeTable?: (id: string) => boolean;
    /** 进入要素编辑（仅绘制成品，导入数据为只读） */
    editFeature?: (id: string) => boolean;
    /** 贴合地形（矢量 clamp / 3D Tiles 配准 / glTF 相对地形），异步 */
    fitToTerrain?: (id: string) => Promise<{ ok: boolean; reason?: string }>;
    /** 恢复数据自带原始高程 */
    resetTerrainFit?: (id: string) => { ok: boolean; reason?: string };
}

/**
 * 支持样式修改的类型（矢量类）。
 * 栅格 / 模型 / 3D Tiles 无「填充色 / 边线色」语义，其外观由透明度与材质模式承载。
 */
const STYLE_SUPPORTED_TYPES = new Set([
    'geojson',
    'kml',
    'kmz',
    'czml',
    'shp',
    'wayline',
    'draw',
    'route',
]);

/** 支持标注显隐与坐标导出的类型（有顶点语义的矢量类） */
const VECTOR_TYPES = new Set([...STYLE_SUPPORTED_TYPES]);

/** 类型是否支持矢量样式修改（TOC 菜单与样式页签共用判据，避免两处各写一份白名单） */
export function isCesiumStyleSupportedType(type: string): boolean {
    return STYLE_SUPPORTED_TYPES.has(String(type || ''));
}

/** 类型是否具备顶点语义（标注显隐 / 复制坐标 / 导出坐标） */
export function isCesiumVectorType(type: string): boolean {
    return VECTOR_TYPES.has(String(type || ''));
}

/**
 * 贴地能力判据已收口到 `terrain/groundPlacementCapabilities`（单一事实来源），
 * 本文件不再维护第二份「可贴地类型」白名单。
 */

export const useCesiumLayersStore = defineStore('cesiumLayers', () => {
    const records = ref<CesiumLayerRecord[]>([]);

    /** adapter 为非响应式模块级引用（回调集合，无需响应） */
    let adapter: CesiumLayerAdapter | null = null;

    const recordCount = computed(() => records.value.length);

    function getRecord(id: string): CesiumLayerRecord | null {
        return records.value.find((item) => item.id === id) || null;
    }

    /**
     * 与 loadedDataSources 差量同步（CesiumContainer watch 调用）：
     * 新增建档（默认可见/不透明），消失删档，已有记录保留用户改过的元数据。
     * @param sources 导入层记录投影 [{ id, name, type, baseHeight?, heightRange?, materialMode? }]
     */
    function syncFromImport(
        sources: Array<{
            id: string;
            name?: string;
            type?: string;
            baseHeight?: number;
            heightRange?: { min: number; max: number };
            materialMode?: string;
        }> = [],
    ): void {
        const now = Date.now();
        const nextIds = new Set(sources.map((item) => String(item.id)));
        // 差量修剪豁免：draw / route 类记录由管理器句柄表驱动生命周期，
        // 不随 loadedDataSources 变化被清除
        const kept = records.value.filter(
            (item) => nextIds.has(item.id) || MANAGED_CATEGORIES.has(item.category || 'data'),
        );
        const keptIds = new Set(kept.map((item) => item.id));

        const added: CesiumLayerRecord[] = sources
            .filter((item) => !keptIds.has(String(item.id)))
            .map((item) => {
                const type = String(item.type || 'geojson');
                return {
                    id: String(item.id),
                    name: String(item.name || '未命名数据'),
                    type,
                    engine: 'cesium' as const,
                    visible: true,
                    opacity: 1,
                    supportsOpacity: OPACITY_SUPPORTED_TYPES.has(type),
                    createdAt: now,
                    baseHeight:
                        type === '3dtiles' && Number.isFinite(item.baseHeight)
                            ? item.baseHeight
                            : undefined,
                    heightRange: type === '3dtiles' ? item.heightRange : undefined,
                    materialMode:
                        type === '3dtiles' && item.materialMode ? String(item.materialMode) : undefined,
                };
            });

        records.value = [...kept, ...added];
    }

    /** 切换/设置可见性（元数据 + 场景同步） */
    function setVisible(id: string, visible: boolean): void {
        const record = getRecord(id);
        if (!record) return;
        record.visible = !!visible;
        records.value = [...records.value];
        adapter?.setVisible(id, !!visible);
    }

    /** 设置透明度 0~1（仅 supportsOpacity 类型生效） */
    function setOpacity(id: string, opacity: number): void {
        const record = getRecord(id);
        if (!record) {
            console.warn('[cesiumLayers] setOpacity 找不到记录（id 未建档或已销档）', { id });
            return;
        }
        if (!record.supportsOpacity) return;
        const clamped = Math.min(1, Math.max(0, Number(opacity) || 0));
        record.opacity = clamped;
        records.value = [...records.value];
        if (adapter) {
            adapter.setOpacity(id, clamped);
        } else {
            // 容器未挂载/已卸载：只更新元数据并显式暴露（防静默降级）
            console.warn('[cesiumLayers] setOpacity 场景操作未生效：adapter 未注册', { id, clamped });
        }
    }

    /** 重命名（纯元数据：显示名，卡片与 TOC 同步生效） */
    function rename(id: string, name: string): void {
        const record = getRecord(id);
        const compact = String(name || '').trim();
        if (!record || !compact) return;
        record.name = compact.slice(0, 60);
        records.value = [...records.value];
    }

    /** 视角定位（转发 adapter） */
    function flyTo(id: string): void {
        adapter?.flyTo(id);
    }

    /** 移除（adapter 清场景 → loadedDataSources 变化 → watch 回调 syncFromImport 删档） */
    function remove(id: string): void {
        adapter?.remove(id);
        // draw / route 类无 loadedDataSources 回声链路，由 store 即时删档
        const record = getRecord(id);
        if (record && MANAGED_CATEGORIES.has(record.category || 'data')) {
            records.value = records.value.filter((item) => item.id !== id);
        }
    }

    /**
     * 绘制 / 路线建档（引擎感知迁移 P0/P2）：
     * 由 CesiumContainer 内的绘制管理器与路线渲染器在成品时调用。
     * @param input { id, name, category: 'draw' | 'route', shapeType? }
     *        shapeType 为具体几何类型（Point / Polygon / MeasureHeight …），供 TOC 能力位细分
     */
    function registerDrawing(input: {
        id: string;
        name: string;
        category: 'draw' | 'route';
        shapeType?: string;
    }): void {
        const id = String(input?.id || '').trim();
        if (!id) return;
        if (getRecord(id)) return;
        const category = input.category === 'route' ? 'route' : 'draw';
        records.value = [
            ...records.value,
            {
                id,
                name: String(input.name || '未命名').slice(0, 60),
                type: category,
                category,
                shapeType: input.shapeType ? String(input.shapeType) : undefined,
                engine: 'cesium' as const,
                visible: true,
                opacity: 1,
                supportsOpacity: category === 'draw',
                createdAt: Date.now(),
            },
        ];
    }

    /** 纯元数据删档（不触发 adapter；绘制管理器清空链路使用，避免回调环路） */
    function purgeRecord(id: string): void {
        records.value = records.value.filter((item) => item.id !== String(id));
    }

    /** 3D Tiles 高程调节（回写 record 供 TOC 滑杆取值） */
    function setBaseHeight(id: string, height: number): void {
        const record = getRecord(id);
        if (record) record.baseHeight = height;
        adapter?.setBaseHeight?.(id, height);
    }

    /** 3D Tiles 材质模式切换（回写 record 供 TOC 下拉取值） */
    function setMaterialMode(id: string, mode: string): void {
        const record = getRecord(id);
        if (record) record.materialMode = mode;
        adapter?.setMaterialMode?.(id, mode);
    }

    /** GLTF 重定位：经 adapter 打开坐标弹窗（弹窗 UI 挂在 CesiumContainer） */
    function requestReposition(id: string): void {
        adapter?.reposition?.(id);
    }

    /** GeoTIFF 单波段拉伸至高程 */
    function requestStretchHeight(id: string): void {
        adapter?.stretchToHeight?.(id);
    }

    // ────────────────────────── 矢量样式 / 标注 / 坐标（TOC 右键与样式页签） ──────────────────────────

    /**
     * 应用矢量样式补丁。
     * 元数据留痕（record.style）与场景同步分离：adapter 未注册时只更新元数据并告警，
     * 保证样式页签在容器未就绪时也不会「点了没反应且无提示」。
     * @returns {boolean} 类型不支持或记录不存在时返回 false
     */
    function setStyle(id: string, patch: CesiumLayerStylePatch = {}): boolean {
        const record = getRecord(id);
        if (!record || !STYLE_SUPPORTED_TYPES.has(record.type)) return false;
        record.style = { ...(record.style || {}), ...patch };
        records.value = [...records.value];
        if (!adapter?.setStyle) {
            console.warn('[cesiumLayers] setStyle 场景操作未生效：adapter 未注册', { id });
            return false;
        }
        adapter.setStyle(id, patch);
        return true;
    }

    /** 切换标注显隐（矢量类；无 label 的图层由 adapter 返回 false 并提示） */
    function setLabelVisible(id: string, visible: boolean): boolean {
        const record = getRecord(id);
        if (!record || !VECTOR_TYPES.has(record.type)) return false;
        record.labelVisible = !!visible;
        records.value = [...records.value];
        if (!adapter?.setLabelVisible) return false;
        adapter.setLabelVisible(id, !!visible);
        return true;
    }

    /**
     * 仅显示此图层（其它全部隐藏）。
     * 纯元数据 + adapter 广播，不依赖引擎侧「solo 状态」概念，双端语义一致。
     */
    function solo(id: string): boolean {
        const target = getRecord(id);
        if (!target) return false;
        records.value.forEach((record) => {
            const next = record.id === id;
            if (record.visible === next) return;
            record.visible = next;
            adapter?.setVisible(record.id, next);
        });
        records.value = [...records.value];
        return true;
    }

    /** 复制坐标到剪贴板（场景侧实现，返回是否成功） */
    function copyCoordinates(id: string): boolean {
        const record = getRecord(id);
        if (!record || !VECTOR_TYPES.has(record.type)) return false;
        return adapter?.copyCoordinates?.(id) ?? false;
    }

    /** 导出坐标为文件（format: geojson|csv|txt） */
    function exportData(id: string, format: string): boolean {
        const record = getRecord(id);
        if (!record || !VECTOR_TYPES.has(record.type)) return false;
        return adapter?.exportData?.(id, format) ?? false;
    }

    /**
     * 贴合地形。异步：3D Tiles 需要基底采样 + 地形查询。
     * 失败原因由 adapter 负责提示（terrain-off / unsupported / sample-failed）。
     * @returns {Promise<{ok:boolean, reason?:string}>}
     */
    function fitToTerrain(id: string): Promise<{ ok: boolean; reason?: string }> {
        const record = getRecord(id);
        if (!record) return Promise.resolve({ ok: false, reason: 'no-record' });
        const result = adapter?.fitToTerrain?.(id);
        return result instanceof Promise ? result : Promise.resolve(result ?? { ok: false, reason: 'no-adapter' });
    }

    /**
     * 进入要素编辑。
     * 3D 侧仅绘制成品可编辑（有可回写的顶点载荷）；导入矢量无写回通道，
     * 返回 false 由宿主提示「导入数据为只读」。
     */
    function editFeature(id: string): boolean {
        const record = getRecord(id);
        if (!record) return false;
        return adapter?.editFeature?.(id) ?? false;
    }

    /** 打开属性表（只读表格 + 行定位，UI 由容器承载） */
    function requestAttributeTable(id: string): boolean {
        const record = getRecord(id);
        if (!record) return false;
        return adapter?.openAttributeTable?.(id) ?? false;
    }

    /** 恢复数据自带原始高程（取消贴地） */
    function resetTerrainFit(id: string): { ok: boolean; reason?: string } {
        const record = getRecord(id);
        if (!record) return { ok: false, reason: 'no-record' };
        return adapter?.resetTerrainFit?.(id) ?? { ok: false, reason: 'no-adapter' };
    }

    function registerAdapter(next: CesiumLayerAdapter): void {
        adapter = next;
    }

    /** 容器卸载：注销 adapter 并清档（数据生命周期跟随容器，避免 TOC 幽灵记录） */
    function unregisterAdapter(): void {
        adapter = null;
        records.value = [];
    }

    return {
        records,
        recordCount,
        getRecord,
        syncFromImport,
        setVisible,
        setOpacity,
        rename,
        flyTo,
        remove,
        registerDrawing,
        purgeRecord,
        setBaseHeight,
        setMaterialMode,
        requestReposition,
        requestStretchHeight,
        setStyle,
        setLabelVisible,
        solo,
        copyCoordinates,
        exportData,
        fitToTerrain,
        resetTerrainFit,
        requestAttributeTable,
        editFeature,
        registerAdapter,
        unregisterAdapter,
    };
});
