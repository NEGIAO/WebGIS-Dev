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
                        <Maximize2
                            v-if="compactMode"
                            :size="18"
                            stroke-width="2"
                        />
                        <Minimize2
                            v-else
                            :size="18"
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
                            :size="20"
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
                        <!-- 加载 3D 模型：样例下拉菜单（场景 Tab 独立样式） -->
                        <div
                            ref="sceneSampleDropdownRef"
                            class="scene-sample-dropdown"
                        >
                            <button
                                class="tool-action"
                                type="button"
                                :title="t('cesium.sampleDataTitle')"
                                @click="sceneSampleMenuOpen = !sceneSampleMenuOpen"
                            >
                                <Box
                                    :size="15"
                                    stroke-width="2"
                                />
                                <span>{{ t('cesium.load3DModel') }}</span>
                                <ChevronDown
                                    :size="14"
                                    stroke-width="2"
                                    class="scene-sample-chevron"
                                />
                            </button>
                            <Teleport to="body">
                                <div
                                    v-show="sceneSampleMenuOpen"
                                    class="scene-sample-menu"
                                    :style="sceneSampleMenuStyle"
                                >
                                    <button
                                        type="button"
                                        class="scene-sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'city' }); sceneSampleMenuOpen = false"
                                    >
                                        <MapPin :size="16" stroke-width="2" />
                                        <span>{{ t('cesium.sampleCity') }}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="scene-sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'ion' }); sceneSampleMenuOpen = false"
                                    >
                                        <Globe :size="16" stroke-width="2" />
                                        <span>{{ t('cesium.sampleIon') }}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="scene-sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'i3s' }); sceneSampleMenuOpen = false"
                                    >
                                        <Building :size="16" stroke-width="2" />
                                        <span>{{ t('cesium.sampleI3s') }}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="scene-sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'discreteLOD' }); sceneSampleMenuOpen = false"
                                    >
                                        <Layers :size="16" stroke-width="2" />
                                        <span>{{ t('cesium.sampleLod') }}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="scene-sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'baimo' }); sceneSampleMenuOpen = false"
                                    >
                                        <Building :size="16" stroke-width="2" />
                                        <span>{{ t('cesium.sampleBaimo') }}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="scene-sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'gxu' }); sceneSampleMenuOpen = false"
                                    >
                                        <Building :size="16" stroke-width="2" />
                                        <span>{{ t('cesium.sampleGxu') }}</span>
                                    </button>
                                </div>
                            </Teleport>
                        </div>
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
                                    <span class="option-card-label">
                                        <span class="preset-index">{{ option.label.split(' ')[0] }}</span>
                                        <span class="preset-name">{{ option.label.slice(option.label.indexOf(' ') + 1) }}</span>
                                    </span>
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
                                    <LinkIcon
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
                                        placeholder="https://example.com/tiles/{z}/{x}/{y}.png 或 WMS 服务 URL"
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
                                <!-- WMS 图层选择器：输入 WMS 地址后自动枚举可选图层 -->
                                <div
                                    v-if="wmsLayersLoading || wmsLayerOptions.length"
                                    class="wms-layer-picker"
                                >
                                    <label class="wms-layer-label">WMS 图层<span
                                        v-if="wmsLayersLoading"
                                        class="wms-layer-loading"
                                    >（枚举中…）</span></label>
                                    <select
                                        v-if="!wmsLayersLoading && wmsLayerOptions.length"
                                        v-model="selectedWmsLayer"
                                        class="wms-layer-select"
                                        @change="onWmsLayerChange"
                                    >
                                        <option
                                            v-for="option in wmsLayerOptions"
                                            :key="option.name"
                                            :value="option.name"
                                            :title="option.path || option.title"
                                        >
                                            {{ option.label }}
                                        </option>
                                    </select>
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
                        <div ref="sampleDropdownRef" class="sample-dropdown">
                            <button
                                class="tool-action mini"
                                type="button"
                                :title="t('cesium.sampleDataTitle')"
                                @click="sampleMenuOpen = !sampleMenuOpen"
                            >
                                <Box
                                    :size="13"
                                    stroke-width="2"
                                />
                                <span>{{ t('cesium.sampleData') }}</span>
                                <ChevronDown
                                    :size="14"
                                    stroke-width="2"
                                    class="sample-chevron"
                                />
                            </button>
                            <Teleport to="body">
                                <div
                                    v-show="sampleMenuOpen"
                                    class="sample-menu"
                                    :style="sampleMenuStyle"
                                >
                                    <button
                                        type="button"
                                        class="sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'city' }); sampleMenuOpen = false"
                                    >
                                        <MapPin :size="16" stroke-width="2" />
                                        <span>{{ t('cesium.sampleCity') }}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'ion' }); sampleMenuOpen = false"
                                    >
                                        <Globe :size="16" stroke-width="2" />
                                        <span>{{ t('cesium.sampleIon') }}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'i3s' }); sampleMenuOpen = false"
                                    >
                                        <Building :size="16" stroke-width="2" />
                                        <span>{{ t('cesium.sampleI3s') }}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'discreteLOD' }); sampleMenuOpen = false"
                                    >
                                        <Layers :size="16" stroke-width="2" />
                                        <span>{{ t('cesium.sampleLod') }}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'baimo' }); sampleMenuOpen = false"
                                    >
                                        <Building :size="16" stroke-width="2" />
                                        <span>{{ t('cesium.sampleBaimo') }}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'gxu' }); sampleMenuOpen = false"
                                    >
                                        <Building :size="16" stroke-width="2" />
                                        <span>{{ t('cesium.sampleGxu') }}</span>
                                    </button>
                                </div>
                            </Teleport>
                        </div>
                    </div>

                    <!-- 远程 3D 服务加载 -->
                    <div class="remote-service-card">
                        <div class="remote-service-header">
                            <Globe
                                :size="15"
                                stroke-width="2"
                            />
                            <span class="remote-service-title">{{ t('cesium.remoteService') }}</span>
                        </div>
                        <div class="remote-service-type-row">
                            <select
                                v-model="remoteServiceType"
                                class="remote-service-type-select"
                                :aria-label="t('cesium.remoteServiceType')"
                            >
                                <option value="ion">{{ t('cesium.types.ion') }}</option>
                                <option value="i3s">{{ t('cesium.types.i3s') }}</option>
                                <option value="3dtiles">{{ t('cesium.types.tileset') }}</option>
                                <option value="glb">{{ t('cesium.types.glb') }}</option>
                            </select>
                        </div>
                        <form
                            class="remote-service-form"
                            @submit.prevent="submitRemoteService"
                        >
                            <div class="remote-service-input-row">
                                <input
                                    v-model="remoteServiceUrl"
                                    class="remote-service-input"
                                    type="text"
                                    spellcheck="false"
                                    :placeholder="t('cesium.remoteServicePlaceholder.' + remoteServiceType)"
                                />
                                <button
                                    class="remote-service-submit"
                                    type="submit"
                                    :disabled="!remoteServiceUrl.trim()"
                                    :title="t('cesium.remoteServiceHint')"
                                >
                                    <Send
                                        :size="14"
                                        stroke-width="2"
                                    />
                                    <span>{{ t('cesium.loadCustomXYZ') }}</span>
                                </button>
                            </div>
                            <div class="remote-service-hint">
                                {{ t('cesium.remoteServiceHint') }}
                            </div>
                        </form>
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
                                active: module.statusTone === 'success' || module.statusTone === 'info'
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


<script lang="ts" src="./CesiumToolPanel.ts"></script>

<style scoped lang="scss" src="./styles/CesiumToolPanel.scss"></style>


