/**
 * useDrawMeasureStore.ts — Cesium 绘制 / 测量的面板↔引擎共享状态
 *
 * 分层约束（dev-conventions「stores 只维护状态 + 派生，不依赖 OL / Cesium 类」）：
 * 本 store **只存可序列化数据**（数字 / 字符串 / 经纬度数组），
 * 严禁写入 Cartesian3、Entity、Viewer 等 Cesium 对象——
 * 一旦被 Pinia 响应式代理包住，`entities.remove` 会因句柄失配而删不掉实体。
 * 场景定位一律走 id 回查管理器句柄表（见 CesiumContainer.flyToCesiumDrawing）。
 *
 * 数据流：
 *   面板 → setMeasureOption / setStyle / setActiveType → CesiumContainer watch 下推管理器
 *   管理器 → onResult / onStateChange → setResult / pushRecord / setActiveType → 面板渲染
 */

import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

/** 测量开关（对应面板「测量项」三个复选框） */
export interface DrawMeasureOptions {
    /** 总开关：false = 只绘制，不产生任何测量标注与读数 */
    measure: boolean;
    /** 面积类标注（多边形 / 矩形 / 圆） */
    showArea: boolean;
    /** 周长 / 长度 / 距离 / 角度类标注 */
    showPerimeter: boolean;
}

/** 图形样式（对齐 OL drawingToolRegistry 的字段语义） */
export interface DrawStyleParams {
    fillColor: string;
    fillOpacity: number;
    outlineColor: string;
    outlineWidth: number;
    showVertices: boolean;
    vertexSize: number;
}

/** 绘制完成的纯数据结果（面板渲染 / 导出用） */
export interface DrawResult {
    id: string;
    name: string;
    type: string;
    lonLats: Array<[number, number]>;
    area: number | null;
    perimeter: number | null;
    length: number | null;
    radius: number | null;
    width: number | null;
    height: number | null;
    azimuth: number | null;
    distance: number | null;
    verticalDistance: number | null;
    horizontalDistance: number | null;
    slopeDistance: number | null;
    heights: [number, number] | null;
    rectangle: { west: number; south: number; east: number; north: number } | null;
    center: [number, number] | null;
    vertexCount: number;
}

/** 测量记录（不随图形清除而丢失，上限 20 条） */
export interface DrawRecord {
    id: string;
    name: string;
    summary: string;
    at: number;
}

const RECORD_LIMIT = 20;

const DEFAULT_OPTIONS: DrawMeasureOptions = {
    measure: true,
    showArea: true,
    showPerimeter: true,
};

const DEFAULT_STYLE: DrawStyleParams = {
    fillColor: '#27AE60',
    fillOpacity: 0.2,
    outlineColor: '#27AE60',
    outlineWidth: 2,
    showVertices: true,
    vertexSize: 8,
};

export const useDrawMeasureStore = defineStore('cesiumDrawMeasure', () => {
    /** 测量开关 */
    const measureOptions = ref<DrawMeasureOptions>({ ...DEFAULT_OPTIONS });
    /** 图形样式 */
    const style = ref<DrawStyleParams>({ ...DEFAULT_STYLE });
    /** 当前进行中的交互类型（面板高亮 + 完成/取消按钮显隐） */
    const activeType = ref<string | null>(null);
    /** 是否处于绘制中 */
    const drawing = ref(false);
    /** 最近一次绘制结果 */
    const lastResult = ref<DrawResult | null>(null);
    /** 测量记录（最新在前） */
    const records = ref<DrawRecord[]>([]);

    /** 是否有可撤销 / 可清除的成品（由 lastResult 间接反映，仅用于按钮态提示） */
    const hasResult = computed(() => !!lastResult.value);

    /** 总开关关闭时，细分项应置灰 */
    const subOptionsDisabled = computed(() => !measureOptions.value.measure);

    function setMeasureOption(key: keyof DrawMeasureOptions, value: boolean): void {
        if (key !== 'measure' && key !== 'showArea' && key !== 'showPerimeter') return;
        measureOptions.value = { ...measureOptions.value, [key]: !!value };
    }

    function setStyle(patch: Partial<DrawStyleParams>): void {
        style.value = { ...style.value, ...patch };
    }

    function setActiveType(type: string | null): void {
        activeType.value = type || null;
        drawing.value = !!type;
    }

    function setDrawing(value: boolean): void {
        drawing.value = !!value;
        if (!value) activeType.value = null;
    }

    /** 写入结果并追加记录（summary 为空 = 纯绘制，不记档） */
    function setResult(result: DrawResult | null, summary = ''): void {
        lastResult.value = result || null;
        if (!result) return;
        if (!summary) return;
        const next: DrawRecord = {
            id: result.id,
            name: result.name,
            summary,
            at: Date.now(),
        };
        records.value = [next, ...records.value].slice(0, RECORD_LIMIT);
    }

    function clearRecords(): void {
        records.value = [];
    }

    /** 引擎卸载 / 切换引擎时复位（成品已随 viewer 销毁，档案同步清空） */
    function reset(): void {
        lastResult.value = null;
        records.value = [];
        activeType.value = null;
        drawing.value = false;
    }

    return {
        measureOptions,
        style,
        activeType,
        drawing,
        lastResult,
        records,
        hasResult,
        subOptionsDisabled,
        setMeasureOption,
        setStyle,
        setActiveType,
        setDrawing,
        setResult,
        clearRecords,
        reset,
    };
});
