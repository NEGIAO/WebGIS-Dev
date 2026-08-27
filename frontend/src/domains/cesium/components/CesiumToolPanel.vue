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
                                    :size="11"
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
                                        <MapPin :size="12" stroke-width="2" />
                                        <span>{{ t('cesium.sampleCity') }}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="scene-sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'ion' }); sceneSampleMenuOpen = false"
                                    >
                                        <Globe :size="12" stroke-width="2" />
                                        <span>{{ t('cesium.sampleIon') }}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="scene-sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'i3s' }); sceneSampleMenuOpen = false"
                                    >
                                        <Building :size="12" stroke-width="2" />
                                        <span>{{ t('cesium.sampleI3s') }}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="scene-sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'discreteLOD' }); sceneSampleMenuOpen = false"
                                    >
                                        <Layers :size="12" stroke-width="2" />
                                        <span>{{ t('cesium.sampleLod') }}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="scene-sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'baimo' }); sceneSampleMenuOpen = false"
                                    >
                                        <Building :size="12" stroke-width="2" />
                                        <span>{{ t('cesium.sampleBaimo') }}</span>
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
                                    :size="11"
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
                                        <MapPin :size="12" stroke-width="2" />
                                        <span>{{ t('cesium.sampleCity') }}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'ion' }); sampleMenuOpen = false"
                                    >
                                        <Globe :size="12" stroke-width="2" />
                                        <span>{{ t('cesium.sampleIon') }}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'i3s' }); sampleMenuOpen = false"
                                    >
                                        <Building :size="12" stroke-width="2" />
                                        <span>{{ t('cesium.sampleI3s') }}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'discreteLOD' }); sampleMenuOpen = false"
                                    >
                                        <Layers :size="12" stroke-width="2" />
                                        <span>{{ t('cesium.sampleLod') }}</span>
                                    </button>
                                    <button
                                        type="button"
                                        class="sample-menu-item"
                                        @click="emit('import-tileset-sample', { type: 'baimo' }); sampleMenuOpen = false"
                                    >
                                        <Building :size="12" stroke-width="2" />
                                        <span>{{ t('cesium.sampleBaimo') }}</span>
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

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
    Box,
    Building,
    Check,
    ChevronDown,
    Cloud,
    Crosshair,
    Download,
    Droplets,
    Eye,
    FastForward,
    FileArchive,
    FileDown,
    FileUp,
    Flag,
    FolderOpen,
    Globe,
    Home,
    Layers,
    Link,
    LocateFixed,
    MapPin,
    Mountain,
    Navigation,
    Pause,
    PenLine,
    PersonStanding,
    Plane,
    Play,
    Rewind,
    RotateCcw,
    Route,
    ScanEye,
    Send,
    Settings,
    SlidersHorizontal,
    Square,
    Sun,
    Trash2,
    Upload,
    Waves,
    Wind,
    X,
} from '@lucide/vue';
import LilGuiControls from './LilGuiControls.vue';
import { useLocale } from '@common/app/useLocale';
import {
    looksLikeWmsSourceUrl,
    ensureWmsServiceInfo,
} from '@common/basemap/wmsService';

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
    customIonHeightOffset: { type: Number, default: 0 },
    customIonTilesetReady: { type: Boolean, default: false },
    modules: { type: Array, default: () => [] },
    // modules: { type: Array, default: () => [] },
    storageKey: { type: String, default: 'cesium_tool_panel_ui' },
});


const emit = defineEmits([
    'update:open',
    'update:activeBasemap',
    'update:activeTerrain',
    'module-action',
    'control-change',
    'overlay-toggle',
    'custom-basemap-submit',
    'remote-service-submit',
    'update:customIonHeightOffset',
    'data-import',
    'import-tileset-zip',
    'import-tileset-folder',
    'import-tileset-sample',
    // 异步请求：请求拥有 viewer 的上下文对给定 region 进行地形采样并回填 setSampledRange
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
const sampleDropdownRef = ref(null);
const sampleMenuOpen = ref(false);
const sampleMenuStyle = ref({});
const sceneSampleDropdownRef = ref(null);
const sceneSampleMenuOpen = ref(false);
const sceneSampleMenuStyle = ref({});

/** 更新 Data Tab 样例菜单位置（fixed 定位，避免被 .panel-scroll overflow 裁切） */
watch(sampleMenuOpen, (open) => {
    if (!open || !sampleDropdownRef.value) return;
    const rect = sampleDropdownRef.value.getBoundingClientRect();
    sampleMenuStyle.value = {
        position: 'fixed',
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
    };
});

/** 更新场景 Tab 样例菜单位置（fixed 定位，避免被 .panel-scroll overflow 裁切） */
watch(sceneSampleMenuOpen, (open) => {
    if (!open || !sceneSampleDropdownRef.value) return;
    const rect = sceneSampleDropdownRef.value.getBoundingClientRect();
    sceneSampleMenuStyle.value = {
        position: 'fixed',
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
    };
});

/** 点击菜单外区域 → 关闭场景 Tab 样例菜单 */
let sceneMenuListenerTimer = null;
watch(sceneSampleMenuOpen, (open) => {
    if (open) {
        if (sceneMenuListenerTimer) clearTimeout(sceneMenuListenerTimer);
        sceneMenuListenerTimer = setTimeout(() => {
            sceneMenuListenerTimer = null;
            document.addEventListener('click', closeSceneSampleMenu);
        }, 0);
    } else {
        if (sceneMenuListenerTimer) {
            clearTimeout(sceneMenuListenerTimer);
            sceneMenuListenerTimer = null;
        }
        document.removeEventListener('click', closeSceneSampleMenu);
    }
});

// 面板卸载时若菜单开着，document 监听器会常驻——卸载前强制收口
onBeforeUnmount(() => {
    if (sceneMenuListenerTimer) {
        clearTimeout(sceneMenuListenerTimer);
        sceneMenuListenerTimer = null;
    }
    document.removeEventListener('click', closeSceneSampleMenu);
});

function closeSceneSampleMenu(e) {
    if (sceneSampleDropdownRef.value && !sceneSampleDropdownRef.value.contains(e.target)) {
        sceneSampleMenuOpen.value = false;
    }
}

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

// 远程 3D 服务加载
const remoteServiceType = ref('ion');
const remoteServiceUrl = ref('');

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

// ========== WMS 图层枚举与选择 ==========
const wmsLayerOptions = ref([]);
const selectedWmsLayer = ref('');
const wmsLayersLoading = ref(false);
let wmsLayersFetchToken = 0; // 防止连续输入导致的竞态回填

watch(customBasemapDraft, (draftUrl) => {
    const trimmed = String(draftUrl || '').trim();
    if (!trimmed || !looksLikeWmsSourceUrl(trimmed)) {
        resetWmsLayerSelection();
        return;
    }
    void fetchWmsLayerOptions(trimmed);
});

function resetWmsLayerSelection() {
    wmsLayersFetchToken += 1;
    wmsLayerOptions.value = [];
    selectedWmsLayer.value = '';
    wmsLayersLoading.value = false;
}

async function fetchWmsLayerOptions(url) {
    const token = ++wmsLayersFetchToken;
    wmsLayersLoading.value = true;
    wmsLayerOptions.value = [];
    selectedWmsLayer.value = '';

    const info = await ensureWmsServiceInfo(url);
    if (token !== wmsLayersFetchToken || !looksLikeWmsSourceUrl(customBasemapDraft.value)) return;

    wmsLayersLoading.value = false;
    if (info?.layerOptions?.length) {
        wmsLayerOptions.value = info.layerOptions;
        selectedWmsLayer.value = info.layers || info.layerOptions[0]?.name || '';
    }
}

function submitRemoteService() {
    emit('remote-service-submit', {
        type: remoteServiceType.value,
        url: remoteServiceUrl.value.trim(),
    });
}

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
    emit('custom-basemap-submit', {
        url: customBasemapDraft.value,
        // WMS 时携带用户选择的图层；未选择则由加载逻辑回退默认首层
        wmsLayer: wmsLayerOptions.value.length ? selectedWmsLayer.value : undefined,
    });
}

/** 切换 WMS 图层下拉框后立即应用，无需再点「加载」 */
function onWmsLayerChange() {
    if (wmsLayersLoading.value || !wmsLayerOptions.value.length) return;
    if (!looksLikeWmsSourceUrl(customBasemapDraft.value)) return;
    submitCustomBasemap();
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
        scene: Globe,
        atmosphere: Sun,
        cloud: Cloud,
        wind: Wind,
        fluid: Droplets,
        shallowWater: Waves,
        player: PersonStanding,
        analysis: ScanEye,
        planarRoute: Plane,
        routeFly: Route,
    };
    return icons[moduleId] || SlidersHorizontal;
}

function getActionIcon(moduleId, actionId) {
    const icons = {
        scene: { home: Home, everest: Mountain },
        wind: { load: Play, clear: Trash2 },
        fluid: { pick: Crosshair, floodSim: Waves, clear: Trash2 },
        shallowWater: { toggle: Waves },
        player: {
            toggle: PersonStanding,
            changeView: Eye,
            setNavTarget: Flag,
            clearNavTarget: X,
        },
        planarRoute: {
            setTakeoffPoint: MapPin,
            importKmz: Upload,
            saveKmz: Download,
            clearAll: Trash2,
        },
        routeFly: {
            drawRoute: PenLine,
            startFly: Play,
            suspend: Pause,
            speedUp: FastForward,
            speedDown: Rewind,
            stop: Square,
            importRoute: FileUp,
            exportRoute: FileDown,
            clearAll: Trash2,
        },
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

// ── 叠加层扩展操作（当前 overlay 数据无 hasLocation 字段，按钮不会渲染；预留实现防 undefined） ──
function emitOverlayFlyTo(overlay) {
    console.warn('[CesiumToolPanel] 叠加层定位未实现:', overlay?.value);
}
function updateOverlayOpacity(overlay, event) {
    const value = Number(event?.target?.value ?? event);
    if (!Number.isFinite(value)) return;
    emit('overlay-toggle', { overlayId: overlay.value, value: true, opacity: value });
}

function handleFileSelect(event) {
    const files = event.target?.files;
    if (!files || files.length === 0) return;
    emit('data-import', { files: Array.from(files) });
    if (fileInputRef.value) {
        fileInputRef.value.value = '';
    }
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
    height: auto;
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

.option-card .preset-index {
    color: var(--ctp-green);
    font-weight: 600;
    margin-right: 4px;
}

.option-card.active .preset-index {
    color: #6ee7b7;
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

/* ===== WMS 图层选择器 ===== */
.wms-layer-picker {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.wms-layer-label {
    color: rgba(var(--ctp-ice-text-rgb), 0.75);
    font-size: 10px;
    font-weight: 700;
}

.wms-layer-loading {
    font-weight: 400;
    opacity: 0.7;
}

.wms-layer-select {
    width: 100%;
    height: 26px;
    padding: 0 6px;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.2);
    border-radius: 6px;
    background: rgba(var(--ctp-white-rgb), 0.06);
    color: inherit;
    font-size: 11px;
    outline: none;
}

.wms-layer-select:focus {
    border-color: rgba(var(--ctp-ice-rgb), 0.55);
}

/* ========== 远程 3D 服务加载 ========== */
.remote-service-card {
    display: grid;
    gap: 8px;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.14);
    border-radius: 7px;
    padding: 10px;
    background: rgba(var(--ctp-white-rgb), 0.045);
}

.remote-service-header {
    display: flex;
    align-items: center;
    gap: 6px;
    color: rgba(var(--ctp-ice-text-rgb), 0.75);
}

.remote-service-title {
    font-size: 11px;
    font-weight: 700;
}

.remote-service-type-row {
    display: flex;
    gap: 6px;
}

.remote-service-type-select {
    height: 28px;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.2);
    border-radius: 6px;
    background: rgba(var(--ctp-input-bg-rgb), 0.88);
    color: var(--ctp-text);
    padding: 0 8px;
    font-size: 11px;
    cursor: pointer;
    flex: 1;
}

.remote-service-form {
    display: grid;
    gap: 6px;
}

.remote-service-input-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
}

.remote-service-input {
    height: 30px;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.2);
    border-radius: 6px;
    background: rgba(var(--ctp-input-bg-rgb), 0.88);
    color: var(--ctp-text);
    padding: 0 8px;
    font-size: 11px;
}

.remote-service-input::placeholder {
    color: rgba(var(--ctp-ice-text-rgb), 0.35);
}

.remote-service-submit {
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

.remote-service-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.remote-service-hint {
    font-size: 10px;
    color: rgba(var(--ctp-ice-text-rgb), 0.4);
    line-height: 1.4;
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

/* 样例数据下拉菜单 */
.sample-dropdown {
    position: relative;
}

.sample-chevron {
    margin-left: auto;
    opacity: 0.6;
    transition: transform 0.15s ease;
}

.sample-dropdown:has(.sample-menu) .sample-chevron {
    transform: rotate(180deg);
}

.sample-menu {
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    border: 1px solid rgba(var(--ctp-ice-rgb), 0.2);
    border-radius: 8px;
    background: rgba(var(--ctp-surface-rgb, 240, 240, 240), 0.98);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    backdrop-filter: blur(8px);
}

.sample-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--ctp-text);
    font-size: 11px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s ease;
}

.sample-menu-item:hover {
    background: rgba(var(--brand-primary-rgb, 47, 154, 87), 0.12);
    color: var(--brand-primary, #2f9a57);
}

/* 场景 Tab：加载 3D 模型下拉菜单（独立样式，深色玻璃 + 青色调） */
.scene-sample-dropdown {
    position: relative;
}

.scene-sample-chevron {
    margin-left: auto;
    opacity: 0.6;
    transition: transform 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

.scene-sample-dropdown:has(.scene-sample-menu) .scene-sample-chevron {
    transform: rotate(180deg);
    opacity: 1;
    color: var(--ctp-cyan, #67e8f9);
}

.scene-sample-menu {
    position: fixed;
    z-index: var(--z-popover, 1000);
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 6px;
    border: 1px solid rgba(var(--ctp-cyan-soft-rgb, 103, 232, 249), 0.25);
    border-radius: 10px;
    background: rgba(var(--ctp-surface-rgb, 240, 240, 240), 0.96);
    box-shadow: 0 8px 28px rgba(0, 8, 15, 0.45),
                0 0 0 1px rgba(var(--ctp-cyan-soft-rgb, 103, 232, 249), 0.08);
    backdrop-filter: blur(12px);
    animation: scene-sample-fade-in 0.16s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes scene-sample-fade-in {
    from {
        opacity: 0;
        transform: translateY(-6px) scale(0.97);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.scene-sample-menu-item {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--ctp-text, #eefbf3);
    font-size: 11px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition: background 0.14s ease, color 0.14s ease, transform 0.14s ease;
}

.scene-sample-menu-item:hover {
    background: linear-gradient(
        90deg,
        rgba(var(--ctp-cyan-soft-rgb, 103, 232, 249), 0.14) 0%,
        rgba(var(--ctp-cyan-soft-rgb, 103, 232, 249), 0.04) 100%
    );
    color: var(--ctp-cyan, #67e8f9);
    transform: translateX(2px);
}

.scene-sample-menu-item:active {
    transform: translateX(2px) scale(0.98);
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

.control-value {
    flex: 0 0 32px;
    text-align: right;
    color: rgba(var(--ctp-ice-text-rgb), 0.7);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
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
    /* max-height: calc(100vh - 100px);  */
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
