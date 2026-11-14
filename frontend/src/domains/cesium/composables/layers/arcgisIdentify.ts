/**
 * 功能名称：ArcGIS 要素点查（query → 原生 InfoBox）
 * 日    期：2026/11/13
 *
 * 从 useCesiumLayers 拆出：常驻 LEFT_CLICK 监听收集可见可查候选，
 * 并发查询后只展示视觉最上层命中，展示层与 OL 共用 identifyPresentation。
 * 状态（处理器/候选信息/标记实体）内聚于本工厂。
 */

import {
    buildIdentifyGroupsHtml,
    composeIdentifyHeading,
} from '@common/basemap/identifyPresentation';
import { queryCandidateAtPoint } from '@common/basemap/wmsService';
import { renderOrderedIds, useRemoteServices } from '@common/basemap/remoteServices';

export interface ArcgisIdentifyCtx {
    /** 宿主 Viewer 获取器 */
    getViewer?: () => any;
    /** Cesium 命名空间获取器 */
    getCesium?: () => any;
    /** 消息系统 */
    message?: any;
}

/**
 * 创建 ArcGIS 要素点查管理器
 * @param ctx 宿主依赖
 * @returns bind/dispose/flyTo 与 InfoBox 描述工具；候选信息经 setIdentifyInfo 外部注入
 */
export function createArcgisIdentify({ getViewer, getCesium, message }: ArcgisIdentifyCtx) {
    let cesiumIdentifyHandler: any = null;
    let cesiumIdentifyInfo: any = null;
    let cesiumIdentifyEntity: any = null;

    /** 外部注入/清除候选信息（自定义底图流程提交时调用） */
    function setIdentifyInfo(info: any) {
        cesiumIdentifyInfo = info;
    }

    /** InfoBox 描述 HTML：统一由共享渲染器产出（转义/截断/空态文案与 OL 完全一致） */
    function buildIdentifyDescription(groups: any) {
        return buildIdentifyGroupsHtml(groups, { maxGroups: 8 });
    }

    /** 绑定/更新点击查询：监听常驻，候选 = 注册表可见可查服务 + 自定义底图流程服务 */
    function bindCesiumArcgisIdentify(info?: any) {
        cesiumIdentifyInfo = info && info.queryable ? info : null;
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        // 常驻绑定：候选集合动态收集（注册表 + 自定义流程），不依赖特定服务
        if (!viewer || !Cesium || typeof Cesium.ScreenSpaceEventHandler !== 'function') {
            return;
        }
        if (cesiumIdentifyHandler) return;

        const remoteStore = useRemoteServices();

        function collectCandidates() {
            const candidates = [];
            if (cesiumIdentifyInfo) {
                candidates.push({ serviceTitle: cesiumIdentifyInfo.title || '自定义服务', info: cesiumIdentifyInfo });
            }
            for (const record of remoteStore.records.value) {
                if (record.kind !== 'arcgis' || !record.visible || !record.queryable) continue;
                // 每个勾选子图层展开为独立候选（/{layerId}/query 精确点查），按视觉叠放序排列；
                // 标题不预拼子层名 —— 展示时由 [serviceTitle, layerName] 统一组合，避免重复
                for (const name of renderOrderedIds(record)) {
                    candidates.push({
                        serviceTitle: record.title || record.url,
                        info: { ...record, arcgis: true },
                        subLayerName: name,
                    });
                }
            }
            return candidates;
        }

        cesiumIdentifyHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        cesiumIdentifyHandler.setInputAction(async ({ position }: { position: any }) => {
            const candidates = collectCandidates();
            if (!candidates.length) return;
            const cartesian = viewer.camera.pickEllipsoid(position, viewer.scene.globe.ellipsoid);
            const rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
            if (!cartesian || !rect) return;

            const carto = Cesium.Cartographic.fromCartesian(cartesian);
            const lon = Cesium.Math.toDegrees(carto.longitude);
            const lat = Cesium.Math.toDegrees(carto.latitude);

            const extentDeg = [
                Cesium.Math.toDegrees(rect.west),
                Cesium.Math.toDegrees(rect.south),
                Cesium.Math.toDegrees(rect.east),
                Cesium.Math.toDegrees(rect.north),
            ];
            const canvas = viewer.scene.canvas;

            // 并发查询全部候选，统一归一化为 { hits:[{layerName,attributes}] }
            // （封装见 wmsService.queryCandidateAtPoint；失败抛错由 allSettled 收集）
            const settled = await Promise.allSettled(
                candidates.map((candidate) =>
                    queryCandidateAtPoint(candidate, [lon, lat], {
                        extent: extentDeg,
                        width: canvas.clientWidth,
                        height: canvas.clientHeight,
                    }),
                ),
            );

            // 全部候选都失败才报错（个别层 500/404 不打断其余层的展示）
            const failures = settled.filter((entry) => entry.status === 'rejected');
            if (failures.length && failures.length === settled.length) {
                const reason = failures[0].reason?.message || '网络异常';
                message.warning(`要素查询失败：${reason}`, { closable: true });
                return;
            }

            const groups = [];
            // ── 只取视觉最上层有命中的候选（与 ArcGIS Pro 行为一致）──
            // candidates 按 renderOrderedIds 排序（头部=视觉最上层），
            // 找到第一个有命中的候选后停止，不展示被遮挡的下层要素。
            // 分组统一为 {heading, attributes} 模型，HTML 渲染由 identifyPresentation 统一产出。
            for (const entry of settled) {
                if (entry.status !== 'fulfilled') continue;
                const { candidate, hits } = entry.value;
                if (!hits?.length) continue;
                for (const hit of hits.slice(0, 20)) {
                    groups.push({
                        heading: composeIdentifyHeading(candidate.serviceTitle, hit.layerName),
                        attributes: hit.attributes || {},
                    });
                }
                // 该候选有命中 → 即为视觉最上层有要素的层，停止向下搜索
                break;
            }

            // 每次点选替换上一个标记实体，选中即弹出 InfoBox
            if (cesiumIdentifyEntity) viewer.entities.remove(cesiumIdentifyEntity);
            cesiumIdentifyEntity = viewer.entities.add({
                position: Cesium.Cartesian3.fromDegrees(lon, lat),
                point: { pixelSize: 10, color: Cesium.Color.LIME, disableDepthTestDistance: Number.POSITIVE_INFINITY },
                name: '要素属性',
                description: buildIdentifyDescription(groups),
            });
            viewer.selectedEntity = cesiumIdentifyEntity;
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    function disposeCesiumArcgisIdentify() {
        cesiumIdentifyInfo = null;
        if (cesiumIdentifyHandler) {
            try {
                cesiumIdentifyHandler.destroy();
            } catch {
                /* ignore */
            }
            cesiumIdentifyHandler = null;
        }
        if (cesiumIdentifyEntity && getViewer?.()) {
            getViewer().entities.remove(cesiumIdentifyEntity);
            cesiumIdentifyEntity = null;
        }
    }

    /** 相机飞到服务的地理范围（info.geographicBbox 为经纬度 [w,s,e,n]） */
    function flyCameraToServiceExtent(info: any) {
        const geo = info?.geographicBbox;
        const viewer = getViewer?.();
        const Cesium = getCesium?.();
        if (!Array.isArray(geo) || geo.length !== 4 || !geo.every(Number.isFinite)) return;
        if (!viewer?.camera || typeof Cesium?.Rectangle?.fromDegrees !== 'function') return;

        try {
            viewer.camera.flyTo({
                destination: Cesium.Rectangle.fromDegrees(geo[0], geo[1], geo[2], geo[3]),
                duration: 1.5,
            });
        } catch (error) {
            console.warn('[useCesiumLayers] 相机定位服务范围失败:', error);
        }
    }

    return {
        setIdentifyInfo,
        buildIdentifyDescription,
        bindCesiumArcgisIdentify,
        disposeCesiumArcgisIdentify,
        flyCameraToServiceExtent,
    };
}
