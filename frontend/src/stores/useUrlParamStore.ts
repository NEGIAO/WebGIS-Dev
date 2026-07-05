import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { normalizeBinaryFlag, normalizeLocationFlag } from '@/utils/normalize';
import { normalizeMapView } from '@/utils/url/urlConstants';
import { URL_LAYER_OPTIONS } from '@/constants/basemap/basemapResolver';

/**
 * @description URL 路由参数持久化 & 延迟应用仓库
 * @purpose 解决地图异步加载时序问题：
 *  1. 路由钩子优先提取地址栏参数
 *  2. 等待 Cesium/GIS 地图引擎初始化完成后再统一应用
 *  3. 控制参数重复渲染、分享模式、定位权限、加密点位逻辑
 */

// ====================== 类型定义 ======================
/**
 * 待应用的地图URL参数 结构体
 * @property lng 经度
 * @property lat 纬度
 * @property z 地图缩放层级
 * @property l 图层切换索引
 * @property s 分享模式标记 0=普通进入 / 1=分享链接进入
 * @property loc 定位来源标记 'gps' / 'ip' / '0'
 * @property p 加密点位编码（私密/定制点位解析用）
 * @property view 地图视图引擎 ol=OpenLayers / cesium=Cesium
 */
interface PendingParams {
    lng: number | null;
    lat: number | null;
    z: number | null;
    l: number | null;
    s: '0' | '1';
    loc: 'gps' | 'ip' | '0';
    p: string | null;
    view: 'ol' | 'cesium';
}
/**
 * 路由 query 原始参数类型
 * 接收路由 raw 原始字符串/数字参数，统一格式化校验
 * 支持的参数包括：
 * @property lng: 经度
 * @property lat: 纬度
 * @property z: 缩放级别
 * @property l: 图层索引
 * @property s: 分享标记 ('0' | '1')
 * @property loc: 定位来源标记 ('gps' | 'ip' | '0') — '1' 视为 'gps' 兼容旧链接
 * @property p: 加密位置编码
 * @property view: 地图视图引擎 ('ol' | 'cesium')
 * @property ut: 用户类型（guest|admin|registered）
 *
 * 注意：罗盘参数 (cs) 由 compassUrlState.ts 独立管理，不在此接口中定义
 */
interface QueryParams {
    lng?: string | number | null;
    lat?: string | number | null;
    z?: string | number | null;
    l?: string | number | null;
    s?: string | number | null;
    loc?: string | number | null;
    p?: string | null;
    view?: string | null;
    ut?: string;
}

// ====================== Store 实例 ======================
export const useUrlParamStore = defineStore('urlParamStore', () => {
    /**
     * 待延迟应用的URL参数容器
     * 路由阶段提前存入，地图加载完成后再消费
     */
    const pendingParams = ref<PendingParams>({
        lng: null,
        lat: null,
        z: null,
        l: null,
        s: '0',
        loc: '0',
        p: null,
        view: 'ol',
    });

    /**
     * 参数应用标记
     * true = 地图已完成定位/图层/模式初始化，防止重复执行
     */
    const isParamApplied = ref(false);

    /**
     * 计算属性：是否为【分享链接】进入
     * 由url参数 s=1 控制，用于控制UI展示、权限、操作限制
     */
    const isShareModeEntry = computed(() => pendingParams.value.s === '1');

    /**
     * @function extractAndStorePendingParams
     * @description 解析并格式化路由URL参数，存入全局待应用容器
     * @param queryParams 路由route.query原始参数对象
     * @note 在全局路由守卫/页面onBeforeMount 优先调用
     */
    function extractAndStorePendingParams(queryParams: QueryParams = {}) {
        // 经纬度格式化校验
        const normalizedLng = validateLongitude(queryParams.lng);
        const normalizedLat = validateLatitude(queryParams.lat);
        // 地图视图引擎校验
        const normalizedView = normalizeMapView(queryParams.view);
        // 地图缩放层级 / Cesium 相机高度校验
        const normalizedZ = validateViewZ(queryParams.z, normalizedView);
        // 图层索引格式化校验
        const normalizedL = validateLayerIndex(queryParams.l);
        // 分享模式标识格式化
        const normalizedS = normalizeBinaryFlag(queryParams.s, '0');
        // 定位来源标识格式化（复用 normalize.ts，避免重复实现）
        const normalizedLoc = normalizeLocationFlag(queryParams.loc);
        const normalizedP = normalizePositionCode(queryParams.p);

        // 覆盖更新规范化后的参数集合
        pendingParams.value = {
            lng: normalizedLng,
            lat: normalizedLat,
            z: normalizedZ,
            l: normalizedL,
            s: normalizedS,
            loc: normalizedLoc,
            p: normalizedP,
            view: normalizedView,
        };

        // 每次更新参数后，重置应用标记，等待地图重新应用
        isParamApplied.value = false;

        console.warn('[UrlParamStore] Extracted pending params:', pendingParams.value);
    }

    /**
     * @function getPendingParams
     * @description 获取完整原始待应用参数
     * @returns 完整 PendingParams 结构体
     */
    function getPendingParams(): PendingParams {
        return { ...pendingParams.value };
    }

    /**
     * @function getValidCoordinateParams
     * @description 筛选【合法坐标参数】，专供地图初始化定位使用
     * @returns 包含经纬度/层级/图层的有效对象 | 空（坐标非法时）
     * @rule 经纬度合法范围内才返回，自动填充缩放/图层默认值
     *
     * NOTE: view=cesium 时返回 null，因为 Cesium 相机初始化不经过此路径，
     * 而是由 useCesiumUrlTracking.restoreCameraFromUrl() 独立处理 cv 编码参数。
     * 这样设计避免 OL 坐标恢复逻辑与 Cesium 相机恢复逻辑冲突。
     */
    function getValidCoordinateParams() {
        const { lng, lat, z, l, view } = pendingParams.value;
        // Cesium 模式下 OL 面板被隐藏，参数恢复走 Cesium 的 restoreCameraFromUrl 独立路径
        if (view === 'cesium') return null;
        if (lng !== null && lat !== null && Number.isFinite(lng) && Number.isFinite(lat)) {
            return {
                lng,
                lat,
                z: z !== null ? z : 17,
                l: l !== null ? l : 0,
            };
        }
        return null;
    }

    /**
     * @function markParamsAsApplied
     * @description 标记参数已完成地图应用
     * @usage 地图飞行定位、图层切换、模式初始化成功后调用
     */
    function markParamsAsApplied() {
        isParamApplied.value = true;
        console.warn('[UrlParamStore] Params marked as applied');
    }

    /**
     * @function clearPendingParams
     * @description 清空所有URL参数，恢复默认状态
     * @usage 关闭分享模式、刷新页面、退出定位场景调用
     */
    function clearPendingParams() {
        pendingParams.value = {
            lng: null,
            lat: null,
            z: null,
            l: null,
            s: '0',
            loc: '0',
            p: null,
            view: 'ol',
        };
        isParamApplied.value = false;
    }

    /**
     * @function getShareMetadata
     * @description 获取分享业务相关元数据
     * @returns 点位存在、加密编码、分享标记、定位权限 聚合信息
     * @used 顶部栏文案、操作按钮显隐、权限控制
     */
    function getShareMetadata() {
        return {
            hasLocation: pendingParams.value.lng !== null && pendingParams.value.lat !== null,
            hasPositionCode: !!pendingParams.value.p,
            shareFlag: pendingParams.value.s,
            locateFlag: pendingParams.value.loc,
            view: pendingParams.value.view,
        };
    }

    return {
        pendingParams,
        isParamApplied,
        isShareModeEntry,
        extractAndStorePendingParams,
        getPendingParams,
        getValidCoordinateParams,
        markParamsAsApplied,
        clearPendingParams,
        getShareMetadata,
    };
});

// ====================== 工具校验函数 ======================

/**
 * @description 经度校验格式化
 * @param value 原始 URL 经度
 * @returns 合法经度 | null
 * @range -180 ~ 180
 */
function validateLongitude(value: unknown): number | null {
    const num = parseFloat(value as string);
    if (!Number.isFinite(num)) return null;
    if (num < -180 || num > 180) return null;
    return num;
}

/**
 * @description 纬度校验格式化
 * @param value 原始 URL 纬度
 * @returns 合法纬度 | null
 * @range -90 ~ 90
 */
function validateLatitude(value: unknown): number | null {
    const num = parseFloat(value as string);
    if (!Number.isFinite(num)) return null;
    if (num < -90 || num > 90) return null;
    return num;
}

/**
 * @description 地图缩放层级校验
 * @param value 原始url缩放参数
 * @returns 合法层级数字 | null
 * @range 0 ~ 30 符合天地图/cesium常规层级范围
 */
function validateZoom(value: unknown): number | null {
    const num = parseFloat(value as string);
    if (!Number.isFinite(num)) return null;
    if (num < 0 || num > 30) return null;
    return num;
}

/**
 * @description 按地图视图校验 z 参数
 * @param value 原始 URL z 参数
 * @param view 地图视图引擎，ol 表示缩放，cesium 表示相机高度
 * @returns 合法数字 | null
 */
function validateViewZ(value: unknown, view: 'ol' | 'cesium'): number | null {
    if (view === 'cesium') {
        const num = parseFloat(value as string);
        if (!Number.isFinite(num)) return null;
        if (num < 1 || num > 50000000) return null;
        return num;
    }
    return validateZoom(value);
}

/**
 * @description 图层索引校验
 * @param value 原始url图层编号
 * @returns 合法索引数字 | null
 * @range 0 ~ URL_LAYER_OPTIONS.length-1，随预设数组动态变化，避免越界写入与未来扩展时校验过宽
 */
function validateLayerIndex(value: unknown): number | null {
    const num = parseInt(value as string, 10);
    if (!Number.isFinite(num)) return null;
    const maxIndex = Math.max(0, URL_LAYER_OPTIONS.length - 1);
    if (num < 0 || num > maxIndex) return null;
    return num;
}

function normalizePositionCode(value: unknown): string | null {
    const text = String(value ?? '').trim();
    return text || null;
}

// normalizeMapView 已迁移至 src/utils/url/urlConstants.js（P2-9 去重复）
// normalizeBinaryFlag / normalizeLocationFlag 已迁移至 src/utils/normalize.ts
