<template>
    <aside
        class="cesium-tool-shell"
        :class="{
            'is-open': isPanelOpen,
            'is-embedded': embedded,
        }"
    >
        <button
            v-if="!embedded && !isPanelOpen"
            class="tool-launcher"
            type="button"
            :title="t('cesium.openConsole')"
            @click="setPanelOpen(true)"
        >
            <SlidersHorizontal
                :size="18"
                stroke-width="2"
            />
            <span>{{ t('cesium.advancedConsole') }}</span>
            <span
                v-if="activeModuleCount"
                class="launcher-count"
            >
                {{ activeModuleCount }}
            </span>
        </button>

        <section
            v-show="embedded || isPanelOpen"
            class="cesium-tool-panel"
            :class="{ compact: compactMode }"
            :aria-label="t('cesium.title')"
        >
            <header class="panel-header">
                <div class="panel-title-block">
                    <span class="panel-mark">
                        <Navigation
                            :size="18"
                            stroke-width="2"
                        />
                    </span>
                    <span class="panel-copy">
                        <span class="panel-title">{{ t('cesium.title') }}</span>
                        <span class="panel-subtitle">
                            {{ activeBasemapLabel }} / {{ activeTerrainLabel }}
                        </span>
                    </span>
                </div>

                <div class="panel-actions">
                    <button
                        class="icon-btn"
                        type="button"
                        :title="compactMode ? t('cesium.expandMode') : t('cesium.compactMode')"
                        @click="compactMode = !compactMode"
                    >
                        <Settings
                            :size="16"
                            stroke-width="2"
                        />
                    </button>
                    <button
                        v-if="!embedded"
                        class="icon-btn"
                        type="button"
                        :title="t('cesium.hide')"
                        @click="setPanelOpen(false)"
                    >
                        <X
                            :size="17"
                            stroke-width="2"
                        />
                    </button>
                </div>
            </header>

            <nav
                class="panel-tabs"
                :aria-label="t('cesium.tabsAria')"
            >
                <button
                    v-for="tab in panelTabs"
                    :key="tab.id"
                    class="tab-btn"
                    :class="{ active: activeTab === tab.id }"
                    type="button"
                    :aria-pressed="activeTab === tab.id"
                    @click="activeTab = tab.id"
                >
                    <component
                        :is="tab.icon"
                        :size="15"
                        stroke-width="2"
                    />
                    <span>{{ tab.label }}</span>
                </button>
            </nav>

            <div class="panel-scroll">
                <!-- 1. 场景 Tab (保持原样) -->
                <section
                    v-show="activeTab === 'scene'"
                    class="panel-page"
                >
                    <div class="overview-grid">
                        <div class="overview-tile">
                            <span class="overview-label">{{ t('cesium.mapSource') }}</span>
                            <strong>{{ activeBasemapLabel }}</strong>
                        </div>
                        <div class="overview-tile">
                            <span class="overview-label">{{ t('cesium.terrain') }}</span>
                            <strong>{{ activeTerrainLabel }}</strong>
                        </div>
                        <div class="overview-tile">
                            <span class="overview-label">{{ t('cesium.modules') }}</span>
                            <strong>{{ activeModuleCount }}/{{ featureModules.length }}</strong>
                        </div>
                    </div>

                    <div
                        v-if="sceneActions.length"
                        class="quick-actions"
                    >
                        <button
                            v-for="action in sceneActions"
                            :key="action.id"
                            class="tool-action"
                            :class="[action.variant || 'default', { active: action.active }]"
                            :disabled="action.disabled"
                            type="button"
                            @click="emitModuleAction(sceneModule.id, action.id)"
                        >
                            <component
                                :is="getActionIcon(sceneModule.id, action.id)"
                                :size="15"
                                stroke-width="2"
                            />
                            {{ action.label }}
                        </button>
                    </div>
                    <div
                        v-else
                        class="empty-state"
                    >{{ t('cesium.noSceneActions') }}</div>
                </section>

                <!-- 2. 图层 Tab (保持原样) -->
                <!-- 2. 图层 Tab (精细还原原图层样式) -->
                <section
                    v-show="activeTab === 'layers'"
                    class="panel-page"
                >
                    <!-- 底图源组 -->
                    <div
                        v-if="basemapOptions.length"
                        class="option-group"
                        :class="{ expanded: isLayerSectionExpanded('basemap') }"
                    >
                        <button
                            class="section-head section-toggle"
                            type="button"
                            :aria-expanded="isLayerSectionExpanded('basemap')"
                            @click="toggleLayerSection('basemap')"
                        >
                            <span class="section-main">
                                <Layers
                                    :size="16"
                                    stroke-width="2"
                                />
                                <span>{{ t('cesium.basemapSource') }}</span>
                            </span>
                            <span class="section-meta">
                                <span>{{ activeBasemapLabel }}</span>
                                <ChevronDown
                                    class="section-chevron"
                                    :size="15"
                                    stroke-width="2"
                                />
                            </span>
                        </button>
                        <div
                            v-if="isLayerSectionExpanded('basemap')"
                            class="section-body"
                        >
                            <div class="option-grid">
                                <button
                                    v-for="option in basemapOptions"
                                    :key="option.value"
                                    class="option-card"
                                    :class="{ active: option.value === activeBasemap }"
                                    type="button"
                                    :disabled="option.disabled"
                                    :aria-pressed="option.value === activeBasemap"
                                    :title="option.description || option.label"
                                    @click="selectBasemapOption(option)"
                                >
                                    <span class="option-card-label">{{ option.label }}</span>
                                    <Check
                                        v-if="option.value === activeBasemap"
                                        class="option-card-check"
                                        :size="14"
                                        stroke-width="2.5"
                                    />
                                </button>
                            </div>

                            <!-- 自定义 XYZ 图层输入 -->
                            <form
                                class="custom-basemap-editor"
                                @submit.prevent="submitCustomBasemap"
                            >
                                <div class="custom-basemap-input-row">
                                    <Link
                                        class="custom-basemap-icon"
                                        :size="15"
                                        stroke-width="2"
                                    />
                                    <input
                                        v-model="customBasemapDraft"
                                        class="custom-basemap-input"
                                        type="text"
                                        inputmode="url"
                                        spellcheck="false"
                                        placeholder="https://example.com/tiles/{z}/{x}/{y}.png"
                                    />
                                    <button
                                        class="custom-basemap-submit"
                                        type="submit"
                                        :disabled="!customBasemapDraft.trim()"
                                        :title="t('cesium.loadCustomXYZTitle')"
                                    >
                                        <Send
                                            :size="14"
                                            stroke-width="2"
                                        />
                                        <span>{{ t('cesium.loadCustomXYZ') }}</span>
                                    </button>
                                </div>
                                <div
                                    v-if="customBasemapUrl"
                                    class="custom-basemap-current"
                                >
                                    {{ customBasemapUrl }}
                                </div>
                            </form>
                        </div>
                    </div>

                    <!-- 地形组 -->
                    <div
                        v-if="terrainOptions.length"
                        class="option-group"
                        :class="{ expanded: isLayerSectionExpanded('terrain') }"
                    >
                        <button
                            class="section-head section-toggle"
                            type="button"
                            :aria-expanded="isLayerSectionExpanded('terrain')"
                            @click="toggleLayerSection('terrain')"
                        >
                            <span class="section-main">
                                <Mountain
                                    :size="16"
                                    stroke-width="2"
                                />
                                <span>{{ t('cesium.terrainLayer') }}</span>
                            </span>
                            <span class="section-meta">
                                <span>{{ activeTerrainLabel }}</span>
                                <ChevronDown
                                    class="section-chevron"
                                    :size="15"
                                    stroke-width="2"
                                />
                            </span>
                        </button>
                        <div
                            v-if="isLayerSectionExpanded('terrain')"
                            class="section-body"
                        >
                            <div class="option-grid">
                                <button
                                    v-for="option in terrainOptions"
                                    :key="option.value"
                                    class="option-card"
                                    :class="{ active: option.value === activeTerrain }"
                                    type="button"
                                    :aria-pressed="option.value === activeTerrain"
                                    :title="option.description || option.label"
                                    @click="$emit('update:activeTerrain', option.value)"
                                >
                                    <span class="option-card-label">{{ option.label }}</span>
                                    <Check
                                        v-if="option.value === activeTerrain"
                                        class="option-card-check"
                                        :size="14"
                                        stroke-width="2.5"
                                    />
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- 3. 叠加层组 (精细化卡片式设计) -->
                    <div
                        v-if="overlayOptions.length"
                        class="option-group"
                        :class="{ expanded: isLayerSectionExpanded('overlay') }"
                    >
                        <button
                            class="section-head section-toggle"
                            type="button"
                            :aria-expanded="isLayerSectionExpanded('overlay')"
                            @click="toggleLayerSection('overlay')"
                        >
                            <span class="section-main">
                                <Eye
                                    :size="16"
                                    stroke-width="2"
                                />
                                <span>{{ t('cesium.overlayLayers') }}</span>
                            </span>
                            <span class="section-meta">
                                <span>{{ t('cesium.activeOverlayCount', { active: activeOverlayCount, total: overlayOptions.length }) }}</span>
                                <ChevronDown
                                    class="section-chevron"
                                    :size="15"
                                    stroke-width="2"
                                />
                            </span>
                        </button>

                        <div
                            v-if="isLayerSectionExpanded('overlay')"
                            class="section-body"
                        >
                            <div class="overlay-card-list">
                                <div
                                    v-for="overlay in overlayOptions"
                                    :key="overlay.value"
                                    class="overlay-card"
                                    :class="{ active: !!overlay.active }"
                                >
                                    <!-- 卡片主栏 -->
                                    <div class="overlay-card-header">
                                        <div class="overlay-card-main">
                                            <span
                                                class="overlay-status-dot"
                                                :class="{ active: !!overlay.active }"
                                            ></span>
                                            <div class="overlay-card-info">
                                                <span class="overlay-card-title">{{ overlay.label }}</span>
                                                <span
                                                    v-if="overlay.description"
                                                    class="overlay-card-desc"
                                                >
                                                    {{ overlay.description }}
                                                </span>
                                            </div>
                                        </div>

                                        <!-- 操作按钮组 -->
                                        <div class="overlay-card-actions">
                                            <!-- 快速定位 (如果有坐标/FlyTo逻辑) -->
                                            <button
                                                v-if="overlay.hasLocation"
                                                class="overlay-action-btn flyto"
                                                type="button"
                                                :title="t('cesium.locateToOverlay')"
                                                @click.stop="emitOverlayFlyTo(overlay)"
                                            >
                                                <LocateFixed
                                                    :size="13"
                                                    stroke-width="2"
                                                />
                                            </button>

                                            <!-- 开关 Switch -->
                                            <button
                                                class="overlay-switch"
                                                :class="{ active: !!overlay.active }"
                                                type="button"
                                                :disabled="overlay.disabled"
                                                :aria-pressed="!!overlay.active"
                                                @click="emitOverlayToggle(overlay)"
                                            >
                                                <span class="switch-track">
                                                    <span class="switch-thumb"></span>
                                                </span>
                                            </button>
                                        </div>
                                    </div>

                                    <!-- 展开控制区：透明度调节（仅在激活时显示） -->
                                    <div
                                        v-if="overlay.active"
                                        class="overlay-card-controls"
                                    >
                                        <div class="overlay-control-row">
                                            <span class="control-label">{{ t('cesium.opacity') }}</span>
                                            <div class="slider-wrapper">
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="1"
                                                    step="0.05"
                                                    :value="overlay.opacity ?? 1"
                                                    class="overlay-slider"
                                                    @input="updateOverlayOpacity(overlay, $event)"
                                                />
                                            </div>
                                            <span class="control-value">
                                                {{ Math.round((overlay.opacity ?? 1) * 100) }}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 3. 数据 Tab (卡片重构版，彻底解决拥挤) -->
                <section
                    v-show="activeTab === 'data'"
                    class="panel-page"
                >
                    <!-- 文件拖拽上传框 -->
                    <label
                        for="cesium-data-file-input"
                        class="data-upload-area"
                        :aria-label="t('cesium.importData')"
                    >
                        <input
                            id="cesium-data-file-input"
                            ref="fileInputRef"
                            class="data-file-input"
                            type="file"
                            multiple
                            :accept="supportedFormats"
                            @change="handleFileSelect"
                        />
                        <div class="data-upload-hint">
                            <Upload
                                :size="24"
                                stroke-width="1.8"
                            />
                            <div class="upload-title">{{ t('cesium.uploadTitle') }}</div>
                            <span class="data-formats-label">
                                {{ t('cesium.supportedFormats') }}
                            </span>
                        </div>
                    </label>

                    <!-- 3D Tiles 快捷入口区 -->
                    <div class="tileset-quick-bar">
                        <button
                            class="tool-action mini"
                            type="button"
                            :title="t('cesium.zipImportTitle')"
                            @click="emit('import-tileset-zip')"
                        >
                            <FileArchive
                                :size="13"
                                stroke-width="2"
                            />
                            <span>{{ t('cesium.zipImport') }}</span>
                        </button>
                        <button
                            class="tool-action mini"
                            type="button"
                            :title="t('cesium.folderImportTitle')"
                            @click="emit('import-tileset-folder')"
                        >
                            <FolderOpen
                                :size="13"
                                stroke-width="2"
                            />
                            <span>{{ t('cesium.folder') }}</span>
                        </button>
                        <button
                            class="tool-action mini"
                            type="button"
                            :title="t('cesium.sampleDataTitle')"
                            @click="emit('import-tileset-sample')"
                        >
                            <Box
                                :size="13"
                                stroke-width="2"
                            />
                            <span>{{ t('cesium.sampleData') }}</span>
                        </button>
                    </div>

                    <!-- 已加载数据列表 -->
                    <div
                        v-if="localDataSources.length"
                        class="data-source-section"
                    >
                        <div class="data-source-head">
                            <span class="data-source-count">
                                {{ t('cesium.loadedDataSources', { count: localDataSources.length }) }}
                            </span>
                            <button
                                class="clear-all-btn"
                                type="button"
                                :title="t('cesium.clearAllTitle')"
                                @click="emitClearAll"
                            >
                                <Trash2
                                    :size="12"
                                    stroke-width="2"
                                />
                                <span>{{ t('cesium.clearAll') }}</span>
                            </button>
                        </div>

                        <!-- 独立卡片化列表 -->
                        <div class="data-source-list">
                            <div
                                v-for="source in displaySources"
                                :key="source.id"
                                class="data-source-card"
                                :class="{ 'is-hidden': !isSourceVisible(source) }"
                            >
                                <!-- 卡片头部：显隐 + 图标 + 标题/标签 + 操作按钮 -->
                                <div class="card-header">
                                    <button
                                        class="action-icon-btn visibility"
                                        type="button"
                                        :title="isSourceVisible(source) ? t('cesium.hideLayer') : t('cesium.show')"
                                        @click.stop="toggleSourceVisible(source)"
                                    >
                                        <Eye
                                            v-if="isSourceVisible(source)"
                                            :size="14"
                                            stroke-width="2"
                                        />
                                        <EyeOff
                                            v-else
                                            :size="14"
                                            stroke-width="2"
                                        />
                                    </button>
                                    <div class="card-type-icon">
                                        <component
                                            :is="getFormatIcon(source.type)"
                                            :size="15"
                                            stroke-width="2"
                                        />
                                    </div>
                                    <div
                                        class="card-info"
                                        :title="source.meta?.name || source.name"
                                    >
                                        <input
                                            v-if="renamingSourceId === source.id"
                                            v-model="renameDraft"
                                            class="card-rename-input"
                                            type="text"
                                            maxlength="60"
                                            @keyup.enter="commitRenameSource"
                                            @keyup.esc="cancelRenameSource"
                                            @blur="commitRenameSource"
                                            @click.stop
                                        />
                                        <span
                                            v-else
                                            class="card-title"
                                            :title="t('cesium.rename')"
                                            @dblclick.stop="startRenameSource(source)"
                                        >{{ source.meta?.name || source.name }}</span>
                                        <span class="card-tag">{{ formatLabel(source.type) }}</span>
                                    </div>
                                    <div class="card-actions">
                                        <button
                                            class="action-icon-btn flyto"
                                            type="button"
                                            :title="t('cesium.locate')"
                                            @click.stop="emitFlyTo(source.id)"
                                        >
                                            <Crosshair
                                                :size="14"
                                                stroke-width="2"
                                            />
                                        </button>
                                        <button
                                            v-if="source.type === 'gltf'"
                                            class="action-icon-btn reposition"
                                            type="button"
                                            :title="t('cesium.adjustPosition')"
                                            @click.stop="emitReposition(source.id)"
                                        >
                                            <MapPin
                                                :size="14"
                                                stroke-width="2"
                                            />
                                        </button>
                                        <button
                                            v-if="source.type === 'tif'"
                                            class="action-icon-btn stretch-height"
                                            type="button"
                                            :title="t('cesium.extrudeToElevation')"
                                            @click.stop="emitStretchHeight(source.id)"
                                        >
                                            <Mountain
                                                :size="14"
                                                stroke-width="2"
                                            />
                                        </button>
                                        <button
                                            class="action-icon-btn remove"
                                            type="button"
                                            :title="t('cesium.remove')"
                                            @click.stop="emitRemove(source.id)"
                                        >
                                            <X
                                                :size="14"
                                                stroke-width="2"
                                            />
                                        </button>
                                    </div>
                                </div>

                                <!-- 透明度（tif / gltf / 3dtiles，统一图层管理元数据驱动） -->
                                <div
                                    v-if="source.meta?.supportsOpacity"
                                    class="card-extended-controls"
                                >
                                    <div class="control-row">
                                        <span
                                            class="control-label"
                                            :title="t('cesium.layerOpacity')"
                                        >{{ t('cesium.transparency') }}</span>
                                        <div class="slider-wrapper">
                                            <input
                                                type="range"
                                                class="tileset-slider"
                                                min="0"
                                                max="1"
                                                step="0.05"
                                                :value="source.meta?.opacity ?? 1"
                                                @input="onSourceOpacityInput(source, $event.target.value)"
                                            />
                                        </div>
                                        <span class="control-value">
                                            {{ Math.round((source.meta?.opacity ?? 1) * 100) }}%
                                        </span>
                                    </div>
                                </div>

                                <!-- 卡片底部扩展项：仅 3D Tiles 显式展示（独占整栏，不占用顶部空间） -->
                                <div
                                    v-if="source.type === '3dtiles'"
                                    class="card-extended-controls"
                                >
                                    <!-- 高程滑杆 -->
                                    <div
                                        v-if="getTilesetHeightRange(source)"
                                        class="control-row"
                                    >
                                        <span
                                            class="control-label"
                                            :title="t('cesium.heightAdjust')"
                                        >{{ t('cesium.elevation') }}</span>
                                        <div class="slider-wrapper">
                                            <input
                                                type="range"
                                                class="tileset-slider"
                                                :min="getTilesetHeightRange(source).min"
                                                :max="getTilesetHeightRange(source).max"
                                                :step="1"
                                                :value="getTileHeight(source)"
                                                @input="emitSetHeight(source.id, $event.target.value)"
                                            />
                                        </div>
                                        <span class="control-value">
                                            {{ Math.round(getTileHeight(source)) }}m
                                        </span>
                                    </div>

                                    <!-- 材质选择器 -->
                                    <div class="control-row">
                                        <span class="control-label">{{ t('cesium.material') }}</span>
                                        <select
                                            class="material-select"
                                            :value="source.materialMode || 'baimo'"
                                            @change="emitSetMaterial(source.id, $event.target.value)"
                                        >
                                            <option value="pureWhite">{{ t('cesium.materials.pureWhite') }}</option>
                                            <option value="baimo">{{ t('cesium.materials.baimo') }}</option>
                                            <option value="heightStyle">{{ t('cesium.materials.heightStyle') }}</option>
                                            <option value="gradient">{{ t('cesium.materials.gradient') }}</option>
                                            <option value="none">{{ t('cesium.materials.none') }}</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div
                        v-else
                        class="empty-state"
                    >
                        {{ t('cesium.noImportedData') }}
                    </div>
                </section>

                <!-- 4. 模块 Tab (精细化工作流卡片设计) -->
                <section
                    v-show="activeTab === 'modules'"
                    class="panel-page"
                >
                    <div
                        v-if="featureModules.length"
                        class="module-card-list"
                    >
                        <article
                            v-for="module in featureModules"
                            :key="module.id"
                            class="module-card"
                            :class="{
                                expanded: isModuleExpanded(module.id),
                                active: module.statusTone === 'success' || module.statusTone === 'success'
                            }"
                        >
                            <!-- 模块头部（可点击展开/收起） -->
                            <button
                                class="module-card-header"
                                type="button"
                                :aria-expanded="isModuleExpanded(module.id)"
                                @click="toggleModule(module.id)"
                            >
                                <div class="module-card-main">
                                    <span class="module-card-icon">
                                        <component
                                            :is="getModuleIcon(module.id)"
                                            :size="16"
                                            stroke-width="2"
                                        />
                                    </span>
                                    <div class="module-card-info">
                                        <div class="module-card-title-row">
                                            <span class="module-card-title">{{ module.title }}</span>
                                            <!-- 模块状态 Badge -->
                                            <span
                                                v-if="module.status"
                                                class="module-card-badge"
                                                :class="module.statusTone || 'neutral'"
                                            >
                                                <span class="badge-dot"></span>
                                                {{ module.status }}
                                            </span>
                                        </div>
                                        <span
                                            v-if="module.description"
                                            class="module-card-desc"
                                        >
                                            {{ module.description }}
                                        </span>
                                    </div>
                                </div>

                                <div class="module-card-actions">
                                    <span class="module-expand-btn">
                                        <ChevronDown
                                            class="chevron-icon"
                                            :size="15"
                                            stroke-width="2"
                                        />
                                    </span>
                                </div>
                            </button>

                            <!-- 模块展开内容区 -->
                            <div
                                v-if="isModuleExpanded(module.id)"
                                class="module-card-body"
                            >
                                <!-- 模块快捷操作按钮组 -->
                                <div
                                    v-if="module.actions?.length"
                                    class="module-action-grid"
                                >
                                    <button
                                        v-for="action in module.actions"
                                        :key="action.id"
                                        class="module-action-btn"
                                        :class="[action.variant || 'default', { active: action.active }]"
                                        :disabled="action.disabled"
                                        type="button"
                                        @click.stop="emitModuleAction(module.id, action.id)"
                                    >
                                        <component
                                            :is="getActionIcon(module.id, action.id)"
                                            :size="13"
                                            stroke-width="2"
                                        />
                                        <span>{{ action.label }}</span>
                                    </button>
                                </div>

                                <!-- LilGuiControls 嵌入面板 -->
                                <div
                                    v-if="module.controls?.length"
                                    class="module-controls-wrapper"
                                    :class="module.controlLayout ? `layout-${module.controlLayout}` : ''"
                                >
                                    <LilGuiControls
                                        :title="module.title"
                                        :controls="module.controls"
                                        @change="emitControlChange(module.id, $event.control, $event.value)"
                                    />
                                </div>
                            </div>
                        </article>
                    </div>

                    <!-- 空状态展示 -->
                    <div
                        v-else
                        class="empty-state"
                    >
                        <span>{{ t('cesium.noModules') }}</span>
                    </div>
                </section>
            </div>
        </section>
    </aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import {
    Box,
    Check,
    ChevronDown,
    Crosshair,
    EyeOff,
    Droplets,
    Eye,
    FileArchive,
    FileJson,
    FolderOpen,
    Globe,
    Home,
    Image,
    Layers,
    Link,
    MapPin,
    Mountain,
    Navigation,
    Play,
    RotateCcw,
    Send,
    Settings,
    SlidersHorizontal,
    Sparkles,
    Trash2,
    Upload,
    Waves,
    Wind,
    X,
} from '@lucide/vue';
import LilGuiControls from './LilGuiControls.vue';
import { useLocale } from '@common/app/useLocale';
import { useCesiumLayersStore } from '@cesium-domain/stores/cesiumLayers';

const { t } = useLocale();

const props = defineProps({
    open: { type: Boolean, default: true },
    embedded: { type: Boolean, default: false },
    basemapOptions: { type: Array, default: () => [] },
    terrainOptions: { type: Array, default: () => [] },
    overlayOptions: { type: Array, default: () => [] },
    activeBasemap: { type: String, default: '' },
    activeTerrain: { type: String, default: '' },
    customBasemapUrl: { type: String, default: '' },
    modules: { type: Array, default: () => [] },
    storageKey: { type: String, default: 'cesium_tool_panel_ui' },
    loadedDataSources: { type: Array, default: () => [] },
});

const localDataSources = ref(Array.isArray(props.loadedDataSources) ? props.loadedDataSources : []);

// ==========================================
// 统一图层管理：元数据店（可见性/透明度/重命名，与 TOC「三维数据」分组同源）
// ==========================================
const cesiumLayersStore = useCesiumLayersStore();

/** 卡片渲染源：句柄记录（特化字段）+ 元数据（visible/opacity/显示名）合并视图 */
const displaySources = computed(() => localDataSources.value.map((source) => ({
    ...source,
    meta: cesiumLayersStore.getRecord(source.id) || null,
})));

/** 当前处于重命名编辑态的数据源 id 与草稿 */
const renamingSourceId = ref('');
const renameDraft = ref('');

function isSourceVisible(source) {
    return source?.meta ? source.meta.visible !== false : true;
}

function toggleSourceVisible(source) {
    cesiumLayersStore.setVisible(source.id, !isSourceVisible(source));
}

function onSourceOpacityInput(source, rawValue) {
    cesiumLayersStore.setOpacity(source.id, Number(rawValue));
}

function startRenameSource(source) {
    renamingSourceId.value = source.id;
    renameDraft.value = String(source.meta?.name || source.name || '');
}

function commitRenameSource() {
    if (renamingSourceId.value) {
        cesiumLayersStore.rename(renamingSourceId.value, renameDraft.value);
    }
    renamingSourceId.value = '';
    renameDraft.value = '';
}

function cancelRenameSource() {
    renamingSourceId.value = '';
    renameDraft.value = '';
}

watch(
    () => props.loadedDataSources,
    (next) => {
        const arr = Array.isArray(next) ? next : [];
        if (arr !== localDataSources.value) {
            localDataSources.value = arr;
        }
    },
    { immediate: true },
);

const emit = defineEmits([
    'update:open',
    'update:activeBasemap',
    'update:activeTerrain',
    'module-action',
    'control-change',
    'overlay-toggle',
    'custom-basemap-submit',
    'data-import',
    'data-remove',
    'data-clear-all',
    'data-flyto',
    'data-reposition',
    'data-stretch-height',
    'data-set-height',
    'import-tileset-zip',
    'import-tileset-folder',
    'import-tileset-sample',
    'data-set-material',
]);

const UI_STATE_VERSION = 3;
const storedUiState = readStoredUiState();
const shouldRestoreExpansionState = storedUiState.uiStateVersion === UI_STATE_VERSION;
const activeTab = ref(storedUiState.activeTab || 'scene');
const compactMode = ref(!!storedUiState.compactMode);
const expandedLayerSectionIds = ref(
    new Set(shouldRestoreExpansionState ? storedUiState.expandedLayerSectionIds || [] : []),
);
const expandedModuleIds = ref(
    new Set(shouldRestoreExpansionState ? storedUiState.expandedModuleIds || [] : []),
);
const customBasemapDraft = ref(props.customBasemapUrl || '');
const fileInputRef = ref(null);

const supportedFormats =
    '.geojson,.json,.kml,.kmz,.shp,.dbf,.shx,.prj,.cpg,.glb,.gltf,.czml,.zip';

const isPanelOpen = computed(() => props.embedded || props.open);
const sceneModule = computed(() => props.modules.find(m => m.id === 'scene') || null);
const sceneActions = computed(() => sceneModule.value?.actions || []);
const featureModules = computed(() => props.modules.filter(m => m.id !== 'scene'));
const activeModuleCount = computed(() => {
    return featureModules.value.filter(
        m => m.statusTone === 'success' || m.statusTone === 'warning',
    ).length;
});
const activeOverlayCount = computed(() => props.overlayOptions.filter(o => !!o.active).length);

const panelTabs = computed(() => [
    { id: 'scene', label: t('cesium.scene'), icon: Navigation },
    { id: 'layers', label: t('cesium.layers'), icon: Layers },
    { id: 'data', label: t('cesium.data'), icon: Upload },
    { id: 'modules', label: t('cesium.modules'), icon: SlidersHorizontal },
]);

const activeBasemapLabel = computed(() => {
    return props.basemapOptions.find(o => o.value === props.activeBasemap)?.label || t('cesium.notSelected');
});

const activeTerrainLabel = computed(() => {
    return props.terrainOptions.find(o => o.value === props.activeTerrain)?.label || t('cesium.notSelected');
});

watch(
    () => props.modules.map(m => m.id),
    (moduleIds) => {
        if (moduleIds.includes(activeTab.value)) return;
        if (['scene', 'layers', 'modules'].includes(activeTab.value)) return;
        activeTab.value = 'scene';
    },
    { immediate: true },
);

watch([activeTab, compactMode, expandedLayerSectionIds, expandedModuleIds], persistUiState, { deep: true });

watch(
    () => props.customBasemapUrl,
    (url) => {
        if (url !== customBasemapDraft.value) {
            customBasemapDraft.value = url || '';
        }
    },
);

function setPanelOpen(value) {
    emit('update:open', value);
}

function isLayerSectionExpanded(sectionId) {
    return expandedLayerSectionIds.value.has(sectionId);
}

function toggleLayerSection(sectionId) {
    const next = new Set(expandedLayerSectionIds.value);
    if (next.has(sectionId)) {
        next.delete(sectionId);
    } else {
        next.add(sectionId);
    }
    expandedLayerSectionIds.value = next;
}

function isModuleExpanded(moduleId) {
    return expandedModuleIds.value.has(moduleId);
}

function toggleModule(moduleId) {
    const next = new Set(expandedModuleIds.value);
    if (next.has(moduleId)) {
        next.delete(moduleId);
    } else {
        next.add(moduleId);
    }
    expandedModuleIds.value = next;
}

function selectBasemapOption(option) {
    if (option?.disabled) return;
    emit('update:activeBasemap', option.value);
}

function submitCustomBasemap() {
    emit('custom-basemap-submit', { url: customBasemapDraft.value });
}

function readStoredUiState() {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(props.storageKey);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function persistUiState() {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(
            props.storageKey,
            JSON.stringify({
                uiStateVersion: UI_STATE_VERSION,
                activeTab: activeTab.value,
                compactMode: compactMode.value,
                expandedLayerSectionIds: [...expandedLayerSectionIds.value],
                expandedModuleIds: [...expandedModuleIds.value],
            }),
        );
    } catch {
        // Preference storage catch
    }
}

function getModuleIcon(moduleId) {
    const icons = {
        scene: Navigation,
        effects: Sparkles,
        wind: Wind,
        fluid: Droplets,
        shallowWater: Waves,
    };
    return icons[moduleId] || SlidersHorizontal;
}

function getActionIcon(moduleId, actionId) {
    const icons = {
        scene: { home: Home, everest: Mountain, tileset: Box },
        wind: { load: Play, clear: Trash2 },
        fluid: { pick: Eye, clear: Trash2 },
        shallowWater: { toggle: Waves },
    };
    return icons[moduleId]?.[actionId] || RotateCcw;
}

function emitModuleAction(moduleId, actionId) {
    emit('module-action', { moduleId, actionId });
}

function emitControlChange(moduleId, control, rawValue) {
    const value = control.type === 'range' ? Number(rawValue) : rawValue;
    emit('control-change', { moduleId, controlId: control.id, value });
}

function emitOverlayToggle(overlay) {
    if (overlay.disabled) return;
    emit('overlay-toggle', { overlayId: overlay.value, value: !overlay.active });
}

function getFormatIcon(type) {
    const icons = {
        geojson: FileJson,
        json: FileJson,
        kml: Globe,
        kmz: Globe,
        shp: Layers,
        gltf: Box,
        czml: FileJson,
        '3dtiles': Box,
        tif: Image,
    };
    return icons[type] || FileJson;
}

function formatLabel(type) {
    const labels = {
        geojson: 'GeoJSON',
        json: 'JSON',
        kml: 'KML',
        kmz: 'KMZ',
        shp: 'Shapefile',
        gltf: 'GLTF',
        czml: 'CZML',
        '3dtiles': '3D Tiles',
        tif: 'GeoTIFF',
    };
    return labels[type] || type.toUpperCase();
}

function handleFileSelect(event) {
    const files = event.target?.files;
    if (!files || files.length === 0) return;
    emit('data-import', { files: Array.from(files) });
    if (fileInputRef.value) {
        fileInputRef.value.value = '';
    }
}

function emitRemove(id) { emit('data-remove', { id }); }
function emitFlyTo(id) { emit('data-flyto', { id }); }
function emitReposition(id) { emit('data-reposition', { id }); }
function emitStretchHeight(id) { emit('data-stretch-height', { id }); }
function emitClearAll() { emit('data-clear-all'); }

const tileHeightMap = ref({});

function getTilesetHeightRange(source) {
    const baseHeight = Number(
        source.currentBaseHeight
        ?? source.tilesetGeo?.initialBaseHeight
        ?? source.tilesetGeo?.bottomH,
    );

    if (source.terrainElevation) {
        // 值域并入当前基座高：配准正确的数据基座可能落在地形 [min,max] 之外，
        // 纯地形值域会让滑杆一碰就把模型拽到错误高度（B 修复：贴地链路配套）
        const lo = Math.min(
            source.terrainElevation.min,
            Number.isFinite(baseHeight) ? baseHeight : Infinity,
        ) - 30;
        const hi = Math.max(
            source.terrainElevation.max,
            Number.isFinite(baseHeight) ? baseHeight : -Infinity,
        ) + 30;
        return { min: Math.floor(lo), max: Math.ceil(hi) };
    }

    if (!Number.isFinite(baseHeight)) return null;

    return {
        min: Math.floor(baseHeight - 500),
        max: Math.ceil(baseHeight + 500),
    };
}

function getTileHeight(source) {
    if (source.currentBaseHeight !== undefined) {
        return source.currentBaseHeight;
    }
    if (tileHeightMap.value[source.id] !== undefined) {
        return tileHeightMap.value[source.id];
    }
    if (source.terrainElevation?.centerHeight !== undefined) {
        return source.terrainElevation.centerHeight;
    }
    return 0;
}

function emitSetHeight(sourceId, height) {
    const num = Number(height);
    tileHeightMap.value = { ...tileHeightMap.value, [sourceId]: num };
    emit('data-set-height', { id: sourceId, height: num });
}

function emitSetMaterial(sourceId, mode) {
    emit('data-set-material', { id: sourceId, mode });
}
</script>

<style scoped>
/* ==========================================================================
   1. 基础容器与外层 Shell (Shell & Launcher)
   ========================================================================== */
.cesium-tool-shell {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: var(--z-popover);
    max-width: min(390px, calc(100% - 24px));
    color: var(--ctp-text);
    pointer-events: none;
}

.cesium-tool-shell.is-embedded {
    position: relative;
    inset: auto;
    z-index: auto;
    width: 100%;
    max-width: none;
    color: var(--text-primary, #1e293b);
    pointer-events: auto;
}

.tool-launcher,
.cesium-tool-panel {
    pointer-events: auto;
}

.tool-launcher {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.42);
    border-radius: 8px;
    padding: 0 12px;
    background: rgba(var(--ctp-surface-rgb), 0.88);
    color: var(--ctp-text-launcher);
    box-shadow: 0 14px 34px rgba(var(--ctp-drop-rgb), 0.34);
    backdrop-filter: blur(14px);
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
}

.tool-launcher:hover {
    border-color: rgba(var(--ctp-cyan-soft-rgb), 0.72);
    background: rgba(var(--ctp-surface-hover-rgb), 0.94);
}

.launcher-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    border-radius: 999px;
    background: var(--ctp-green);
    color: var(--ctp-ink);
    font-size: 11px;
}

/* 主面板容器 */
.cesium-tool-panel {
    width: min(380px, calc(100vw - 24px));
    max-height: calc(100vh - 116px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.28);
    border-radius: 10px;
    background: rgba(var(--ctp-surface-rgb), 0.92);
    box-shadow: 0 20px 48px rgba(var(--ctp-drop-deep-rgb), 0.42);
    backdrop-filter: blur(16px);
}

.cesium-tool-shell.is-embedded .cesium-tool-panel {
    width: 100%;
    max-height: none;
    border-color: rgba(var(--ctp-embed-border-rgb), 0.18);
    background: var(--ctp-white-solid);
    box-shadow: none;
    color: var(--text-primary, #1e293b);
}

/* 面板头部 Header */
.panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(var(--ctp-ice-rgb), 0.16);
}

.panel-title-block {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
}

.panel-mark {
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid rgba(var(--ctp-green-alt-rgb), 0.32);
    background: rgba(var(--ctp-active-deep-rgb), 0.62);
    color: var(--ctp-mint-mark);
}

.panel-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
}

.panel-title {
    color: var(--ctp-title);
    font-size: 14px;
    font-weight: 800;
    line-height: 1.2;
}

.panel-subtitle {
    max-width: 210px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(var(--ctp-ice-text-rgb), 0.66);
    font-size: 11px;
}

.panel-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.icon-btn {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.24);
    border-radius: 7px;
    background: rgba(var(--ctp-white-rgb), 0.07);
    color: var(--ctp-icon);
    cursor: pointer;
}

.icon-btn:hover {
    border-color: rgba(var(--ctp-ice-rgb), 0.48);
    background: rgba(var(--ctp-white-rgb), 0.13);
}

/* 顶部 Tab 导航栏 */
.panel-tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid rgba(var(--ctp-ice-rgb), 0.14);
}

.tab-btn {
    min-width: 0;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: rgba(var(--ctp-ice-soft-rgb), 0.72);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
}

.tab-btn:hover {
    background: rgba(var(--ctp-white-rgb), 0.08);
    color: var(--ctp-tab-hover);
}

.tab-btn.active {
    border-color: rgba(var(--ctp-green-alt-rgb), 0.38);
    background: rgba(var(--ctp-active-tab-rgb), 0.6);
    color: var(--ctp-tab-active);
}

/* 面板主体滚动区域 */
.panel-scroll {
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-gutter: stable;
}

.panel-scroll::-webkit-scrollbar {
    width: 5px;
}

.panel-scroll::-webkit-scrollbar-track {
    background: rgba(var(--ctp-white-rgb), 0.02);
}

.panel-scroll::-webkit-scrollbar-thumb {
    background: rgba(var(--ctp-ice-rgb), 0.2);
    border-radius: 999px;
}

.panel-page {
    display: grid;
    gap: 12px;
    padding: 12px;
}


/* ==========================================================================
   2. 场景 Tab 与通用工具样式 (Scene & General)
   ========================================================================== */
.overview-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}

.overview-tile {
    min-width: 0;
    display: grid;
    gap: 4px;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.16);
    border-radius: 8px;
    padding: 9px 10px;
    background: rgba(var(--ctp-white-rgb), 0.06);
}

.overview-label {
    color: rgba(var(--ctp-ice-text-rgb), 0.58);
    font-size: 11px;
}

.overview-tile strong {
    overflow: hidden;
    color: var(--ctp-title);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.quick-actions,
.module-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    gap: 7px;
}

.empty-state {
    min-height: 54px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed rgba(var(--ctp-ice-rgb), 0.22);
    border-radius: 8px;
    color: rgba(var(--ctp-ice-text-rgb), 0.52);
    font-size: 12px;
}

.tool-action {
    min-width: 0;
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.18);
    border-radius: 7px;
    padding: 6px 10px;
    background: rgba(var(--ctp-white-rgb), 0.065);
    color: var(--ctp-text);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
}

.tool-action:hover {
    border-color: rgba(var(--ctp-ice-rgb), 0.42);
    background: rgba(var(--ctp-white-rgb), 0.12);
}

.tool-action.mini {
    min-height: 28px;
    padding: 4px 8px;
    font-size: 11px;
    background: rgba(var(--ctp-white-rgb), 0.04);
}


/* ==========================================================================
   3. 图层 Tab 专属样式 (Layers Tab)
   ========================================================================== */
.option-group {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.16);
    border-radius: 8px;
    background: rgba(var(--ctp-white-rgb), 0.035);
    transition: all 0.2s ease;
}

.option-group.expanded {
    border-color: rgba(var(--ctp-green-alt-rgb), 0.32);
    background: rgba(var(--ctp-expand-rgb), 0.35);
}

.section-head {
    display: flex;
    align-items: center;
    color: rgba(var(--ctp-mint-text-rgb), 0.92);
    font-size: 12px;
    font-weight: 700;
}

.section-toggle {
    width: 100%;
    min-height: 38px;
    justify-content: space-between;
    gap: 10px;
    border: 0;
    padding: 8px 12px;
    background: transparent;
    cursor: pointer;
    text-align: left;
}

.section-main {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.section-meta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: rgba(var(--ctp-ice-text-rgb), 0.55);
    font-size: 11px;
}

.section-chevron {
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.option-group.expanded .section-chevron {
    transform: rotate(180deg);
}

.section-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 10px 10px;
    border-top: 1px solid rgba(var(--ctp-ice-rgb), 0.1);
    background: rgba(var(--ctp-shadow-rgb), 0.15);
}

.option-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
}

.option-card {
    min-width: 0;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.15);
    border-radius: 6px;
    padding: 0 10px;
    background: rgba(var(--ctp-white-rgb), 0.04);
    color: rgba(var(--ctp-ice-text-rgb), 0.8);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    transition: all 0.15s ease;
}

.option-card:hover:not(:disabled) {
    border-color: rgba(var(--ctp-ice-rgb), 0.35);
    background: rgba(var(--ctp-white-rgb), 0.08);
    color: var(--ctp-white-solid);
}

.option-card.active {
    border-color: rgba(var(--ctp-green-alt-rgb), 0.55);
    background: rgba(var(--ctp-active-rgb), 0.55);
    color: var(--ctp-green);
}

.option-card-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.option-card-check {
    flex: 0 0 auto;
    color: var(--ctp-green);
}

.custom-basemap-editor {
    display: grid;
    gap: 6px;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.14);
    border-radius: 7px;
    padding: 8px;
    background: rgba(var(--ctp-white-rgb), 0.045);
}

.custom-basemap-input-row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
}

.custom-basemap-input {
    height: 30px;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.2);
    border-radius: 6px;
    background: rgba(var(--ctp-input-bg-rgb), 0.88);
    color: var(--ctp-text);
    padding: 0 8px;
    font-size: 11px;
}

.custom-basemap-submit {
    height: 30px;
    padding: 0 10px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid rgba(var(--ctp-green-alt-rgb), 0.42);
    border-radius: 6px;
    background: rgba(var(--ctp-submit-rgb), 0.76);
    color: var(--ctp-submit-text);
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
}

.custom-basemap-current {
    font-size: 10px;
    color: rgba(var(--ctp-ice-text-rgb), 0.5);
    word-break: break-all;
}

/* 叠加层 (Overlay Card) */
.overlay-card-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.overlay-card {
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.14);
    border-radius: 7px;
    background: rgba(var(--ctp-white-rgb), 0.035);
    overflow: hidden;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.overlay-card:hover {
    border-color: rgba(var(--ctp-ice-rgb), 0.3);
    background: rgba(var(--ctp-white-rgb), 0.06);
}

.overlay-card.active {
    border-color: rgba(var(--ctp-green-alt-rgb), 0.35);
    background: rgba(var(--ctp-expand-card-rgb), 0.35);
}

.overlay-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    min-height: 38px;
}

.overlay-card-main {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
}

.overlay-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(var(--ctp-white-rgb), 0.25);
    flex-shrink: 0;
    transition: all 0.2s ease;
}

.overlay-status-dot.active {
    background: var(--ctp-green);
    box-shadow: 0 0 8px rgba(var(--ctp-green-rgb), 0.6);
}

.overlay-card-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
}

.overlay-card-title {
    color: rgba(var(--ctp-mint-text-rgb), 0.92);
    font-size: 12px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.overlay-card-desc {
    color: rgba(var(--ctp-ice-text-rgb), 0.48);
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.overlay-card-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
}

.overlay-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 5px;
    background: rgba(var(--ctp-white-rgb), 0.05);
    color: rgba(var(--ctp-ice-text-rgb), 0.6);
    cursor: pointer;
    transition: all 0.15s ease;
}

.overlay-action-btn:hover {
    background: rgba(var(--ctp-cyan-rgb), 0.15);
    color: var(--ctp-cyan);
}

.overlay-switch {
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
}

.switch-track {
    width: 32px;
    height: 18px;
    border-radius: 999px;
    padding: 2px;
    background: rgba(var(--ctp-ice-rgb), 0.2);
    display: flex;
    align-items: center;
    transition: background 0.2s ease;
}

.switch-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--ctp-thumb);
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.overlay-switch.active .switch-track {
    background: var(--ctp-green);
}

.overlay-switch.active .switch-thumb {
    transform: translateX(14px);
    background: var(--ctp-ink);
}

.overlay-card-controls {
    padding: 6px 10px 8px 22px;
    border-top: 1px solid rgba(var(--ctp-ice-rgb), 0.08);
    background: rgba(var(--ctp-shadow-rgb), 0.15);
}

.overlay-control-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.overlay-control-row .control-label {
    font-size: 10px;
    color: rgba(var(--ctp-ice-text-rgb), 0.5);
    flex: 0 0 auto;
}

.overlay-control-row .slider-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
}

.overlay-slider {
    width: 100%;
    height: 3px;
    -webkit-appearance: none;
    appearance: none;
    background: rgba(var(--ctp-white-rgb), 0.15);
    border-radius: 2px;
    outline: none;
}

.overlay-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--ctp-green);
    cursor: pointer;
    transition: transform 0.12s ease;
}

.overlay-slider::-webkit-slider-thumb:hover {
    transform: scale(1.3);
    background: var(--ctp-green-bright);
}

.overlay-control-row .control-value {
    font-size: 10px;
    color: rgba(var(--ctp-ice-text-rgb), 0.7);
    font-variant-numeric: tabular-nums;
    flex: 0 0 28px;
    text-align: right;
}


/* ==========================================================================
   4. 数据 Tab 专属样式 (Data Tab)
   ========================================================================== */
.data-upload-area {
    position: relative;
    border: 1px dashed rgba(var(--ctp-ice-rgb), 0.3);
    border-radius: 8px;
    background: rgba(var(--ctp-white-rgb), 0.02);
    cursor: pointer;
    transition: all 0.2s ease;
}

.data-upload-area:hover {
    border-color: rgba(var(--ctp-green-alt-rgb), 0.6);
    background: rgba(var(--ctp-green-alt-rgb), 0.04);
}

.data-file-input {
    position: absolute;
    inset: 0;
    z-index: 2;
    opacity: 0;
    cursor: pointer;
}

.data-upload-hint {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 20px 14px;
    color: rgba(var(--ctp-ice-text-rgb), 0.7);
    text-align: center;
    pointer-events: none;
}

.data-upload-hint svg {
    color: var(--ctp-green);
}

.upload-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--ctp-text);
}

.data-formats-label {
    font-size: 10px;
    color: rgba(var(--ctp-ice-text-rgb), 0.45);
}

.tileset-quick-bar {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
}

/* 统一图层管理：隐藏态卡片降透明呈现（不移除，保留操作入口） */
.data-source-card.is-hidden {
    opacity: 0.55;
}

.data-source-card.is-hidden .card-title {
    color: var(--acc-text-soft, #5d7f6a);
}

/* 显隐按钮沿用 action-icon-btn 家族，强调色区分 */
.action-icon-btn.visibility {
    color: var(--brand-primary, #2f9a57);
}

/* 双击重命名的行内输入框 */
.card-rename-input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(var(--brand-primary-rgb, 47, 154, 87), 0.5);
    border-radius: 6px;
    background: var(--ctp-white-solid);
    color: var(--ctp-ink-neutral);
    font-size: 12px;
    padding: 2px 6px;
    outline: none;
}

.data-source-section {
    display: grid;
    gap: 8px;
}

.data-source-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.data-source-count {
    color: rgba(var(--ctp-ice-text-rgb), 0.6);
    font-size: 11px;
    font-weight: 700;
}

.clear-all-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: none;
    background: transparent;
    color: rgba(var(--ctp-danger-mid-rgb), 0.85);
    font-size: 11px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
}

.clear-all-btn:hover {
    background: rgba(var(--ctp-danger-rgb), 0.15);
    color: var(--ctp-danger-soft-solid);
}

.data-source-list {
    display: grid;
    gap: 8px;
}

.data-source-card {
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.16);
    border-radius: 8px;
    background: rgba(var(--ctp-white-rgb), 0.04);
    overflow: hidden;
    transition: border-color 0.18s ease;
}

.data-source-card:hover {
    border-color: rgba(var(--ctp-ice-rgb), 0.35);
    background: rgba(var(--ctp-white-rgb), 0.06);
}

.card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    min-height: 40px;
}

.card-type-icon {
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: rgba(var(--ctp-chip-bg-alt-rgb), 0.8);
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.2);
    color: var(--ctp-green);
}

.card-info {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
}

.card-title {
    overflow: hidden;
    color: var(--ctp-title);
    font-size: 12px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.card-tag {
    display: inline-block;
    align-self: flex-start;
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(var(--ctp-ice-rgb), 0.12);
    color: rgba(var(--ctp-ice-text-rgb), 0.6);
    font-size: 9px;
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: 0.3px;
}

.card-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 2px;
}

.action-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 5px;
    background: transparent;
    cursor: pointer;
    transition: all 0.15s ease;
}

.action-icon-btn.flyto {
    color: rgba(var(--ctp-cyan-rgb), 0.6);
}

.action-icon-btn.flyto:hover {
    color: var(--ctp-cyan);
    background: rgba(var(--ctp-cyan-rgb), 0.15);
}

.action-icon-btn.reposition {
    color: rgba(var(--ctp-warning-rgb), 0.6);
}

.action-icon-btn.reposition:hover {
    color: var(--ctp-warning-solid);
    background: rgba(var(--ctp-warning-rgb), 0.15);
}

.action-icon-btn.stretch-height {
    color: rgba(var(--ctp-green-alt-rgb), 0.6);
}

.action-icon-btn.stretch-height:hover {
    color: var(--ctp-green-alt);
    background: rgba(var(--ctp-green-alt-rgb), 0.15);
}

.action-icon-btn.remove {
    color: rgba(var(--ctp-danger-soft-rgb), 0.5);
}

.action-icon-btn.remove:hover {
    color: var(--ctp-danger-soft-solid);
    background: rgba(var(--ctp-danger-rgb), 0.18);
}

.card-extended-controls {
    display: grid;
    gap: 6px;
    padding: 6px 10px 8px 10px;
    border-top: 1px solid rgba(var(--ctp-ice-rgb), 0.1);
    background: rgba(var(--ctp-shadow-rgb), 0.18);
}

.control-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
}

.control-label {
    flex: 0 0 28px;
    color: rgba(var(--ctp-ice-text-rgb), 0.55);
    font-size: 10px;
}

.slider-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
}

.tileset-slider {
    width: 100%;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: rgba(var(--ctp-white-rgb), 0.15);
    border-radius: 2px;
    outline: none;
}

.tileset-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--ctp-green);
    cursor: pointer;
    transition: transform 0.12s;
}

.tileset-slider::-webkit-slider-thumb:hover {
    transform: scale(1.25);
    background: var(--ctp-green-bright);
}

.control-value {
    flex: 0 0 32px;
    text-align: right;
    color: rgba(var(--ctp-ice-text-rgb), 0.7);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
}

.material-select {
    flex: 1;
    height: 24px;
    background: rgba(var(--ctp-white-rgb), 0.08);
    color: var(--ctp-text);
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.18);
    border-radius: 4px;
    padding: 0 6px;
    font-size: 11px;
    outline: none;
    cursor: pointer;
}

.material-select:hover {
    border-color: rgba(var(--ctp-green-alt-rgb), 0.5);
}

.material-select option {
    background: var(--ctp-option-bg);
    color: var(--ctp-text);
}

/* ==========================================================================
   1. 基础容器与外层 Shell（关键：全链路高度约束与 min-height: 0）
   ========================================================================== */
.cesium-tool-shell {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: var(--z-popover);
    max-width: min(390px, calc(100% - 24px));
    color: var(--ctp-text);
    pointer-events: none;
}

.cesium-tool-shell.is-embedded {
    position: relative;
    inset: auto;
    z-index: auto;
    width: 100%;
    max-width: none;
    color: var(--text-primary);
    pointer-events: auto;
}

.tool-launcher,
.cesium-tool-panel {
    pointer-events: auto;
}

.tool-launcher {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.42);
    border-radius: 8px;
    padding: 0 12px;
    background: rgba(var(--ctp-surface-rgb), 0.88);
    color: var(--ctp-text-launcher);
    box-shadow: 0 14px 34px rgba(var(--ctp-drop-rgb), 0.34);
    backdrop-filter: blur(14px);
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
}

.tool-launcher:hover {
    border-color: rgba(var(--ctp-cyan-soft-rgb), 0.72);
    background: rgba(var(--ctp-surface-hover-rgb), 0.94);
}

.launcher-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    border-radius: 999px;
    background: var(--ctp-green);
    color: var(--ctp-ink);
    font-size: 11px;
}

/* 主面板容器：确定严格的纵向 Flex 布局 */
.cesium-tool-panel {
    width: min(380px, calc(100vw - 24px));
    /* 关键 1: 严格限制面板整体最大高度，留出上下边距 */
    max-height: calc(100vh - 100px); 
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.28);
    border-radius: 10px;
    background: rgba(var(--ctp-surface-rgb), 0.92);
    box-shadow: 0 20px 48px rgba(var(--ctp-drop-deep-rgb), 0.42);
    backdrop-filter: blur(16px);
}

.cesium-tool-shell.is-embedded .cesium-tool-panel {
    width: 100%;
    max-height: none;
    border-color: rgba(var(--ctp-embed-border-rgb), 0.18);
    background: var(--ctp-white-solid);
    box-shadow: none;
    color: var(--text-primary);
}

/* 面板头部 Header */
.panel-header {
    flex-shrink: 0; /* 关键 2: 头部固定不缩放 */
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(var(--ctp-ice-rgb), 0.16);
}

.panel-title-block {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
}

.panel-mark {
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid rgba(var(--ctp-green-alt-rgb), 0.32);
    background: rgba(var(--ctp-active-deep-rgb), 0.62);
    color: var(--ctp-mint-mark);
}

.panel-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
}

.panel-title {
    color: var(--ctp-title);
    font-size: 14px;
    font-weight: 800;
    line-height: 1.2;
}

.panel-subtitle {
    max-width: 210px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(var(--ctp-ice-text-rgb), 0.66);
    font-size: 11px;
}

.panel-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.icon-btn {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.24);
    border-radius: 7px;
    background: rgba(var(--ctp-white-rgb), 0.07);
    color: var(--ctp-icon);
    cursor: pointer;
}

.icon-btn:hover {
    border-color: rgba(var(--ctp-ice-rgb), 0.48);
    background: rgba(var(--ctp-white-rgb), 0.13);
}

/* 顶部 Tab 导航栏 */
.panel-tabs {
    flex-shrink: 0; /* 关键 3: Tab 栏固定不缩放 */
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid rgba(var(--ctp-ice-rgb), 0.14);
}

.tab-btn {
    min-width: 0;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: rgba(var(--ctp-ice-soft-rgb), 0.72);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
}

.tab-btn:hover {
    background: rgba(var(--ctp-white-rgb), 0.08);
    color: var(--ctp-tab-hover);
}

.tab-btn.active {
    border-color: rgba(var(--ctp-green-alt-rgb), 0.38);
    background: rgba(var(--ctp-active-tab-rgb), 0.6);
    color: var(--ctp-tab-active);
}

/* 主面板滚动区域（Tab 内容根容器） */
.panel-scroll {
    flex: 1;           /* 自动占据剩余全部空间 */
    min-height: 0;     /* 关键 4: 允许Flex子项目尺寸小于内容本身，从而触发滚动 */
    overflow-y: auto;  /* 开启纵向滚动条 */
    scrollbar-gutter: stable;
}

.panel-scroll::-webkit-scrollbar {
    width: 5px;
}

.panel-scroll::-webkit-scrollbar-track {
    background: rgba(var(--ctp-white-rgb), 0.02);
}

.panel-scroll::-webkit-scrollbar-thumb {
    background: rgba(var(--ctp-ice-rgb), 0.2);
    border-radius: 999px;
}

.panel-page {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    min-height: 0;
}


/* ==========================================================================
   5. 重构：模块 Tab 专属样式（重点解决内容超长、父级放不下问题）
   ========================================================================== */
.module-card-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
}

/* 模块卡片根容器 */
.module-card {
    position: relative;
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.12);
    border-radius: 9px;
    background: linear-gradient(180deg, rgba(var(--ctp-white-rgb), 0.04) 0%, rgba(var(--ctp-white-rgb), 0.01) 100%);
    box-shadow: 0 2px 8px rgba(var(--ctp-shadow-rgb), 0.2);
    overflow: hidden;
    transition: border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                background 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.module-card:hover {
    border-color: rgba(var(--ctp-ice-rgb), 0.32);
    background: rgba(var(--ctp-white-rgb), 0.06);
}

/* 激活运行态侧边发光高亮条 */
.module-card.active::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 3px;
    background: var(--ctp-green);
    box-shadow: 0 0 10px rgba(var(--ctp-green-rgb), 0.8);
    z-index: 2;
}

.module-card.expanded {
    border-color: rgba(var(--ctp-green-alt-rgb), 0.38);
    background: rgba(var(--ctp-expand-module-rgb), 0.35);
}

/* Header 头部 */
.module-card-header {
    flex-shrink: 0; /* 标题固定，不受展开内容挤压 */
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border: none;
    outline: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    user-select: none;
}

.module-card-main {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
}

.module-card-icon {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.18);
    background: rgba(var(--ctp-chip-bg-rgb), 0.75);
    color: var(--ctp-green);
}

.module-card-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.module-card-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.module-card-title {
    color: var(--ctp-title);
    font-size: 13px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.module-card-desc {
    color: rgba(var(--ctp-ice-text-rgb), 0.5);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.module-card-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    background: rgba(var(--ctp-white-rgb), 0.06);
    color: rgba(var(--ctp-ice-text-rgb), 0.6);
    border: 1px solid rgba(var(--ctp-white-rgb), 0.08);
}

.module-card-badge .badge-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
}

.module-card-badge.success,
.module-card-badge.active {
    border-color: rgba(var(--ctp-green-rgb), 0.35);
    background: rgba(var(--ctp-green-rgb), 0.12);
    color: var(--ctp-green);
}

.module-expand-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: rgba(var(--ctp-ice-text-rgb), 0.4);
}

.chevron-icon {
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.module-card.expanded .chevron-icon {
    transform: rotate(180deg);
}

/* 核心优化：展开内容区 Body（独立局部滚动保护） */
.module-card-body {
    padding: 10px 12px 12px;
    border-top: 1px solid rgba(var(--ctp-ice-rgb), 0.1);
    background: rgba(var(--ctp-shadow-rgb), 0.28);
    display: flex;
    flex-direction: column;
    gap: 10px;
    
    /* 解决溢出与撑爆的核心设置： */
    max-height: 360px;   /* 约束单卡片最大高度，超出自动卡片内滚动，不至于顶爆整个面板 */
    overflow-y: auto;   /* 启用纵向局部滚动条 */
    scrollbar-width: thin; /* 兼容 Firefox 瘦滚动条 */
}

/* 局部滚动条美化 */
.module-card-body::-webkit-scrollbar {
    width: 4px;
}
.module-card-body::-webkit-scrollbar-thumb {
    background: rgba(var(--ctp-ice-rgb), 0.25);
    border-radius: 4px;
}

/* 模块操作按钮网格 */
.module-action-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
    gap: 6px;
    flex-shrink: 0;
}

.module-action-btn {
    min-height: 28px;
    padding: 4px 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.16);
    border-radius: 6px;
    background: rgba(var(--ctp-white-rgb), 0.05);
    color: rgba(var(--ctp-mint-text-rgb), 0.85);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
}

.module-action-btn:hover:not(:disabled) {
    border-color: rgba(var(--ctp-ice-rgb), 0.45);
    background: rgba(var(--ctp-white-rgb), 0.12);
    color: var(--ctp-white-solid);
}

.module-action-btn.active {
    border-color: rgba(var(--ctp-green-alt-rgb), 0.5);
    background: rgba(var(--ctp-active-rgb), 0.6);
    color: var(--ctp-green);
}

/* LilGuiControls 嵌入面板容器 */
.module-controls-wrapper {
    border-radius: 6px;
    background: rgba(var(--ctp-shadow-rgb), 0.2);
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.08);
    padding: 6px;
    width: 100%;
    overflow-x: hidden; /* 防横向溢出 */
}

/* 修复 LilGui 在小面板中的默认拉伸样式 */
.module-controls-wrapper :deep(.lil-gui) {
    width: 100% !important;
    max-width: 100% !important;
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
}

.module-controls-wrapper :deep(.lil-gui .controller) {
    font-size: 11px !important;
}
</style>