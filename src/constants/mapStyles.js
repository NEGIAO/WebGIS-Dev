/**
 * [Phase 20]: Map Styles Constants
 * 
 * 集中管理地图所有样式配置，包括：
 * - 托管图层的模板样式 (STYLE_TEMPLATES)
 * - 通用交互样式 (styles)
 * - 搜索结果样式
 * 
 * 便于维护、复用和全局主题定制
 */
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style';

/**
 * 托管图层的预定义样式模板
 * 用于用户导入数据时的快速样式应用
 */
export const STYLE_TEMPLATES = {
    classic: {
        fillColor: '#5fbf7a',
        fillOpacity: 0.24,
        strokeColor: '#2f7d3c',
        strokeWidth: 2,
        pointRadius: 6
    },
    warning: {
        fillColor: '#f59e0b',
        fillOpacity: 0.2,
        strokeColor: '#b45309',
        strokeWidth: 2.5,
        pointRadius: 6
    },
    water: {
        fillColor: '#3b82f6',
        fillOpacity: 0.2,
        strokeColor: '#1d4ed8',
        strokeWidth: 2,
        pointRadius: 6
    },
    magenta: {
        fillColor: '#ec4899',
        fillOpacity: 0.18,
        strokeColor: '#be185d',
        strokeWidth: 2,
        pointRadius: 6
    }
};

/**
 * 创建地图交互样式对象
 * 包括绘制、用户位置、路线导航等样式。
 *
 * @returns {Object} 所有交互样式的映射表
 */
export function createMapStylesObject() {

    return {
        // 绘制相关样式
        draw: new Style({
            fill: new Fill({ color: 'rgba(255, 255, 255, 0.2)' }),
            stroke: new Stroke({ color: '#ffcc33', width: 2 }),
            image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#ffcc33' }) }),
        }),

        // 用户位置相关样式
        userPoint: new Style({
            image: new CircleStyle({
                radius: 8,
                fill: new Fill({ color: '#1E90FF' }),
                stroke: new Stroke({ color: '#fff', width: 2 })
            })
        }),
        userAccuracy: new Style({
            fill: new Fill({ color: 'rgba(30,144,255,0.12)' }),
            stroke: new Stroke({ color: 'rgba(30,144,255,0.3)', width: 1 })
        }),

        // 公交路线路点样式
        busStart: new Style({
            image: new CircleStyle({
                radius: 8,
                fill: new Fill({ color: '#22c55e' }),
                stroke: new Stroke({ color: '#fff', width: 2 })
            })
        }),
        busEnd: new Style({
            image: new CircleStyle({
                radius: 8,
                fill: new Fill({ color: '#ef4444' }),
                stroke: new Stroke({ color: '#fff', width: 2 })
            })
        }),

        // 公交路线样式
        busRouteTransit: new Style({
            stroke: new Stroke({
                color: '#2563eb',
                width: 4,
                lineCap: 'round',
                lineJoin: 'round'
            })
        }),
        busRouteWalk: new Style({
            stroke: new Stroke({
                color: '#6b7280',
                width: 3,
                lineDash: [8, 6],
                lineCap: 'round',
                lineJoin: 'round'
            })
        }),

        // 驾车路线样式
        driveRoute: new Style({
            stroke: new Stroke({
                color: 'rgba(34, 197, 94, 0.8)',
                width: 6,
                lineCap: 'round',
                lineJoin: 'round'
            })
        })
    };
}

/**
 * 搜索结果样式配置
 * 用于搜索到的地点标记
 */
export const SEARCH_RESULT_STYLE = {
    fillColor: '#ef4444',
    fillOpacity: 0.15,
    strokeColor: '#dc2626',
    strokeWidth: 2,
    pointRadius: 8
};

/**
 * 搜索 AOI 结果样式配置
 * 用于 POI 详情接口返回的面状地理围栏
 */
export const SEARCH_AOI_STYLE = {
    fillColor: '#14b8a6',
    fillOpacity: 0.22,
    strokeColor: '#0f766e',
    strokeWidth: 2.2,
    pointRadius: 6
};

/**
 * 用户协助提取 AOI 的默认样式
 * 半透明蓝色填充 + 深蓝描边
 */
export const AMAP_EXTRACT_AOI_STYLE = {
    fillColor: '#0099ff',
    fillOpacity: 0.2,
    strokeColor: '#005b99',
    strokeWidth: 2,
    pointRadius: 6
};
