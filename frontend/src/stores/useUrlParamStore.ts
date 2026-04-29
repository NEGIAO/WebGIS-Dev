import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

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
 * @property loc 定位权限标记 0=禁止定位 / 1=允许定位
 * @property p 加密点位编码（私密/定制点位解析用）
 */
interface PendingParams {
  lng: number | null;
  lat: number | null;
  z: number | null;
  l: number | null;
  s: '0' | '1';
  loc: '0' | '1';
  p: string | null;
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
* @property loc: 定位授权标记 ('0' | '1')
* @property p: 加密位置编码
* @property ut: 用户类型（guest|admin|registered）
* @property cs: 罗盘参数（加密字符串）
 */
interface QueryParams {
  lng?: string | number | null;
  lat?: string | number | null;
  z?: string | number | null;
  l?: string | number | null;
  s?: string | number | null;
  loc?: string | number | null;
  p?: string | null;
  ut?: string;
  cs?: string;
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
    p: null
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
    const normalizedLng = validateCoordinate(queryParams.lng);
    const normalizedLat = validateCoordinate(queryParams.lat);
    // 地图缩放层级校验
    const normalizedZ = validateZoom(queryParams.z);
    // 图层索引格式化校验
    const normalizedL = validateLayerIndex(queryParams.l);
    // 分享模式标识格式化
    const normalizedS = normalizeBinaryFlag(queryParams.s, '0');
    // 定位权限标识格式化
    const normalizedLoc = normalizeBinaryFlag(queryParams.loc, '0');
    // 加密点位编码清洗
    const normalizedP = String(queryParams.p || '').trim() || null;

    // 覆盖更新规范化后的参数集合
    pendingParams.value = {
      lng: normalizedLng,
      lat: normalizedLat,
      z: normalizedZ,
      l: normalizedL,
      s: normalizedS,
      loc: normalizedLoc,
      p: normalizedP
    };

    // 每次更新参数后，重置应用标记，等待地图重新应用
    isParamApplied.value = false;

    console.info('[UrlParamStore] Extracted pending params:', pendingParams.value);
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
   */
  function getValidCoordinateParams() {
    const { lng, lat, z, l } = pendingParams.value;
    if (lng !== null && lat !== null && Number.isFinite(lng) && Number.isFinite(lat)) {
      return {
        lng,
        lat,
        z: z !== null ? z : 17,
        l: l !== null ? l : 0
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
    console.info('[UrlParamStore] Params marked as applied');
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
      p: null
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
      locateFlag: pendingParams.value.loc
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
    getShareMetadata
  };
});

// ====================== 工具校验函数 ======================

/**
 * @description 经纬度校验格式化
 * @param value 原始url传入的经度/纬度
 * @returns 合法数字 | null（非法/超出范围）
 * @range 经度、纬度统一限制 -180 ~ 180
 */
function validateCoordinate(value: unknown): number | null {
  const num = parseFloat(value as string);
  if (!Number.isFinite(num)) return null;
  if (num < -180 || num > 180) return null;
  return num;
}

/**
 * @description 地图缩放层级校验
 * @param value 原始url缩放参数
 * @returns 合法层级数字 | null
 * @range 0 ~ 30 符合天地图/cesium常规层级范围
 */
function validateZoom(value: unknown): number | null {
  const num = parseInt(value as string, 10);
  if (!Number.isFinite(num)) return null;
  if (num < 0 || num > 30) return null;
  return num;
}

/**
 * @description 图层索引校验
 * @param value 原始url图层编号
 * @returns 合法索引数字 | null
 * @range 0 ~ 100 预留多图层扩展
 */
function validateLayerIndex(value: unknown): number | null {
  const num = parseInt(value as string, 10);
  if (!Number.isFinite(num)) return null;
  if (num < 0 || num > 100) return null;
  return num;
}

/**
 * @description 二元标识格式化（s / loc 共用）
 * @param value 原始url 0/1/true/false 字符
 * @param fallback 兜底默认值
 * @returns 严格 '0' | '1' 固定枚举值
 */
function normalizeBinaryFlag(
  value: unknown,
  fallback: '0' | '1' = '0'
): '0' | '1' {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === '1' || raw === 'true') return '1';
  if (raw === '0' || raw === 'false') return '0';
  return fallback;
}