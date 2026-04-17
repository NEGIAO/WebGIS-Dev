import { createEmpty, extend as extendExtent, isEmpty as isExtentEmpty } from 'ol/extent';

/**
 * 路线步骤交互功能库
 * 职责：步骤激活状态、悬停预览状态、步骤缩放。
 */
export function createRouteStepInteraction({
    mapInstanceRef,
    routeSource,
    getRouteLayer,
    ensureRouteBuilderApi
}) {
    let busActiveStepIndex = -1;
    let busHoverStepIndex = -1;
    let driveActiveStepIndex = -1;
    let driveHoverStepIndex = -1;

    const notifyRouteLayerChanged = () => {
        getRouteLayer?.()?.changed?.();
    };

    const getCurrentBusStepIndex = () => {
        return busHoverStepIndex >= 0 ? busHoverStepIndex : busActiveStepIndex;
    };

    const getCurrentDriveStepIndex = () => {
        return driveHoverStepIndex >= 0 ? driveHoverStepIndex : driveActiveStepIndex;
    };

    const resetRouteStepStates = () => {
        busActiveStepIndex = -1;
        busHoverStepIndex = -1;
        driveActiveStepIndex = -1;
        driveHoverStepIndex = -1;
        notifyRouteLayerChanged();
    };

    const getRouteStepFeatures = (routeMode, stepIndex) => {
        const targetStepIndex = Number(stepIndex);
        if (!Number.isFinite(targetStepIndex) || targetStepIndex < 0) return [];

        return routeSource.getFeatures().filter((feature) => (
            feature.get('routeMode') === routeMode && Number(feature.get('stepIndex')) === targetStepIndex
        ));
    };

    const zoomToRouteStep = async (routeMode, stepIndex, options = {}) => {
        const map = mapInstanceRef?.value;
        if (!map) {
            throw new Error('地图尚未初始化');
        }

        const { fitExtentToCoverage } = await ensureRouteBuilderApi();

        const targetStepIndex = Number(stepIndex);
        if (!Number.isFinite(targetStepIndex) || targetStepIndex < 0) {
            throw new Error('步骤索引无效');
        }

        const stepFeatures = getRouteStepFeatures(routeMode, targetStepIndex);
        if (!stepFeatures.length) {
            const routeLabel = routeMode === 'drive' ? '驾车' : '公交';
            throw new Error(`未找到${routeLabel}步骤 ${targetStepIndex + 1} 对应路段`);
        }

        if (routeMode === 'drive') {
            driveActiveStepIndex = targetStepIndex;
            driveHoverStepIndex = -1;
        } else {
            busActiveStepIndex = targetStepIndex;
            busHoverStepIndex = -1;
            driveActiveStepIndex = -1;
            driveHoverStepIndex = -1;
        }
        notifyRouteLayerChanged();

        const stepExtent = createEmpty();
        stepFeatures.forEach((feature) => {
            const geometry = feature.getGeometry();
            if (!geometry) return;
            extendExtent(stepExtent, geometry.getExtent());
        });

        if (!isExtentEmpty(stepExtent)) {
            fitExtentToCoverage(map, stepExtent, {
                targetCoverage: options.targetCoverage ?? 0.84,
                bufferRatio: options.bufferRatio ?? 0.16,
                minBufferMeters: options.minBufferMeters ?? 120,
                maxBufferMeters: options.maxBufferMeters ?? 1200,
                padding: options.padding ?? [72, 72, 72, 72],
                duration: options.duration ?? 650,
                minZoom: options.minZoom ?? 10,
                maxZoom: options.maxZoom ?? 19
            });
        }
    };

    const previewRouteStep = (routeMode, stepIndex) => {
        const targetStepIndex = Number(stepIndex);
        const normalized = Number.isFinite(targetStepIndex) && targetStepIndex >= 0 ? targetStepIndex : -1;

        if (routeMode === 'drive') {
            driveHoverStepIndex = normalized;
        } else {
            busHoverStepIndex = normalized;
        }
        notifyRouteLayerChanged();
    };

    const clearRouteStepPreview = (routeMode) => {
        if (routeMode === 'drive') {
            driveHoverStepIndex = -1;
        } else {
            busHoverStepIndex = -1;
        }
        notifyRouteLayerChanged();
    };

    const zoomToDriveRouteStep = async (stepIndex) => {
        return zoomToRouteStep('drive', stepIndex, {
            targetCoverage: 0.84,
            bufferRatio: 0.16,
            minBufferMeters: 120,
            maxBufferMeters: 1200,
            padding: [72, 72, 72, 72],
            duration: 650,
            minZoom: 10,
            maxZoom: 19
        });
    };

    const zoomToBusRouteStep = async (stepIndex) => {
        return zoomToRouteStep('bus', stepIndex, {
            targetCoverage: 0.84,
            bufferRatio: 0.16,
            minBufferMeters: 120,
            maxBufferMeters: 1200,
            padding: [72, 72, 72, 72],
            duration: 650,
            minZoom: 10,
            maxZoom: 19
        });
    };

    const previewBusRouteStep = (stepIndex) => {
        previewRouteStep('bus', stepIndex);
    };

    const clearBusRouteStepPreview = () => {
        clearRouteStepPreview('bus');
    };

    const previewDriveRouteStep = (stepIndex) => {
        previewRouteStep('drive', stepIndex);
    };

    const clearDriveRouteStepPreview = () => {
        clearRouteStepPreview('drive');
    };

    return {
        getCurrentBusStepIndex,
        getCurrentDriveStepIndex,
        resetRouteStepStates,
        zoomToRouteStep,
        zoomToDriveRouteStep,
        zoomToBusRouteStep,
        previewRouteStep,
        clearRouteStepPreview,
        previewBusRouteStep,
        clearBusRouteStepPreview,
        previewDriveRouteStep,
        clearDriveRouteStepPreview
    };
}
