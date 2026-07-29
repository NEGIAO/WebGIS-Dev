/**
 * Cesium 相机视域 → 属性表「视图筛选范围」同步（修复规划 P0-4 B4）
 *
 * 背景：属性表「视图筛选范围」依赖 attrStore.currentMapExtent。2D 侧由 OL moveend
 * 喂入（useMapUIEventHandlers.syncAttributeTableMapExtent），3D 模式此前无人喂入，
 * currentMapExtent 恒为 null，勾选后只能提示「范围不可用，筛选暂不生效」。
 * 本模块在相机移动结束时计算视域矩形写入 attrStore，使 3D 模式视图筛选真实生效；
 * attrStore.setMapExtent 的坐标归一层兼容 4326 直传（|值|≤360 判定，无需再投影）。
 *
 * 设计：
 * - 遵循功能模块范式：工厂注入 getViewer/getCesium，句柄留模块内，不进响应式；
 * - 监听 camera.moveEnd（拖拽/缩放/flyTo 收尾统一触发），与 2D moveend 同语义，
 *   start() 时立即推送一次首帧；
 * - 视域不可解（相机望向天空、地球不在视锥内）与跨反经线（west > east，
 *   min/max 区间相交语义失效）时写回 null——表格侧回退「范围不可用」提示，
 *   诚实降级优于给出错误的筛选结果；
 * - stop() 解绑监听并写回 null；切回 2D 后由 OL 容器初始化/moveend 重新喂入。
 *
 * 导出：
 * - createCesiumAttrViewExtentSync({ getViewer, getCesium })
 *   → { start, stop, pushCurrentExtent }
 */
import { useAttrStore } from '@ol/stores/useAttrStore';

export function createCesiumAttrViewExtentSync({ getViewer, getCesium }) {
    /** 已绑定到 camera.moveEnd 的回调（null = 未启动），持有引用用于解绑 */
    let boundHandler = null;
    /** 视域矩形 scratch 对象：复用避免每次相机停稳都新建 Rectangle */
    let scratchRectangle = null;

    /**
     * 计算当前相机视域并写入 attrStore（不可解 / 跨反经线时写 null）。
     * 暴露给外部用于强制刷新（如程序化 setView 后不经 moveEnd 的场景）。
     */
    function pushCurrentExtent() {
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!viewer || viewer.isDestroyed?.() || !Cesium) return;
        const attrStore = useAttrStore();

        if (!scratchRectangle && typeof Cesium.Rectangle === 'function') {
            scratchRectangle = new Cesium.Rectangle();
        }
        const rectangle = viewer.camera.computeViewRectangle(
            viewer.scene?.globe?.ellipsoid,
            scratchRectangle,
        );
        if (!rectangle) {
            attrStore.setMapExtent(null);
            return;
        }

        const west = Cesium.Math.toDegrees(rectangle.west);
        const south = Cesium.Math.toDegrees(rectangle.south);
        const east = Cesium.Math.toDegrees(rectangle.east);
        const north = Cesium.Math.toDegrees(rectangle.north);
        // 跨反经线时 west > east，attrStore 侧 min/max 相交判断会整体失真 → 诚实降级
        if (![west, south, east, north].every(Number.isFinite) || west > east) {
            attrStore.setMapExtent(null);
            return;
        }
        attrStore.setMapExtent([west, south, east, north]);
    }

    /** 绑定相机监听并立即同步一次（viewer 构造完成、cesiumReady 后调用） */
    function start() {
        const viewer = getViewer?.();
        if (!viewer || viewer.isDestroyed?.() || boundHandler) return;
        boundHandler = () => pushCurrentExtent();
        viewer.camera.moveEnd.addEventListener(boundHandler);
        pushCurrentExtent();
    }

    /** 解绑监听并清空范围（viewer 销毁重试 / 组件卸载前调用，可重复调用） */
    function stop() {
        const viewer = getViewer?.();
        if (boundHandler && viewer && !viewer.isDestroyed?.()) {
            try {
                viewer.camera.moveEnd.removeEventListener(boundHandler);
            } catch {
                /* viewer 销毁竞态：监听随实例回收，忽略 */
            }
        }
        boundHandler = null;
        try {
            useAttrStore().setMapExtent(null);
        } catch {
            /* pinia 已卸载等极端时序：忽略 */
        }
    }

    return { start, stop, pushCurrentExtent };
}
