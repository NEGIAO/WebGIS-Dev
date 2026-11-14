<template>
    <transition name="pro-float-fade">
        <section
            v-if="isVisible"
            ref="panelRef"
            class="pro-float-window"
            :class="{ minimized: isMinimized }"
            :style="panelStyle"
        >
            <!-- 顶部窗口标题栏 (紧凑桌面原生设计，匹配截图主体绿色系) -->
            <header
                class="pro-header"
                @pointerdown="startDrag"
            >
                <div class="pro-title-wrap">
                    <svg
                        class="pro-header-icon"
                        viewBox="0 0 16 16"
                    >
                        <path
                            d="M1 2v12h14V2H1zm1 1h12v2H2V3zm0 3h4v2H2V6zm5 0h7v2H7V6zm-5 3h4v2H2V9zm5 0h7v2H7V9zm-5 3h4v2H2v-2zm5 0h7v2H7v-2z"
                        />
                    </svg>
                    <span class="pro-title">{{ t('attrTable.title', { name: layerName, count: totalRows }) }}</span>
                </div>

                <!-- 右上角标准窗口控件 -->
                <div class="pro-window-controls">
                    <button
                        class="win-btn win-min"
                        type="button"
                        :title="t('attrTable.minimize')"
                        @click.stop="toggleMinimized"
                    >
                        <svg viewBox="0 0 10 10">
                            <rect
                                x="1"
                                y="4"
                                width="8"
                                height="2"
                                fill="currentColor"
                            />
                        </svg>
                    </button>
                    <button
                        class="win-btn win-close"
                        type="button"
                        :title="t('attrTable.close')"
                        @click.stop="closeTable"
                    >
                        <svg viewBox="0 0 10 10">
                            <path
                                d="M1.414.032L5 3.617 8.586.032l1.414 1.414L6.414 5l3.586 3.586-1.414 1.414L5 6.414l-3.586 3.586-1.414-1.414L3.586 5 .032 1.446 1.414.032z"
                                fill="currentColor"
                            />
                        </svg>
                    </button>
                </div>
            </header>

            <!-- 主体面板 (折叠时隐藏) -->
            <div
                v-show="!isMinimized"
                class="pro-body"
            >
                <!-- GIS数据功能工具栏 (模仿ArcGIS Ribbon风格与扁平按钮) -->
                <div class="pro-toolbar">
                    <div class="toolbar-group">
                        <label
                            class="pro-toggle"
                            :class="{ unavailable: viewFilterUnavailable }"
                            :title="viewFilterUnavailable
                                ? t('attrTable.viewFilterUnavailableTip')
                                : t('attrTable.viewFilterTip')
                            "
                        >
                            <input
                                v-model="filterByCurrentView"
                                type="checkbox"
                            />
                            <span class="pro-toggle-box">
                                <svg
                                    v-show="filterByCurrentView"
                                    class="icon-check"
                                    viewBox="0 0 16 16"
                                >
                                    <path
                                        d="M5.5 12L2 8.5l1.5-1.5L5.5 9 12.5 2 14 3.5 5.5 12z"
                                        fill="currentColor"
                                    />
                                </svg>
                            </span>
                            <span class="toggle-label">{{ t('attrTable.viewFilter') }}</span>
                        </label>
                        <span class="divider"></span>
                        <button
                            class="pro-toolbar-btn"
                            type="button"
                            :class="{ active: showFieldPanel }"
                            :title="showFieldPanel
                                ? t('attrTable.hideFields')
                                : t('attrTable.showFields')
                            "
                            @click.stop="toggleFieldPanel"
                        >
                            <svg
                                class="pro-icon-field"
                                viewBox="0 0 16 16"
                            >
                                <path
                                    d="M2 1v14h12V1H2zm1 1h4v4H3V2zm0 5h4v7H3V7zm5-5h5v2H8V2zm0 3h5v2H8V5zm0 3h5v2H8V8zm0 3h5v2H8v-2zm0 3h5v2H8v-2z"
                                    fill="currentColor"
                                />
                            </svg>
                            <span class="btn-label">{{ showFieldPanel ? t('attrTable.hideFields') : t('attrTable.showFields') }}</span>
                        </button>
                        <span class="divider"></span>
                        <div class="pro-search-wrap">
                            <svg
                                class="pro-search-icon"
                                viewBox="0 0 16 16"
                            >
                                <path
                                    d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"
                                    fill="currentColor"
                                />
                            </svg>
                            <input
                                v-model="searchInput"
                                type="text"
                                class="pro-input pro-search-input"
                                :placeholder="t('attrTable.searchPlaceholder')"
                            />
                            <button
                                v-show="searchInput"
                                class="pro-search-clear"
                                type="button"
                                :title="t('attrTable.clearSearch')"
                                @click="clearSearch"
                            >
                                ×
                            </button>
                        </div>
                        <span class="divider"></span>
                        <button
                            class="pro-toolbar-btn"
                            type="button"
                            :disabled="!totalRows"
                            :title="t('attrTable.exportCsvTip')"
                            @click.stop="exportCsv"
                        >
                            <svg
                                class="pro-icon-field"
                                viewBox="0 0 16 16"
                            >
                                <path
                                    d="M7 1v7.586L4.707 6.293 3.293 7.707 8 12.414l4.707-4.707-1.414-1.414L9 8.586V1H7zM2 13v2h12v-2H2z"
                                    fill="currentColor"
                                />
                            </svg>
                            <span class="btn-label">{{ t('attrTable.exportCsv') }}</span>
                        </button>
                        <span class="divider"></span>
                        <button
                            class="pro-toolbar-btn"
                            type="button"
                            :disabled="!selectedFeatureId"
                            :title="t('attrTable.zoomSelTip')"
                            @click.stop="zoomToSelected"
                        >
                            <svg
                                class="pro-icon-field"
                                viewBox="0 0 16 16"
                            >
                                <path
                                    d="M6.5 1a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm4.95 8.57 3.18 3.18-1.06 1.06-3.18-3.18 1.06-1.06zM5.75 3.5h1.5v2.25h2.25v1.5H7.25v2.25h-1.5V7.25H3.5v-1.5h2.25V3.5z"
                                    fill="currentColor"
                                />
                            </svg>
                            <span class="btn-label">{{ t('attrTable.zoomSelected') }}</span>
                        </button>
                        <button
                            class="pro-toolbar-btn"
                            type="button"
                            :disabled="!selectedFeatureId"
                            :title="t('attrTable.clearSelTip')"
                            @click.stop="clearSelection"
                        >
                            <svg
                                class="pro-icon-field"
                                viewBox="0 0 16 16"
                            >
                                <path
                                    d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm0 1.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z"
                                    fill="currentColor"
                                />
                                <path
                                    d="M2.9 12.4 12.4 2.9l.7.7-9.5 9.5-.7-.7z"
                                    fill="currentColor"
                                />
                            </svg>
                            <span class="btn-label">{{ t('attrTable.clearSelection') }}</span>
                        </button>
                        <button
                            class="pro-toolbar-btn danger-text"
                            type="button"
                            :disabled="!selectedFeatureId"
                            :title="t('attrTable.deleteSelTip')"
                            @click.stop="deleteSelected"
                        >
                            <svg
                                class="pro-icon-field"
                                viewBox="0 0 16 16"
                            >
                                <path
                                    d="M6.25 1.5h3.5l.4 1H13.5V4h-11V2.5h3.35l.4-1zM4 5.5h8l-.7 8.6a1 1 0 0 1-1 .9H5.7a1 1 0 0 1-1-.9L4 5.5z"
                                    fill="currentColor"
                                />
                            </svg>
                            <span class="btn-label">{{ t('attrTable.deleteSelected') }}</span>
                        </button>
                    </div>

                    <div
                        v-if="numericFields.length"
                        class="toolbar-group layout-end"
                    >
                        <div class="pro-stats-panel">
                            <span class="label">{{ t('attrTable.statsLabel') }}</span>
                            <select
                                v-model="statsField"
                                class="pro-select"
                            >
                                <option
                                    v-for="field in numericFields"
                                    :key="field.key"
                                    :value="field.key"
                                >
                                    {{ field.alias }}
                                </option>
                            </select>
                            <div class="pro-tags-wrap">
                                <span
                                    class="pro-stat-chip"
                                    :title="t('attrTable.sumTip')"
                                    ><strong>∑</strong>{{ statSummary.sum }}</span
                                >
                                <span
                                    class="pro-stat-chip"
                                    :title="t('attrTable.avgTip')"
                                    ><strong>μ</strong>{{ statSummary.avg }}</span
                                >
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 字段结构设置内页表 -->
                <div
                    v-if="showFieldPanel"
                    class="pro-field-panel-view"
                >
                    <div class="panel-desc">
                        {{ t('attrTable.fieldPanelDesc') }}
                    </div>
                    <div class="pro-field-grid">
                        <div class="field-header">
                            <span class="ch-wrap">✓</span>
                            <span>{{ t('attrTable.colOriginal') }}</span>
                            <span>{{ t('attrTable.colAlias') }}</span>
                            <span>{{ t('attrTable.colType') }}</span>
                        </div>
                        <div class="field-items">
                            <div
                                v-for="field in allFields"
                                :key="field.key"
                                class="field-row"
                            >
                                <span class="ch-wrap">
                                    <input
                                        type="checkbox"
                                        class="native-cb"
                                        :checked="field.visible"
                                        @change="updateFieldVisibility(field.key, $event)"
                                    />
                                </span>
                                <span
                                    class="code"
                                    :title="field.key"
                                    >{{ field.key }}</span
                                >
                                <span>
                                    <input
                                        type="text"
                                        class="pro-input pro-field-input"
                                        :value="field.alias"
                                        @input="updateFieldAlias(field.key, $event)"
                                    />
                                </span>
                                <span class="type-badge">{{ field.type }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 主表格容器 -->
                <div
                    v-if="!totalRows"
                    class="pro-table-empty"
                >
                    <div class="empty-icon">
                        <svg viewBox="0 0 16 16">
                            <path
                                fill="currentColor"
                                d="M3 14h10v-2H3v2zM1 14h2v-2H1v2zm2-4h10V8H3v2zM1 10h2V8H1v2zm2-4h10V4H3v2zM1 6h2V4H1v2zM15 1v12h1v2H0V15h15V1zM0 13H1V2H15v1h1V1v12H13v2zm1-4V2H13V1zm0-3v4h1V5zm0 6V9h1v3zm0-9v1h1V3zm2 6H13v3H3zm0-3v2h9V5H2v1h1z"
                            />
                        </svg>
                    </div>
                    {{ t('attrTable.empty') }}
                </div>

                <div
                    v-else
                    class="pro-data-grid"
                >
                    <div
                        ref="scrollRef"
                        class="pro-scroll-area"
                        @scroll="handleScroll"
                        @mouseleave="clearPreview"
                    >
                        <div
                            class="pro-grid-layout"
                            :style="{ width: `${gridTotalWidth}px` }"
                        >
                            <!-- 严格边界型表头 -->
                            <div
                                class="pro-th-group"
                                :style="{ gridTemplateColumns }"
                            >
                                <div
                                    class="cell header id-col"
                                    :class="{ sortable: !!sortKey }"
                                    :title="sortKey ? t('attrTable.clearSortTip') : t('attrTable.oid')"
                                    @click="sortKey && clearSort()"
                                >
                                    {{ t('attrTable.oid') }}
                                </div>
                                <div
                                    v-for="field in visibleFields"
                                    :key="`head_${field.key}`"
                                    class="cell header resizable sortable"
                                    :title="t('attrTable.sortByTip', { alias: field.alias || field.key })"
                                    @click="handleSortClick(field.key)"
                                >
                                    <div class="header-text">
                                        {{ field.alias || field.key }}
                                    </div>
                                    <span
                                        v-if="sortKey === field.key"
                                        class="header-sort-caret"
                                        :class="{ desc: sortDirection === 'desc' }"
                                    >
                                        <svg viewBox="0 0 10 10">
                                            <path
                                                d="M5 2.2 8.6 7H1.4z"
                                                fill="currentColor"
                                            />
                                        </svg>
                                    </span>
                                    <span
                                        class="col-resize-grip"
                                        :title="t('attrTable.resizeColTip')"
                                        @click.stop
                                        @dblclick.stop
                                        @pointerdown.stop.prevent="startColResize(field, $event)"
                                    ></span>
                                </div>
                                <div class="cell header actions-col">
                                    {{ t('attrTable.actions') }}
                                </div>
                            </div>

                            <!-- 长数据渲染层级与幽灵高度承接 -->
                            <div
                                class="virtual-holder"
                                :style="{ height: `${totalHeight}px` }"
                            >
                                <!-- key 使用稳定行 id（不含 index），滚动位移时 Vue 可复用节点避免整片重挂载 -->
                                <div
                                    v-for="item in virtualRows"
                                    :key="`row_${item.row.id}`"
                                    class="pro-tr"
                                    :class="{
                                        selected: item.row.featureId === selectedFeatureId,
                                        'row-even': item.index % 2 === 1,
                                    }"
                                    :style="{
                                        transform: `translateY(${item.top}px)`,
                                        gridTemplateColumns,
                                    }"
                                    @mouseenter="previewFeature(item.row)"
                                    @click="focusFeature(item.row, $event)"
                                    @dblclick="zoomToFeatureRow(item.row)"
                                >
                                    <div
                                        class="cell id-col"
                                        :title="t('attrTable.zoomTip')"
                                        @click.stop="
                                            emit('focus-feature', {
                                                layerId: store.activeDataset?.layerId,
                                                featureId: item.row.featureId,
                                                zoom: true,
                                            })
                                        "
                                    >
                                        {{ item.index + 1 }}
                                    </div>

                                    <div
                                        v-for="field in visibleFields"
                                        :key="`cell_${item.row.featureId}_${field.key}`"
                                        class="cell data"
                                        :class="{ 'numeric-data': field.type === 'number' }"
                                        :title="formatValue(item.row.properties[field.key], field.type)"
                                        @click="startCellEdit(item.row, field)"
                                    >
                                        <input
                                            v-if="
                                                editingCell &&
                                                editingCell.rowId === item.row.id &&
                                                editingCell.field === field.key
                                            "
                                            :ref="setCellEditInput"
                                            v-model="editingValue"
                                            class="cell-edit-input"
                                            @click.stop
                                            @keydown.enter.prevent="commitCellEdit(item.row, field)"
                                            @keydown.esc.prevent="cancelCellEdit"
                                            @blur="commitCellEdit(item.row, field)"
                                        />
                                        <template v-else>{{
                                            formatValue(item.row.properties[field.key], field.type)
                                        }}</template>
                                    </div>

                                    <div class="cell actions-col">
                                        <button
                                            class="row-act"
                                            type="button"
                                            :title="t('attrTable.zoomTip')"
                                            @click.stop="
                                                emit('focus-feature', {
                                                    layerId: store.activeDataset?.layerId,
                                                    featureId: item.row.featureId,
                                                    zoom: true,
                                                })
                                            "
                                        >
                                            <svg viewBox="0 0 16 16">
                                                <path
                                                    d="M7.25 1h1.5v2.6h-1.5V1zm0 11.4h1.5V15h-1.5v-2.6zM1 7.25h2.6v1.5H1v-1.5zm11.4 0H15v1.5h-2.6v-1.5zM8 4.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zm0 1.5a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8z"
                                                    fill="currentColor"
                                                />
                                            </svg>
                                        </button>
                                        <button
                                            v-if="!readonly"
                                            class="row-act danger"
                                            type="button"
                                            :title="t('attrTable.deleteFeatureTip')"
                                            @click.stop="deleteFeatureRow(item.row)"
                                        >
                                            <svg viewBox="0 0 16 16">
                                                <path
                                                    d="M6.25 1.5h3.5l.4 1H13.5V4h-11V2.5h3.35l.4-1zM4 5.5h8l-.7 8.6a1 1 0 0 1-1 .9H5.7a1 1 0 0 1-1-.9L4 5.5z"
                                                    fill="currentColor"
                                                />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 底部辅助说明列条（模拟ArcgisPro信息横条） -->
                <footer class="pro-footer-bar">
                    <span class="footer-text">{{
                        t('attrTable.footerRows', {
                            shown: totalRows,
                            total: totalSourceRows,
                            visible: visibleFields.length,
                            hidden: allFields.length - visibleFields.length,
                        })
                    }}</span>
                    <span
                        v-if="viewFilterUnavailable"
                        class="filter-warn"
                        >{{ t('attrTable.filterWarn') }}</span
                    >
                    <span class="footer-spacer"></span>
                    <span
                        v-show="selectedFeatureId !== ''"
                        class="sel-count"
                        >{{ t('attrTable.selectionActive') }}</span
                    >
                </footer>
            </div>

            <!-- 八向热区缩放锚点：四边透明热区 + 四角斜线指示标，任意位置可调整窗口大小 -->
            <div
                class="resize-grip edge n"
                @pointerdown.stop.prevent="startResize('top', $event)"
            ></div>
            <div
                class="resize-grip edge s"
                @pointerdown.stop.prevent="startResize('bottom', $event)"
            ></div>
            <div
                class="resize-grip edge w"
                @pointerdown.stop.prevent="startResize('left', $event)"
            ></div>
            <div
                class="resize-grip edge e"
                @pointerdown.stop.prevent="startResize('right', $event)"
            ></div>
            <div
                class="resize-grip corner se"
                @pointerdown.stop.prevent="startResize('bottom-right', $event)"
            >
                <svg viewBox="0 0 10 10">
                    <path
                        d="M2 2l6 6M5 8l3-3"
                        stroke="currentColor"
                        stroke-width="1.4"
                        fill="none"
                        stroke-linecap="round"
                    />
                </svg>
            </div>
            <div
                class="resize-grip corner sw"
                @pointerdown.stop.prevent="startResize('bottom-left', $event)"
            >
                <svg viewBox="0 0 10 10">
                    <path
                        d="M2 2l6 6M5 8l3-3"
                        stroke="currentColor"
                        stroke-width="1.4"
                        fill="none"
                        stroke-linecap="round"
                    />
                </svg>
            </div>
            <div
                class="resize-grip corner ne"
                @pointerdown.stop.prevent="startResize('top-right', $event)"
            >
                <svg viewBox="0 0 10 10">
                    <path
                        d="M2 2l6 6M5 8l3-3"
                        stroke="currentColor"
                        stroke-width="1.4"
                        fill="none"
                        stroke-linecap="round"
                    />
                </svg>
            </div>
            <div
                class="resize-grip corner nw"
                @pointerdown.stop.prevent="startResize('top-left', $event)"
            >
                <svg viewBox="0 0 10 10">
                    <path
                        d="M2 2l6 6M5 8l3-3"
                        stroke="currentColor"
                        stroke-width="1.4"
                        fill="none"
                        stroke-linecap="round"
                    />
                </svg>
            </div>
        </section>
    </transition>
</template>

<script lang="ts" src="./AttributeTable.ts"></script>

<style lang="scss" src="./styles/AttributeTable.global.scss"></style>

<style scoped lang="scss" src="./styles/AttributeTable.scss"></style>

