<template>
    <div class="layer-toolbox">
        <input
            ref="fileInputRef"
            type="file"
            multiple
            class="hidden-input"
            accept=".geojson,.json,.kml,.kmz,.zip,.shp,.tif,.tiff"
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

        <div class="upload-zone" :class="{ dragging: isDragging }" @dragenter.prevent="onDragEnter" @dragover.prevent="onDragOver" @dragleave.prevent="onDragLeave" @drop.prevent="onDropUpload">
            <div class="upload-title">图层导入</div>
            <div class="upload-actions">
                <button class="btn" @click="fileInputRef?.click()">上传文件</button>
                <button class="btn ghost" @click="folderInputRef?.click()">上传文件夹</button>
            </div>
            <div class="upload-tip">支持拖拽 ZIP / KML / SHP / TIFF / GeoJSON</div>
            <div class="upload-status" v-if="gisLoader.isLoading">解析中，请稍候...</div>
            <div class="upload-status success" v-else-if="lastSummary">已导入 {{ lastSummary.importedDatasets }} 个数据集</div>
        </div>

        <div class="layer-list-wrap">
            <div class="layer-header">
                <span>图层列表</span>
                <span class="count">{{ layerStore.layers.length }}</span>
            </div>

            <div v-if="!layerStore.layers.length" class="empty">暂无图层</div>

            <div
                v-for="layer in layerStore.layers"
                :key="layer.id"
                class="layer-item"
                draggable="true"
                @dragstart="onDragStart(layer.id)"
                @dragover.prevent
                @drop="onDropLayer(layer.id)"
            >
                <label class="layer-main">
                    <input
                        type="checkbox"
                        :checked="layer.visible"
                        @change="layerStore.toggleLayerVisibility(layer.id, $event.target.checked)"
                    />
                    <span class="layer-name" :title="layer.name">{{ layer.name }}</span>
                    <span class="layer-type">{{ layer.type === 'raster' ? '栅格' : '矢量' }}</span>
                </label>

                <div class="layer-actions">
                    <button class="icon-btn" @click="layerStore.toggleLayerVisibility(layer.id)">
                        {{ layer.visible ? '隐藏' : '显示' }}
                    </button>
                    <button class="icon-btn danger" @click="layerStore.removeLayer(layer.id)">删除</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue';
import { useLayerStore } from '../stores/layerStore';
import { useGisLoader } from '../composables/useGisLoader';

const layerStore = useLayerStore();
const gisLoader = useGisLoader();

const fileInputRef = ref(null);
const folderInputRef = ref(null);
const isDragging = ref(false);
const draggingLayerId = ref('');
const lastSummary = ref(null);

async function dispatchAndRemember(payload) {
    const result = await gisLoader.dispatch(payload);
    lastSummary.value = result?.summary || null;
}

async function handleFileUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const payloads = gisLoader.createUploadPayloadsFromFiles(files);
    for (const payload of payloads) {
        await dispatchAndRemember(payload);
    }

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

    const payloads = gisLoader.createUploadPayloadsFromFiles(files);
    for (const payload of payloads) {
        await dispatchAndRemember(payload);
    }
}

function onDragStart(layerId) {
    draggingLayerId.value = layerId;
}

function onDropLayer(targetLayerId) {
    if (!draggingLayerId.value || draggingLayerId.value === targetLayerId) return;
    layerStore.reorderLayers({ fromId: draggingLayerId.value, toId: targetLayerId });
    draggingLayerId.value = '';
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

.upload-zone {
    border: 1.5px dashed #9dc9ae;
    border-radius: 10px;
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

.layer-list-wrap {
    flex: 1;
    min-height: 0;
    border: 1px solid #d8e8de;
    border-radius: 10px;
    background: #fff;
    overflow-y: auto;
}

.layer-header {
    position: sticky;
    top: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f2f8f4;
    border-bottom: 1px solid #d8e8de;
    padding: 8px 10px;
    font-size: 13px;
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
</style>
