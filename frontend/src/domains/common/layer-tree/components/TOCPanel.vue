<template>
    <div class="toolbox-panel">
        <!-- <input ref="fileInputRef" type="file" multiple class="hidden-input" accept=".geojson,.json,.kml,.kmz,.zip,.shp,.dbf,.shx,.prj,.cpg,.tif,.tiff" @change="handleFileUpload" /> -->
        <input
            ref="fileInputRef"
            type="file"
            multiple
            class="hidden-input"
            accept=".geojson,.json,.kml,.kmz,.zip,.shp,.dbf,.shx,.prj,.cpg,.tif,.tiff,.csv,.txt,.wkt"
            @change="handleFileUpload"
        />
        <input
            ref="folderInputRef"
            type="file"
            multiple
            webkitdirectory
            directory
            class="hidden-input"
            @change="handleDirectoryUpload"
        />

        <div class="header">
            <div>
                <div class="title">{{ t('layer.toolbox') }}</div>
            </div>
            <button
                class="toc-icon-btn"
                :title="t('layer.close')"
                @click="emit('close')"
            >
                <X :size="16" />
            </button>
        </div>

        <div
            class="tabs"
            :style="{ '--active-index': tabIndex }"
        >
            <button
                v-for="item in tabItems"
                :key="item.value"
                class="tab"
                :class="{ active: activeTab === item.value }"
                @click="activeTab = item.value"
            >
                <component
                    :is="item.icon"
                    :size="15"
                    stroke-width="2"
                />
                <span>{{ t(item.label) }}</span>
            </button>
        </div>

        <div
            v-if="activeTab === 'layers'"
            class="panel-scroll"
        >
            <LayerPanel
                :selected-layer-ids="multiSelectedLayerIds"
                @action="handleLayerTreeAction"
            />

            <AmapAoiInjectDialog
                :visible="manualAoiDialogVisible"
                :poi-id="manualAoiPoiId"
                :json-text="manualAoiJsonText"
                :detail-url="manualAoiDetailUrl"
                :source-layer-name="manualAoiSourceLayerName"
                :error-message="manualAoiError"
                @update:poi-id="manualAoiPoiId = $event"
                @update:json-text="manualAoiJsonText = $event"
                @open-detail="openManualAoiDetailLink"
                @submit="drawAmapAoiFromManualJson"
                @close="closeManualAoiDialog"
            />

            <div class="upload-zone-wrap">
                <div
                    class="upload-entry"
                    :class="{ dragging: isUploadDragging }"
                    @dragenter.prevent="handleUploadDragEnter"
                    @dragover.prevent="handleUploadDragOver"
                    @dragleave.prevent="handleUploadDragLeave"
                    @drop.prevent="handleUploadDrop"
                >
                    <div class="card-top">
                        <div class="card-title upload-title">
                            <span
                                class="upload-icon"
                                aria-hidden="true"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    width="16"
                                    height="16"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="1.8"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <path d="M12 16V5"></path>
                                    <path d="m8 9 4-4 4 4"></path>
                                    <path
                                        d="M20 16.5a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 16.5"
                                    ></path>
                                </svg>
                            </span>
                            {{ t('layer.uploadLayer') }}
                        </div>
                        <div class="upload-btns">
                            <button
                                class="small-btn"
                                @click="triggerFileUpload"
                            >
                                {{ t('layer.uploadFile') }}
                            </button>
                            <button
                                class="small-btn ghost"
                                @click="triggerFolderUpload"
                            >
                                {{ t('layer.uploadFolder') }}
                            </button>
                        </div>
                    </div>
                    <div class="upload-crs">
                        <label
                            class="upload-crs-label"
                            :title="t('layer.crsHint')"
                        >{{ t('layer.crsLabel') }}</label>
                        <select
                            v-model="importCrsPreset"
                            class="upload-crs-select"
                            :disabled="!!importCrsCustom.trim()"
                        >
                            <option value="">{{ t('layer.crsAuto') }}</option>
                            <optgroup :label="t('layer.crsGroupBasic')">
                                <option
                                    v-for="preset in basicCrsPresets"
                                    :key="preset.code"
                                    :value="preset.code"
                                >
                                    {{ preset.label }} · {{ preset.hint }}
                                </option>
                            </optgroup>
                            <optgroup :label="t('layer.crsGroupCgcs2000')">
                                <option
                                    v-for="preset in cgcs2000CrsPresets"
                                    :key="preset.code"
                                    :value="preset.code"
                                >
                                    {{ preset.hint }} · EPSG:{{ preset.code.slice(5) }}
                                </option>
                            </optgroup>
                            <optgroup :label="t('layer.crsGroupUtm')">
                                <option
                                    v-for="preset in utmCrsPresets"
                                    :key="preset.code"
                                    :value="preset.code"
                                >
                                    {{ preset.hint }} · EPSG:{{ preset.code.slice(5) }}
                                </option>
                            </optgroup>
                        </select>
                        <input
                            v-model="importCrsCustom"
                            class="upload-crs-input"
                            type="text"
                            spellcheck="false"
                            :title="t('layer.crsHint')"
                            :placeholder="t('layer.crsCustomPlaceholder')"
                        />
                    </div>
                    <div class="upload-tip">{{ t('layer.uploadTip') }}</div>
                    <div class="upload-crs-tip">
                        <span>{{ t('layer.fileSizeLimit', { size: MAX_FILE_SIZE_MB }) }}</span>
                        <span>{{ t('layer.dataFormats') }}</span>
                    </div>
                    <div
                        v-if="shouldShowUploadProgress"
                        class="upload-progress"
                        :class="`phase-${uploadProgressView.phase}`"
                    >
                        <div class="upload-progress-head">
                            <span>{{
                                t('layer.importStatus', {
                                    current: uploadProgressView.current,
                                    total: uploadProgressView.total || 1,
                                })
                            }}</span>
                            <span>{{ uploadProgressLabel }}</span>
                        </div>
                        <div class="upload-progress-bar">
                            <div
                                class="upload-progress-fill"
                                :style="{ width: `${uploadProgressPercent}%` }"
                            ></div>
                        </div>
                        <div class="upload-progress-meta">
                            <span>{{ t('layer.success', { count: uploadProgressView.success }) }}</span>
                            <span>{{ t('layer.failed', { count: uploadProgressView.failed }) }}</span>
                            <span v-if="uploadProgressView.warnings">{{
                                t('layer.warnings', { count: uploadProgressView.warnings })
                            }}</span>
                            <span v-if="uploadProgressView.errors">{{
                                t('layer.errors', { count: uploadProgressView.errors })
                            }}</span>
                        </div>
                        <div
                            v-if="uploadProgressView.message"
                            class="upload-progress-message"
                        >
                            {{ uploadProgressView.message }}
                        </div>
                    </div>
                </div>
            </div>

            <!-- 共享资源菜单 -->
            <div class="shared-resource-wrap">
                <div class="card shared-resource-card">
                    <div class="card-title shared-resource-title">
                        <span
                            class="share-icon"
                            aria-hidden="true"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                width="16"
                                height="16"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.8"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <circle
                                    cx="18"
                                    cy="5"
                                    r="3"
                                ></circle>
                                <circle
                                    cx="6"
                                    cy="12"
                                    r="3"
                                ></circle>
                                <circle
                                    cx="18"
                                    cy="19"
                                    r="3"
                                ></circle>
                                <line
                                    x1="8.59"
                                    y1="13.51"
                                    x2="15.42"
                                    y2="17.49"
                                ></line>
                                <line
                                    x1="15.41"
                                    y1="6.51"
                                    x2="8.59"
                                    y2="10.49"
                                ></line>
                            </svg>
                        </span>
                        {{ t('layer.sharedResources') }}
                    </div>
                    <div class="shared-resource-menu">
                        <button
                            class="shared-resource-btn"
                            :class="{ loading: sharedLoader.isScanning.value }"
                            @click="scanSharedResources"
                        >
                            <span v-if="!sharedLoader.isScanning.value"><FolderOpen :size="14" /> {{ t('layer.loadResources') }}</span>
                            <span v-else>⏳ {{ t('layer.scanning') }}</span>
                        </button>
                        <div
                            v-if="sharedLoader.hasResources.value"
                            class="resource-tree-root"
                        >
                            <SharedResourceTreeItem
                                v-for="node in sharedLoader.resourceTree.value"
                                :key="node.id"
                                :node="node"
                                :level="0"
                                @load-resource="loadSharedResource"
                            />
                        </div>
                        <div
                            v-else-if="!sharedLoader.isScanning.value && lastScanAttempted"
                            class="resource-empty"
                        >
                            {{ t('layer.noResources') }}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div
            v-else-if="activeTab === 'draw'"
            class="eco-panel-scroll"
        >
            <!-- 1. 核心绘图工具区 -->
            <div class="eco-section">
                <div class="section-header">
                    <span class="section-icon"><PenTool :size="12" /></span>
                    <span class="section-title">{{ t('layer.basicDraw') }}</span>
                    <span class="header-actions">
                        <button
                            class="mini-icon-btn"
                            :title="t('layer.zoomAll')"
                            @click="emit('interaction', 'ZoomToGraphics')"
                        >
                            <Maximize
                                :size="16"
                                :stroke-width="2"
                            />
                        </button>
                        <button
                            class="mini-icon-btn danger"
                            :title="t('layer.clearCanvas')"
                            @click="emit('interaction', 'Clear')"
                        >
                            <Eraser
                                :size="16"
                                :stroke-width="2"
                            />
                        </button>
                    </span>
                </div>
                <div class="eco-draw-grid">
                    <button
                        v-for="tool in drawTools"
                        :key="tool.value"
                        class="eco-tool-tile"
                        :class="{ active: selectedDrawTool === tool.value }"
                        @click="activateDrawTool(tool.value)"
                    >
                        <component
                            :is="tool.icon"
                            :size="16"
                            :stroke-width="1.8"
                        />
                        <span>{{ tool.label }}</span>
                    </button>
                </div>
            </div>

            <!-- 2. 精确坐标定位区 -->
            <div class="eco-section">
                <div class="section-header">
                    <span class="section-icon"><Crosshair :size="12" /></span>
                    <span class="section-title">{{ t('layer.coordLocate') }}</span>
                </div>

                <!-- 经纬度：一体化输入条 -->
                <div class="join-bar">
                    <input
                        v-model.trim="coordInputLon"
                        class="join-field"
                        :placeholder="t('layer.lonPlaceholder')"
                    />
                    <span class="join-sep"></span>
                    <input
                        v-model.trim="coordInputLat"
                        class="join-field"
                        :placeholder="t('layer.latPlaceholder')"
                    />
                    <select
                        v-model="coordInputCRS"
                        class="join-select"
                    >
                        <option value="wgs84">WGS-84</option>
                        <option value="gcj02">GCJ-02</option>
                    </select>
                    <button
                        class="join-go"
                        @click="drawPointByCoordinates"
                    >
                        {{ t('layer.draw') }}
                    </button>
                </div>

                <!-- P 参数码：同款输入条 -->
                <div class="join-bar mt-8">
                    <input
                        v-model.trim="coordInputP"
                        class="join-field"
                        :placeholder="t('layer.pParamPlaceholder')"
                    />
                    <button
                        class="join-go"
                        :disabled="isDecodePBusy"
                        @click="drawPointByPositionCode"
                    >
                        {{ isDecodePBusy ? '...' : t('layer.parse') }}
                    </button>
                </div>

                <div
                    v-if="coordInputError || coordInputPError"
                    class="eco-error-msg"
                >
                    {{ coordInputError || coordInputPError }}
                </div>
            </div>

            <!-- 3. 地理编码工具 -->
            <div class="eco-section">
                <div class="section-header">
                    <span class="section-icon"><Navigation :size="12" /></span>
                    <span class="section-title">{{ t('layer.geocode') }}</span>
                </div>

                <div class="join-bar">
                    <span class="join-lead">
                        <SearchIcon
                            :size="13"
                            :stroke-width="2"
                        />
                    </span>
                    <input
                        v-model.trim="geocodeAddressInput"
                        class="join-field grow-2"
                        :placeholder="t('layer.addressPlaceholder')"
                    />
                    <span class="join-sep"></span>
                    <input
                        v-model.trim="geocodeCityInput"
                        class="join-field"
                        :placeholder="t('layer.cityOptionalPlaceholder')"
                    />
                    <button
                        class="join-go"
                        :disabled="isGeocodeBusy"
                        @click="drawPointByGeocodeAddress"
                    >
                        {{ t('layer.encode') }}
                    </button>
                </div>

                <button
                    class="eco-btn-reverse mt-12"
                    @click="startReverseGeocodePick"
                >
                    <LocateFixed
                        :size="14"
                        :stroke-width="2"
                    />
                    {{ t('layer.reverseGeocode') }}
                </button>
            </div>

            <!-- 4. 底部操作提示 (改用气泡感设计) -->
            <div class="eco-hint-box">
                <div class="hint-item">
                    <span>{{ t('layer.hintLeftClickKey') }}</span> {{ t('layer.hintLeftClick') }}
                </div>
                <div class="hint-item">
                    <span>{{ t('layer.hintRightClickKey') }}</span> {{ t('layer.hintRightClick') }}
                </div>
                <div class="hint-item">
                    <span>{{ t('layer.hintMapRightClickKey') }}</span>
                    {{ t('layer.hintMapRightClick') }}
                </div>
            </div>
        </div>

        <div
            v-else-if="activeTab === 'download'"
            class="panel-scroll"
        >
            <MapDownloader
                :visible="true"
                @close="activeTab = 'layers'"
            />
        </div>

        <div
            v-else
            class="panel-scroll style-scroll"
        >
            <div class="style-panel">
                <!-- 样式模板 -->
                <div class="eco-section">
                    <div class="section-header">
                        <span class="section-icon"><Palette :size="12" /></span>
                        <span class="section-title">{{ t('layer.styleTemplates') }}</span>
                    </div>
                    <div class="template-swatch-grid">
                        <button
                            v-for="tpl in styleTemplates"
                            :key="tpl.id"
                            class="tpl-swatch"
                            :title="tpl.color"
                            @click="applyTemplate(tpl.id)"
                        >
                            <span
                                class="swatch-dot"
                                :style="{ background: tpl.color }"
                            ></span>
                            <span class="swatch-name">{{ tpl.name }}</span>
                        </button>
                    </div>
                </div>

                <!-- 样式编辑 -->
                <div class="eco-section">
                    <div class="section-header">
                        <span class="section-icon"><SlidersHorizontal :size="12" /></span>
                        <span class="section-title">{{ t('layer.styleEdit') }}</span>
                    </div>

                    <div class="join-bar">
                        <span class="join-lead">
                            <Layers
                                :size="13"
                                :stroke-width="1.9"
                            />
                        </span>
                        <select
                            v-model="selectedEditLayerId"
                            class="style-select"
                        >
                            <option
                                v-for="layer in editableLayers"
                                :key="layer.id"
                                :value="layer.id"
                            >
                                {{ layer.name }}
                            </option>
                        </select>
                    </div>

                    <div class="field-grid mt-8">
                        <label class="color-card">
                            <input
                                v-model="styleForm.fillColor"
                                type="color"
                                class="style-color"
                            />
                            <span class="color-meta">
                                <span class="color-label">{{ t('layer.fillColor') }}</span>
                                <span class="color-hex">{{ styleForm.fillColor }}</span>
                            </span>
                        </label>
                        <label class="color-card">
                            <input
                                v-model="styleForm.strokeColor"
                                type="color"
                                class="style-color"
                            />
                            <span class="color-meta">
                                <span class="color-label">{{ t('layer.strokeColor') }}</span>
                                <span class="color-hex">{{ styleForm.strokeColor }}</span>
                            </span>
                        </label>
                    </div>

                    <div class="field-grid mt-8">
                        <div class="field">
                            <div class="slider-head">
                                <label>{{ t('layer.fillOpacity') }}</label>
                                <span class="slider-value">{{ styleForm.fillOpacityPct }}%</span>
                            </div>
                            <input
                                v-model.number="styleForm.fillOpacityPct"
                                class="style-slider"
                                type="range"
                                min="0"
                                max="100"
                                :style="{ '--fill': `${styleForm.fillOpacityPct}%` }"
                            />
                        </div>
                        <div class="field">
                            <div class="slider-head">
                                <label>{{ t('layer.strokeWidth') }}</label>
                                <span class="slider-value">{{ styleForm.strokeWidth }}px</span>
                            </div>
                            <input
                                v-model.number="styleForm.strokeWidth"
                                class="style-slider"
                                type="range"
                                min="1"
                                max="8"
                                step="0.5"
                                :style="{ '--fill': `${((styleForm.strokeWidth - 1) / 7) * 100}%` }"
                            />
                        </div>
                    </div>
                </div>

                <button
                    class="apply-btn"
                    @click="applyStyle"
                >
                    <Paintbrush
                        :size="14"
                        :stroke-width="2"
                    />
                    {{ t('layer.applyStyle') }}
                </button>
            </div>
        </div>

        <LayerPropertiesDialog
            :visible="propertiesDialogVisible"
            :layer="propertiesDialogLayer"
            @close="propertiesDialogVisible = false"
            @reproject="handleReprojectLayer"
        />
    </div>
</template>


<script lang="ts" src="./TOCPanel.ts"></script>

<style scoped lang="scss" src="./styles/TOCPanel.scss"></style>

