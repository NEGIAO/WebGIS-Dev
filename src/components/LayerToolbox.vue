<template>
    <div class="layer-toolbox">
        <input
            ref="fileInputRef"
            type="file"
            multiple
            class="hidden-input"
            accept=".geojson,.json,.kml,.kmz,.zip,.shp,.shx,.dbf,.prj,.cpg,.tif,.tiff"
            @change="handleFileUpload"
        />
        <input
            ref="folderInputRef"
            type="file"
            multiple
            webkitdirectory
            directory
            class="hidden-input"
            @change="handleFolderUpload"
        />

        <div class="tabs">
            <button class="tab-btn" :class="{ active: activeTab === 'layers' }" @click="activeTab = 'layers'">图层</button>
            <button class="tab-btn" :class="{ active: activeTab === 'draw' }" @click="activeTab = 'draw'">绘制</button>
            <button class="tab-btn" :class="{ active: activeTab === 'style' }" @click="activeTab = 'style'">样式</button>
        </div>

        <AttributeTable />

        <div v-if="activeTab === 'layers'" class="tab-panel layers-panel">
            <div
                class="upload-zone"
                :class="{ dragging: isDragging }"
                @dragenter.prevent="onDragEnter"
                @dragover.prevent="onDragOver"
                @dragleave.prevent="onDragLeave"
                @drop.prevent="onDropUpload"
            >
                <div class="upload-title">上传图层</div>
                <div class="upload-actions">
                    <button class="btn" @click="fileInputRef?.click()">上传文件</button>
                    <button class="btn ghost" @click="folderInputRef?.click()">上传文件夹</button>
                </div>
                <div class="upload-tip">支持 ZIP / KML / SHP(含 dbf/shx/prj) / TIFF / GeoJSON，可拖拽到此区域</div>
                <div class="upload-status" v-if="isUploadLoading">解析中，请稍候...</div>
                <div class="upload-status success" v-else-if="lastSummary">
                    导入完成：成功 {{ lastSummary.importedDatasets }}，失败 {{ lastSummary.failedDatasets }}
                </div>
                <div class="upload-status error" v-if="uploadError">{{ uploadError }}</div>
            </div>

            <div class="layer-sections" v-if="layerGroups.some((group) => group.layers.length)">
                <section class="layer-group" v-for="group in layerGroups" :key="group.id" v-show="group.layers.length">
                    <header class="group-head">
                        <span>{{ group.title }}</span>
                        <span class="count">{{ group.layers.length }}</span>
                    </header>

                    <div
                        v-for="layer in group.layers"
                        :key="layer.id"
                        class="layer-item"
                        :draggable="!isRouteLayer(layer)"
                        @dragstart="onDragStart(layer.id)"
                        @dragover.prevent
                        @drop="onDropLayer(layer.id)"
                    >
                        <label class="layer-main">
                            <input
                                type="checkbox"
                                :checked="layer.visible"
                                @change="onLayerVisibilityChange(layer, $event.target.checked)"
                            />
                            <span class="layer-name" :title="layer.name">{{ layer.name }}</span>
                            <span class="layer-type">{{ layerTypeText(layer) }}</span>
                        </label>

                        <div class="layer-actions">
                            <button class="icon-btn" @click="focusLayer(layer)">定位</button>
                            <button
                                v-if="canStyleLayer(layer)"
                                class="icon-btn"
                                @click="pickStyleTarget(layer.id)"
                            >
                                样式
                            </button>
                            <button class="icon-btn danger" @click="removeLayer(layer)">删除</button>
                        </div>
                    </div>
                </section>
            </div>

            <div v-else class="empty">暂无业务图层（底图在搜索面板的底图行管理）</div>
        </div>

        <div v-else-if="activeTab === 'draw'" class="tab-panel draw-panel">
            <div class="draw-tools">
                <button class="draw-btn" :class="{ active: currentTool === 'draw-polygon' }" @click="toggleTool('draw-polygon')">绘制面</button>
                <button class="draw-btn" :class="{ active: currentTool === 'measure-length' }" @click="toggleTool('measure-length')">测距</button>
                <button class="draw-btn" :class="{ active: currentTool === 'measure-area' }" @click="toggleTool('measure-area')">测面</button>
                <button class="draw-btn ghost" :class="{ active: currentTool === 'none' }" @click="toolStore.setTool('none')">退出工具</button>
            </div>

            <div class="draw-tip" v-if="currentTool !== 'none'">
                当前工具：{{ drawToolLabel }}（在地图中单击或绘制）
            </div>
            <div class="draw-tip success" v-if="toolStore.lastMeasure">{{ toolStore.lastMeasure }}</div>
        </div>

        <div v-else class="tab-panel style-panel">
            <div class="style-row">
                <label class="style-label">目标图层</label>
                <select class="style-select" v-model="selectedStyleTarget">
                    <option v-for="option in styleTargets" :key="option.id" :value="option.id">{{ option.name }}</option>
                </select>
            </div>

            <div class="template-grid">
                <button
                    v-for="template in styleTemplates"
                    :key="template.id"
                    class="template-btn"
                    :style="{ borderColor: template.color }"
                    @click="applyTemplate(template.color)"
                >
                    <span class="dot" :style="{ backgroundColor: template.color }"></span>
                    {{ template.name }}
                </button>
            </div>

            <div class="style-grid">
                <div class="style-field">
                    <label>填充色</label>
                    <input type="color" v-model="styleForm.fillColor" />
                </div>
                <div class="style-field">
                    <label>描边色</label>
                    <input type="color" v-model="styleForm.strokeColor" />
                </div>
                <div class="style-field">
                    <label>填充透明度 {{ styleForm.fillOpacityPct }}%</label>
                    <input type="range" min="0" max="100" step="1" v-model.number="styleForm.fillOpacityPct" />
                </div>
                <div class="style-field">
                    <label>线宽 {{ styleForm.strokeWidth }}</label>
                    <input type="range" min="1" max="8" step="1" v-model.number="styleForm.strokeWidth" />
                </div>
                <div class="style-field">
                    <label>点半径 {{ styleForm.pointRadius }}</label>
                    <input type="range" min="2" max="16" step="1" v-model.number="styleForm.pointRadius" />
                </div>
            </div>

            <div class="style-actions">
                <button class="btn" :disabled="!styleTargets.length" @click="applyStyleToTarget">应用样式</button>
            </div>
            <div class="style-tip" v-if="styleStatus">{{ styleStatus }}</div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import GeoJSON from 'ol/format/GeoJSON';
import KML from 'ol/format/KML';
import { createEmpty, extend, getCenter, isEmpty } from 'ol/extent';
import { transformExtent } from 'ol/proj';
import { useLayerStore } from '../stores/layerStore';
import { useToolStore } from '../stores/toolStore';
import { useRouteStore } from '../stores/routeStore';
import { useMapStateStore } from '../stores/mapStateStore';
import { useGisLoader } from '../composables/useGisLoader';
import { useStyleEditor } from '../composables/useStyleEditor';
import { useMessage } from '../composables/useMessage';
import AttributeTable from './AttributeTable.vue';

const layerStore = useLayerStore();
const toolStore = useToolStore();
const routeStore = useRouteStore();
const mapStateStore = useMapStateStore();
const gisLoader = useGisLoader();
const message = useMessage();
const { styleTemplates, styleForm, buildStylePayload } = useStyleEditor();

const fileInputRef = ref(null);
const folderInputRef = ref(null);
const activeTab = ref('layers');
const isDragging = ref(false);
const draggingLayerId = ref('');
const lastSummary = ref(null);
const uploadError = ref('');
const styleStatus = ref('');
const selectedStyleTarget = ref('');
const isUploadLoading = computed(() => Boolean(gisLoader.isLoading?.value));

const currentTool = computed(() => toolStore.currentTool);

const drawToolLabel = computed(() => {
    switch (toolStore.currentTool) {
    case 'draw-polygon':
        return '绘制面';
    case 'measure-length':
        return '测距';
    case 'measure-area':
        return '测面';
    default:
        return '无';
    }
});

function normalizeSource(layer) {
    const sourceType = String(layer?.meta?.sourceType || '').toLowerCase();
    if (sourceType === 'upload' || sourceType === 'draw' || sourceType === 'search') {
        return sourceType;
    }

    const source = String(layer?.meta?.source || '').toLowerCase();
    if (source.includes('draw')) return 'draw';
    if (source.includes('search')) return 'search';
    if (source.includes('upload')) return 'upload';

    const kind = String(layer?.meta?.kind || '').toLowerCase();
    if (['kml', 'kmz', 'shp', 'tiff', 'geojson'].includes(kind)) return 'upload';

    const id = String(layer?.id || '');
    if (id.startsWith('draw_')) return 'draw';
    if (id.startsWith('search_')) return 'search';

    return 'upload';
}

const routeLayers = computed(() => {
    return routeStore.routes.map((route, index) => ({
        id: route.id,
        name: route.name || `路线 ${index + 1}`,
        type: 'route',
        visible: index === routeStore.activeRouteIndex,
        meta: {
            sourceType: 'route',
            routeIndex: index,
            routeMode: route.mode
        }
    }));
});

const groupedLayers = computed(() => {
    const groups = {
        upload: [],
        draw: [],
        search: []
    };

    layerStore.layers.forEach((layer) => {
        const source = normalizeSource(layer);
        groups[source]?.push(layer);
    });

    return [
        { id: 'upload', title: '上传图层', layers: groups.upload },
        { id: 'draw', title: '绘制图层', layers: groups.draw },
        { id: 'search', title: '搜索图层', layers: groups.search }
    ];
});

const layerGroups = computed(() => {
    return [
        { id: 'route', title: '路线图层', layers: routeLayers.value },
        ...groupedLayers.value
    ];
});

const drawLayers = computed(() => groupedLayers.value.find((group) => group.id === 'draw')?.layers || []);

const styleTargets = computed(() => {
    const targets = [];

    if (drawLayers.value.length) {
        targets.push({ id: '__draw_all__', name: `绘制图层（全部 ${drawLayers.value.length}）` });
    }

    layerStore.layers.forEach((layer) => {
        if (layer.type !== 'vector') return;
        targets.push({ id: layer.id, name: layer.name });
    });

    return targets;
});

watch(styleTargets, (targets) => {
    if (!targets.length) {
        selectedStyleTarget.value = '';
        return;
    }

    if (!targets.find((item) => item.id === selectedStyleTarget.value)) {
        selectedStyleTarget.value = targets[0].id;
    }
}, { immediate: true });

function isRouteLayer(layer) {
    return String(layer?.meta?.sourceType || '') === 'route';
}

function canStyleLayer(layer) {
    if (isRouteLayer(layer)) return false;
    return String(layer?.type || '') !== 'raster';
}

function layerTypeText(layer) {
    if (isRouteLayer(layer)) {
        return layer?.meta?.routeMode === 'drive' ? '驾车' : '公交';
    }
    return layer?.type === 'raster' ? '栅格' : '矢量';
}

function removeLayer(layer) {
    if (isRouteLayer(layer)) {
        routeStore.removeRouteById(layer.id);
        return;
    }
    layerStore.removeLayer(layer.id);
}

function onLayerVisibilityChange(layer, nextVisible) {
    if (isRouteLayer(layer)) {
        if (nextVisible) {
            routeStore.setActiveRouteById(layer.id);
        }
        return;
    }
    layerStore.toggleLayerVisibility(layer.id, nextVisible);
}

async function dispatchAndRemember(payload) {
    if (isUploadLoading.value) return;

    uploadError.value = '';

    try {
        const result = await gisLoader.dispatch(payload);
        lastSummary.value = result?.summary || null;

        const summary = result?.summary || {};
        const failed = Number(summary.failedDatasets || 0);
        const imported = Number(summary.importedDatasets || 0);
        const warnings = Array.isArray(result?.warnings) ? result.warnings.length : 0;

        if (imported > 0 || failed > 0 || warnings > 0) {
            message.notifyBatch({
                success: imported,
                failed,
                warnings,
                label: '图层导入'
            });
        }

        if (imported > 0) {
            const firstImportedId = String(result?.layers?.[0]?.id || '');
            if (firstImportedId) {
                const firstImportedLayer = layerStore.layers.find((item) => item.id === firstImportedId);
                if (firstImportedLayer) {
                    focusLayer(firstImportedLayer);
                }
            }
        }

        if (failed > 0) {
            uploadError.value = `有 ${failed} 个数据集导入失败，请检查文件格式`;
        }
    } catch (error) {
        console.error('图层导入失败', error);
        uploadError.value = error?.message || '导入失败，请检查文件格式';
        lastSummary.value = null;
        message.error(uploadError.value, { closable: true });
    }
}

async function handleFileUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    await dispatchAndRemember(gisLoader.createUploadPayloadFromFolder(files));

    event.target.value = '';
}

async function handleFolderUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    await dispatchAndRemember(gisLoader.createUploadPayloadFromFolder(files));
    event.target.value = '';
}

function onDragEnter() {
    isDragging.value = true;
}

function onDragOver() {
    isDragging.value = true;
}

function onDragLeave(event) {
    if (event.currentTarget === event.target) {
        isDragging.value = false;
    }
}

async function onDropUpload(event) {
    isDragging.value = false;

    const items = Array.from(event.dataTransfer?.items || []);
    const entries = items
        .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
        .filter(Boolean);

    if (entries.length) {
        await dispatchAndRemember(gisLoader.createUploadPayloadFromEntries(entries));
        return;
    }

    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;

    await dispatchAndRemember(gisLoader.createUploadPayloadFromFolder(files));
}

function onDragStart(layerId) {
    draggingLayerId.value = layerId;
}

function onDropLayer(targetLayerId) {
    if (!draggingLayerId.value || draggingLayerId.value === targetLayerId) return;

    const dragRoute = routeLayers.value.find((layer) => layer.id === draggingLayerId.value);
    const targetRoute = routeLayers.value.find((layer) => layer.id === targetLayerId);
    if (dragRoute || targetRoute) {
        draggingLayerId.value = '';
        return;
    }

    layerStore.reorderLayers({ fromId: draggingLayerId.value, toId: targetLayerId });
    draggingLayerId.value = '';
}

function pickStyleTarget(layerId) {
    selectedStyleTarget.value = layerId;
    activeTab.value = 'style';
}

function toggleTool(tool) {
    if (toolStore.currentTool === tool) {
        toolStore.setTool('none');
        return;
    }
    toolStore.setTool(tool);
}

function applyTemplate(color) {
    styleForm.value.fillColor = color;
    styleForm.value.strokeColor = color;
}

function applyStyleToTarget() {
    styleStatus.value = '';
    const target = String(selectedStyleTarget.value || '');
    if (!target) {
        styleStatus.value = '请选择要应用样式的图层';
        return;
    }

    const payload = buildStylePayload();

    if (target === '__draw_all__') {
        drawLayers.value.forEach((layer) => {
            layerStore.updateLayerStyle(layer.id, payload);
        });
        styleStatus.value = `已将样式应用到 ${drawLayers.value.length} 个绘制图层`;
        return;
    }

    layerStore.updateLayerStyle(target, payload);
    styleStatus.value = '样式已应用';
}

function resolveLayerExtent4326(layer) {
    if (isRouteLayer(layer)) {
        const route = routeStore.routes.find((item) => item.id === layer.id);
        const routeCoords = Array.isArray(route?.coordinates) ? route.coordinates : [];
        if (!routeCoords.length) return null;

        const lons = routeCoords.map((item) => Number(item?.[0])).filter((v) => Number.isFinite(v));
        const lats = routeCoords.map((item) => Number(item?.[1])).filter((v) => Number.isFinite(v));
        if (!lons.length || !lats.length) return null;

        return [
            Math.min(...lons),
            Math.min(...lats),
            Math.max(...lons),
            Math.max(...lats)
        ];
    }

    let extent3857 = null;

    if (Array.isArray(layer?.olFeatures) && layer.olFeatures.length) {
        const nextExtent = createEmpty();
        layer.olFeatures.forEach((feature) => {
            const geometry = feature?.getGeometry?.();
            if (!geometry) return;
            extend(nextExtent, geometry.getExtent());
        });
        if (!isEmpty(nextExtent)) {
            extent3857 = nextExtent;
        }
    } else if (layer?.olFeatures && typeof layer.olFeatures === 'object') {
        const features = new GeoJSON().readFeatures(layer.olFeatures, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
        });
        if (features.length) {
            const nextExtent = createEmpty();
            features.forEach((feature) => {
                const geometry = feature.getGeometry();
                if (!geometry) return;
                extend(nextExtent, geometry.getExtent());
            });
            if (!isEmpty(nextExtent)) {
                extent3857 = nextExtent;
            }
        }
    } else if (layer?.meta?.format === 'kml' && typeof layer?.olFeatures === 'string') {
        const features = new KML({ extractStyles: true }).readFeatures(layer.olFeatures, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
        });
        if (features.length) {
            const nextExtent = createEmpty();
            features.forEach((feature) => {
                const geometry = feature.getGeometry();
                if (!geometry) return;
                extend(nextExtent, geometry.getExtent());
            });
            if (!isEmpty(nextExtent)) {
                extent3857 = nextExtent;
            }
        }
    }

    if (!extent3857 || isEmpty(extent3857)) return null;

    try {
        return transformExtent(extent3857, 'EPSG:3857', 'EPSG:4326');
    } catch {
        return null;
    }
}

function estimateZoomByExtent(extent4326) {
    const spanLon = Math.abs(Number(extent4326[2]) - Number(extent4326[0]));
    const spanLat = Math.abs(Number(extent4326[3]) - Number(extent4326[1]));
    const span = Math.max(spanLon, spanLat);

    if (span > 40) return 4;
    if (span > 20) return 5;
    if (span > 10) return 6;
    if (span > 5) return 7;
    if (span > 2) return 8;
    if (span > 1) return 9;
    if (span > 0.5) return 10;
    if (span > 0.2) return 11;
    if (span > 0.1) return 12;
    if (span > 0.05) return 13;
    if (span > 0.02) return 14;
    return 15;
}

function focusLayer(layer) {
    if (isRouteLayer(layer)) {
        routeStore.setActiveRouteById(layer.id);
    }

    const lon = Number(layer?.meta?.longitude);
    const lat = Number(layer?.meta?.latitude);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
        mapStateStore.focusSearchLocation([lon, lat], Math.max(15, Number(mapStateStore.zoom || 15)));
        return;
    }

    const extent4326 = resolveLayerExtent4326(layer);
    if (!extent4326) {
        styleStatus.value = '当前图层缺少可定位的空间范围';
        return;
    }

    const center4326 = getCenter(extent4326);
    mapStateStore.setCenter([center4326[0], center4326[1]]);
    mapStateStore.setZoom(estimateZoomByExtent(extent4326));
}
</script>

<style scoped>
.layer-toolbox {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    background: linear-gradient(180deg, #f9fbfa 0%, #eef5f1 100%);
}

.hidden-input {
    display: none;
}

.tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}

.tab-btn {
    border: 1px solid #c6ddcf;
    border-radius: 10px;
    padding: 7px 8px;
    background: #ffffff;
    color: #2a4b39;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
}

.tab-btn.active {
    border-color: #2f8e58;
    background: linear-gradient(145deg, #2f8e58, #246d45);
    color: #ffffff;
}

.tab-panel {
    flex: 1;
    min-height: 0;
    border: 1px solid #d8e8de;
    border-radius: 10px;
    background: #fff;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.layers-panel {
    overflow-y: auto;
}

.upload-zone {
    border: 1.5px dashed #9dc9ae;
    border-radius: 10px;
    margin: 10px;
    padding: 12px;
    background: #ffffff;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.upload-zone.dragging {
    border-color: #2f8e58;
    box-shadow: 0 0 0 3px rgba(47, 142, 88, 0.15);
}

.upload-title {
    font-size: 14px;
    font-weight: 700;
    color: #254b35;
}

.upload-actions {
    margin-top: 8px;
    display: flex;
    gap: 8px;
}

.btn {
    border: 0;
    border-radius: 8px;
    padding: 7px 10px;
    background: #2f8e58;
    color: #fff;
    font-size: 12px;
    cursor: pointer;
}

.btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.btn.ghost {
    background: #edf7f0;
    color: #2f8e58;
    border: 1px solid #b7ddc7;
}

.upload-tip {
    margin-top: 8px;
    font-size: 12px;
    color: #678071;
}

.upload-status {
    margin-top: 6px;
    font-size: 12px;
    color: #2f8e58;
}

.upload-status.success {
    color: #1f6a40;
}

.upload-status.error {
    color: #a63f3f;
}

.layer-sections {
    padding: 0 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.layer-group {
    border: 1px solid #e2efe7;
    border-radius: 10px;
    overflow: hidden;
}

.group-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    background: #f3f9f5;
    border-bottom: 1px solid #e1ede5;
    font-size: 12px;
    font-weight: 700;
    color: #2a4736;
}

.count {
    background: #2f8e58;
    color: #fff;
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 11px;
}

.empty {
    padding: 14px;
    font-size: 12px;
    color: #73867a;
}

.layer-item {
    padding: 8px 10px;
    border-bottom: 1px solid #edf3ef;
}

.layer-item:last-child {
    border-bottom: 0;
}

.layer-main {
    display: flex;
    align-items: center;
    gap: 8px;
}

.layer-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    color: #1f2937;
}

.layer-type {
    font-size: 11px;
    color: #5a6f61;
}

.layer-actions {
    margin-top: 6px;
    display: flex;
    gap: 6px;
}

.icon-btn {
    border: 1px solid #c8dbd0;
    border-radius: 7px;
    background: #fff;
    color: #2d4a39;
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
}

.icon-btn.danger {
    color: #a63f3f;
    border-color: #ebc1c1;
}

.draw-panel {
    padding: 12px;
    gap: 10px;
}

.draw-tools {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.draw-btn {
    border: 1px solid #b8d6c4;
    border-radius: 8px;
    background: #ffffff;
    color: #2a4b39;
    font-size: 12px;
    padding: 8px 10px;
    cursor: pointer;
}

.draw-btn.active {
    border-color: #2f8e58;
    background: #edfbf2;
    color: #1f6a40;
    font-weight: 700;
}

.draw-btn.ghost {
    background: #f6faf8;
}

.draw-tip {
    font-size: 12px;
    color: #4d6658;
    line-height: 1.4;
}

.draw-tip.success {
    color: #1f6a40;
    font-weight: 700;
}

.style-panel {
    padding: 12px;
    gap: 10px;
    overflow-y: auto;
}

.style-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.style-label {
    font-size: 12px;
    font-weight: 700;
    color: #2a4b39;
}

.style-select {
    border: 1px solid #c6ddcf;
    border-radius: 8px;
    padding: 7px 8px;
    font-size: 12px;
    color: #264233;
    background: #fff;
}

.template-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.template-btn {
    border: 1px solid #c6ddcf;
    border-radius: 8px;
    padding: 7px 8px;
    background: #fff;
    color: #2a4b39;
    font-size: 12px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    justify-content: center;
}

.dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
}

.style-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.style-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.style-field label {
    font-size: 12px;
    color: #3f5e4c;
}

.style-actions {
    display: flex;
    justify-content: flex-end;
}

.style-tip {
    font-size: 12px;
    color: #1f6a40;
}

@media (max-width: 900px) {
    .draw-tools,
    .template-grid {
        grid-template-columns: 1fr;
    }
}
</style>
