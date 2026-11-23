/**
 * useOlMeasureStore — 2D（OpenLayers）测量结果店。
 *
 * 背景（V3.7.10 修复）：`useDrawMeasure` 原先只把面积/长度写进 tooltip DOM，
 * `drawend` 后即丢弃，导致 Agent 的 `get_measure_result` 只能读 3D 结果，
 * 用户在 2D 量完面积后问「刚才多少」得不到回答。
 *
 * 设计取舍：
 * - 数值与文本**与 tooltip 同源**（同样取 `getLength` / `getArea` 的结果再格式化），
 *   保证 Agent 报出的数字与用户屏幕上看到的一致；不在此处改成 EPSG:4326 大地测量，
 *   否则会出现「模型说 1.2 km、tooltip 显示 1.3 km」的口径分歧。
 * - 只保留最近一次结果（与 3D `useDrawMeasureStore.lastResult` 语义对齐），
 *   历史记录由图层/图形本身承载，不需要第二个账本。
 */

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/** 2D 测量类型（与 drawingToolRegistry 的交互名一致） */
export type OlMeasureType = 'MeasureDistance' | 'MeasureArea';

/** 单次测量结果 */
export interface OlMeasureResult {
    id: string;
    type: OlMeasureType;
    /** 原始数值：距离为米、面积为平方米（与 tooltip 同源口径） */
    value: number;
    /** 面向用户的显示文本，如 `1.23 km` / `450.00 m²` */
    text: string;
    /** 顶点坐标（WGS-84 `[lng, lat]`） */
    coordinates: Array<[number, number]>;
    /** 记录时间（毫秒时间戳） */
    createdAt: number;
}

export const useOlMeasureStore = defineStore('olMeasure', () => {
    /** 最近一次测量结果；未测量时为 null */
    const lastResult = ref<OlMeasureResult | null>(null);

    /** 本次会话内是否已有测量结果 */
    const hasResult = computed(() => lastResult.value !== null);

    /**
     * 记录一次测量。
     * @param result 除 id / createdAt 外的测量内容
     */
    function setResult(result: Omit<OlMeasureResult, 'id' | 'createdAt'>) {
        lastResult.value = {
            ...result,
            id: `ol-measure-${Date.now()}`,
            createdAt: Date.now(),
        };
    }

    /** 清空（切引擎或清空图形时调用） */
    function reset() {
        lastResult.value = null;
    }

    return { lastResult, hasResult, setResult, reset };
});
