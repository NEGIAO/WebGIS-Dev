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

<style>
/** GIS 主题控制配色映射：以截图中The Science of Where标准绿色和GIS专业应用为原形搭配色块 **/
:root {
    --arc-pro-bg: var(--bg-primary);
    --arc-pro-panel-base: #f0f3f2;
    --arc-pro-topbar-green: var(--brand-accent); /* 主题Logo顶板色系 */
    --arc-pro-win-hover-red: var(--danger);
    --arc-pro-toolbar-line: #cdcece;
    --arc-pro-ribbon-btn-bg: transparent;
    --arc-pro-ribbon-hover: #dbefdc; /* 操作栏按住焦点和光标指引浅亮主绿区搭配 */

    /* Grid 标准表格级表现配置 */
    --arc-pro-border-color: #d1d4d3;
    --arc-pro-header-bg: #ecefec;
    --arc-pro-grid-lines: #dfdfdf;

    --arc-pro-select-cyan: #d2ecdc; /* 数据被选目标绿色亮圈，原系其实略偏浅绿蓝色交织系。因截图为纯正绿色定制做调整对应兼容  */
    --arc-pro-row-hover: #eaf1e8;

    --arc-pro-font-def: 'Segoe UI', 'Microsoft Yahei', sans-serif;
    --arc-pro-text: #2a342f;
}
</style>

<style scoped>
/* =====================================================
   设计令牌：全组件色彩/圆角/高度统一从这里取值
   （绿色基因延续品牌主题，表格中性灰做数据底色）
   ===================================================== */
.pro-float-window {
    --at-radius: 8px;
    --at-header-h: 36px;
    --at-line: #e5e9e6;
    --at-line-strong: #ccd3ce;
    --at-head-bg: #f4f6f5;
    --at-zebra: #fafbfa;
    --at-hover: #f0f7f1;
    --at-accent-rgb: var(--brand-primary-rgb, 74, 158, 76);

    position: absolute;
    z-index: calc(var(--z-popover) + 200);
    display: flex;
    flex-direction: column;
    min-width: 520px;
    min-height: 280px;

    background: var(--bg-primary);
    border: 1px solid rgba(20, 40, 25, 0.16);
    border-radius: var(--at-radius);
    box-shadow:
        0 16px 40px rgba(15, 35, 20, 0.16),
        0 3px 10px rgba(15, 35, 20, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.7);
    font-family:
        'Segoe UI',
        'Microsoft Yahei',
        system-ui,
        sans-serif;
    color: var(--text-primary);
    overflow: hidden;
}

.pro-float-window.minimized {
    min-height: var(--at-header-h) !important;
}

/* --------------- */
/* Header：桌面OS级标题顶板（实心品牌绿 + 细腻上下光边） */
/* --------------- */
.pro-header {
    height: var(--at-header-h);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--brand-accent);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.24),
        inset 0 -1px 0 rgba(0, 0, 0, 0.16);
    color: #fff;
    user-select: none;
    flex-shrink: 0;
}
.pro-title-wrap {
    display: inline-flex;
    align-items: center;
    padding-left: 12px;
    gap: 8px;
    flex: 1;
    min-width: 0; /* 允许标题在窄窗口下截断省略而不是把窗口按钮挤出面板 */
}
.pro-header-icon {
    width: 14px;
    height: 14px;
    fill: currentColor;
    opacity: 0.95;
    flex-shrink: 0;
}
.pro-title {
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.2px;
    line-height: 1;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.22);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.pro-window-controls {
    display: flex;
    align-items: center;
    height: 100%;
    flex-shrink: 0;
}
.win-btn {
    height: 100%;
    width: 42px;
    background: transparent;
    border: none;
    border-radius: 0;
    color: inherit;
    cursor: default;
    display: flex;
    justify-content: center;
    align-items: center;
    outline: none;
    transition: background 0.12s ease;
}
.win-btn svg {
    width: 10px;
    height: 10px;
    stroke: none;
    fill: white;
}
.win-btn:hover {
    background: rgba(255, 255, 255, 0.2);
}
.win-btn:active {
    background: rgba(255, 255, 255, 0.32);
}
.win-close:hover {
    background: var(--danger);
} /* Standard close behavior (Red on OS) */

/* --------------- */
/* Layout Wrapper */
/* --------------- */
.pro-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
    /* 全组件响应基准：字段面板/底部条等子区随面板宽度自适应 */
    container-type: inline-size;
}

/* --------------- */
/* 工具栏：分组直列 + 弹性换行兜底 + 容器查询分级折叠 */
/* --------------- */
.pro-toolbar {
    min-height: 44px;
    flex-shrink: 0;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--at-line-strong);
    padding: 5px 12px;
    display: flex;
    flex-wrap: wrap; /* 关键兜底：再窄也只是整组换行，绝不横向溢出 */
    align-items: center;
    gap: 4px 14px;
    font-size: 12px;
    color: var(--text-primary);
    /* 以面板实际宽度为响应基准（面板可拖拽缩放，比视口媒体查询更精准） */
    container-type: inline-size;
}

.toolbar-group {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
    min-width: 0;
}
.layout-end {
    margin-left: auto;
}

.divider {
    height: 20px;
    width: 1px;
    margin: 0 2px;
    background: var(--at-line-strong);
}

/* 视图筛选勾选框（自绘方格） */
.pro-toggle {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 5px;
    user-select: none;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 0.12s ease;
}
.pro-toggle:hover {
    background: var(--bg-brand-light);
}
.pro-toggle input {
    display: none;
}
.pro-toggle-box {
    width: 15px;
    height: 15px;
    margin-right: 6px;
    border: 1px solid var(--border-light);
    background: #fff;
    border-radius: 3px;
    display: flex;
    justify-content: center;
    align-items: center;
    transition:
        border-color 0.12s ease,
        background 0.12s ease;
}
.icon-check {
    width: 10px;
    height: 10px;
    fill: var(--brand-accent);
}
.pro-toggle input:checked + .pro-toggle-box {
    border-color: var(--brand-accent);
    background: var(--bg-brand-light);
}
.pro-toggle:hover .pro-toggle-box {
    border-color: var(--brand-primary-dark, var(--brand-accent));
}

/* 工具按钮：扁平胶囊态，悬停浅绿、激活带内嵌描边 */
.pro-toolbar-btn {
    height: 28px;
    padding: 0 10px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary);
    cursor: pointer;
    outline: none;
    /* 文字永不折行、按钮不被压缩，宽度不足时由容器查询折叠为图标 */
    white-space: nowrap;
    flex-shrink: 0;
    transition:
        background 0.12s ease,
        border-color 0.12s ease,
        color 0.12s ease;
}
.pro-icon-field {
    width: 14px;
    height: 14px;
    fill: currentColor;
    opacity: 0.82;
    flex-shrink: 0;
    transition: opacity 0.12s ease;
}
.pro-toolbar-btn:hover:not(:disabled) {
    background: var(--bg-brand-light);
    border-color: var(--border-brand-light);
    color: var(--text-brand);
}
.pro-toolbar-btn:hover:not(:disabled) .pro-icon-field {
    opacity: 1;
}
.pro-toolbar-btn:disabled {
    opacity: 0.42;
    cursor: not-allowed;
}
.pro-toolbar-btn.active {
    background: var(--bg-brand-light);
    border-color: var(--border-brand);
    color: var(--text-brand-dark);
    box-shadow: inset 0 1px 2px rgba(30, 70, 35, 0.08);
}
/* 危险动作（删除选中）独立红色语义 */
.pro-toolbar-btn.danger-text:hover:not(:disabled) {
    background: #fdecea;
    border-color: #eec2bf;
    color: var(--danger);
}

/* --------------- */
/* 窄面板自适应（容器查询随拖拽缩放实时生效）：
   ① 收紧间距 → ② 全部按钮折叠为纯图标(title兜底提示)
   → ③ 隐藏统计芯片 → ④ 隐藏分隔线/勾选文字/统计标签；
   flex-wrap 保证任何宽度下都不溢出，折叠只是为了少占行 */
/* --------------- */
@container (max-width: 920px) {
    .pro-toolbar {
        gap: 4px 10px;
        padding: 5px 8px;
    }
}
@container (max-width: 800px) {
    .btn-label {
        display: none;
    }
}
@container (max-width: 640px) {
    .pro-stat-chip {
        display: none;
    }
    /* 字段面板四列结构在窄面板下放宽最小列宽 */
    .field-header,
    .field-row {
        grid-template-columns: 34px minmax(96px, 1.2fr) minmax(110px, 1fr) 64px;
        gap: 6px;
    }
}
@container (max-width: 480px) {
    .toggle-label,
    .divider,
    .pro-stats-panel > .label {
        display: none;
    }
    .field-header,
    .field-row {
        grid-template-columns: 28px minmax(72px, 1.2fr) minmax(84px, 1fr) 52px;
        gap: 4px;
        padding-left: 6px;
        padding-right: 6px;
    }
}

/* 统计区：字段选择 + Σ/μ 胶囊芯片 */
.pro-stats-panel {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.pro-stats-panel > .label {
    font-size: 11.5px;
    color: var(--text-secondary, #66716a);
    white-space: nowrap;
    flex-shrink: 0;
}
.pro-select {
    height: 26px;
    border: 1px solid var(--at-line-strong);
    background: #fff;
    border-radius: 5px;
    font-size: 12px;
    color: var(--text-primary);
    padding: 0 8px;
    outline: none;
    box-sizing: border-box;
    cursor: pointer;
    /* 随容器宽度弹性伸缩（cqw基于.pro-toolbar）；
       显式min-width压过select由最长option撑起的auto最小尺寸，否则flex里永远不肯变窄 */
    width: clamp(100px, 15cqw, 150px);
    min-width: 84px;
    transition:
        border-color 0.12s ease,
        box-shadow 0.12s ease;
}
.pro-select:hover {
    border-color: var(--brand-primary-dark, var(--brand-accent));
}
.pro-select:focus {
    border-color: var(--brand-accent);
    box-shadow: 0 0 0 3px rgba(var(--at-accent-rgb), 0.15);
}
.pro-tags-wrap {
    display: inline-flex;
    gap: 4px;
    min-width: 0;
}
.pro-stat-chip {
    height: 22px;
    display: inline-flex;
    align-items: center;
    font-size: 11px;
    color: #42584a;
    background: #eef6ef;
    border: 1px solid #d7e7d9;
    border-radius: 999px;
    padding: 0 9px;
    font-variant-numeric: tabular-nums;
    /* 数值过长时省略号截断并允许收缩，不再用固定min-width顶爆统计区 */
    min-width: 48px;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.pro-stat-chip strong {
    font-weight: 600;
    color: var(--brand-primary-dark, #1a6d2c);
    margin-right: 3px;
}

/* --------------- */
/* 字段结构面板：可见性 / 别名 / 类型三列管理 */
/* --------------- */
.pro-field-panel-view {
    height: 210px;
    background: #f8faf8;
    border-bottom: 1px solid var(--at-line-strong);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
}
.panel-desc {
    padding: 7px 14px;
    font-size: 11px;
    color: #6d7a70;
    border-bottom: 1px solid var(--at-line);
    background: #f0f4f0;
}
.pro-field-grid {
    flex: 1;
    overflow-y: auto;
    font-size: 12px;
    color: #2b332d;
    background: #fff;
    scrollbar-width: thin;
    scrollbar-color: #c3cbc6 transparent;
}
.pro-field-grid::-webkit-scrollbar {
    width: 12px;
}
.pro-field-grid::-webkit-scrollbar-thumb {
    border-radius: 6px;
    background-clip: content-box;
    background-color: #c3cbc6;
    border: 3px solid transparent;
}

.field-header {
    display: grid;
    grid-template-columns: 40px minmax(130px, 1.1fr) minmax(170px, 1fr) 84px;
    align-items: center;
    gap: 8px;
    background: var(--at-head-bg);
    border-bottom: 1px solid var(--at-line-strong);
    padding: 6px 10px;
    position: sticky;
    top: 0;
    z-index: 5;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #5b6660;
}
.ch-wrap {
    justify-self: center;
}
.native-cb {
    accent-color: var(--brand-accent);
    width: 14px;
    height: 14px;
    cursor: pointer;
}

.field-row {
    display: grid;
    grid-template-columns: 40px minmax(130px, 1.1fr) minmax(170px, 1fr) 84px;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid #eef1ee;
    padding: 4px 10px;
    transition: background 0.1s ease;
}
.field-row:hover {
    background: #f4f9f4;
}
/* 字段原名：代码感徽章，一眼区分「不可改的key」与「可改的别名」 */
.code {
    justify-self: start;
    max-width: 100%;
    color: #0f6a3d;
    background: #eaf4ec;
    border-radius: 3px;
    padding: 1px 7px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: Consolas, 'SF Mono', Menlo, monospace;
    font-size: 11.5px;
}
.type-badge {
    justify-self: end;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #75827a;
    background: #eef0ee;
    border: 1px solid #dde2de;
    border-radius: 999px;
    padding: 1px 8px;
}

.pro-input {
    width: 100%;
    height: 24px;
    padding: 0 8px;
    font-size: 12px;
    font-family: inherit;
    color: var(--text-primary);
    border: 1px solid var(--at-line-strong);
    border-radius: 4px;
    outline: none;
    background: #fff;
    box-sizing: border-box;
    transition:
        border-color 0.12s ease,
        box-shadow 0.12s ease;
}
.pro-input:hover {
    border-color: #b3bcb5;
}
.pro-input:focus {
    border-color: var(--brand-accent);
    box-shadow: 0 0 0 3px rgba(var(--at-accent-rgb), 0.15);
}

/* --------------- */
/* 主数据表格（虚拟滚动）：轻网格线 + 行为态分层 */
/* 注意：.cell/.pro-tr 高度 30px 与脚本 ROW_HEIGHT 常量强耦合，勿改 */
/* --------------- */
.pro-table-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 12.5px;
    color: #8a948d;
    background: #fbfcfb;
}
.empty-icon svg {
    width: 42px;
    height: 42px;
    color: #c3d2c6;
}

.pro-data-grid {
    flex: 1;
    min-height: 0;
    position: relative;
}
.pro-scroll-area {
    width: 100%;
    height: 100%;
    overflow: auto;
    background: #fff;
    scrollbar-width: thin;
    scrollbar-color: #c3cbc6 transparent;
}
.pro-scroll-area::-webkit-scrollbar {
    width: 12px;
    height: 12px;
}
.pro-scroll-area::-webkit-scrollbar-track {
    background: transparent;
}
.pro-scroll-area::-webkit-scrollbar-thumb {
    border-radius: 8px;
    background: #c3cbc6;
    background-clip: content-box;
    border: 3px solid transparent;
}
.pro-scroll-area::-webkit-scrollbar-thumb:hover {
    background-color: #a9b3ad;
}

.pro-grid-layout {
    /* 宽度由内联样式按列宽总和精确设定；不小于可视区以保证表头背景铺满 */
    min-width: 100%;
}
.virtual-holder {
    position: relative;
}

.pro-th-group {
    display: grid;
    position: sticky;
    top: 0;
    z-index: 3;
    background: var(--at-head-bg);
    border-bottom: 1px solid var(--at-line-strong);
}
.pro-tr {
    display: grid;
    position: absolute;
    left: 0;
    right: 0;
    height: 30px; /* ROW_HEIGHT 锁定值 */
    background: #fff;
    border-bottom: 1px solid #eef1ee;
}
/* 斑马纹按数据行号驱动（row-even 类）：虚拟滚动下 nth-child 只数可视切片，
   滚动时同一行的奇偶会漂移导致条纹"游动"，故不使用 nth-child */
.pro-tr.row-even {
    background: var(--at-zebra);
}
.pro-tr:hover {
    background: var(--at-hover);
    cursor: default;
}
/* 选中行：与地图高亮一致的红色语义 + ID列左缘红条锚点 */
.pro-tr.selected {
    background: #fdf0ef;
    color: #822b26;
}

/* 单元格通用层。GIS 表格经典的直角网状分割，线色弱化为呼吸感底纹 */
.cell {
    display: flex;
    align-items: center;
    height: 30px; /* ROW_HEIGHT 锁定值 */
    padding: 0 10px;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-right: 1px solid #edf0ed;
    box-sizing: border-box;
}

/* 数值列右对齐 + 等宽数字，千分位上下严格成列 */
.cell.data.numeric-data {
    justify-content: flex-end;
    font-variant-numeric: tabular-nums;
}

/* 表头单元格：扁平浅底，悬停微亮，排序指示用SVG三角 */
.cell.header {
    height: 32px;
    padding: 0 10px;
    color: #46504a;
    font-size: 11.5px;
    font-weight: 600;
    justify-content: flex-start;
    box-sizing: border-box;
    position: relative;
    border-right: 1px solid var(--at-line);
}
.header-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
/* 排序交互态 */
.cell.header.sortable {
    cursor: pointer;
    user-select: none;
}
.cell.header.sortable:hover {
    background: #e9efe9;
    color: var(--text-brand-dark, #245c2d);
}
.header-sort-caret {
    display: inline-flex;
    margin-left: 4px;
    color: var(--brand-accent);
    flex-shrink: 0;
}
.header-sort-caret svg {
    width: 9px;
    height: 9px;
    fill: currentColor;
    transition: transform 0.15s ease;
}
.header-sort-caret.desc svg {
    transform: rotate(180deg);
}

/* 列宽拖拽热区（覆盖表头右缘，悬停显示指示线） */
.col-resize-grip {
    position: absolute;
    right: -5px;
    top: 0;
    bottom: 0;
    width: 10px;
    cursor: col-resize;
    z-index: 2;
}
.col-resize-grip:hover,
.col-resize-grip:active {
    background: linear-gradient(
        to right,
        transparent 4px,
        var(--brand-accent) 4px,
        var(--brand-accent) 6px,
        transparent 6px
    );
}

/* 搜索框：聚焦品牌绿光环 */
.pro-search-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-width: 0;
}
.pro-search-icon {
    position: absolute;
    left: 8px;
    width: 12px;
    height: 12px;
    color: #7a857c;
    pointer-events: none;
}
.pro-search-input {
    /* 随容器宽度弹性伸缩（cqw基于.pro-toolbar），空间不足时优先收缩让位给按钮；
       显式min-width覆盖input的auto最小尺寸（否则flex中拒绝收缩） */
    width: clamp(110px, 22cqw, 200px);
    min-width: 96px;
    height: 26px;
    padding: 0 24px 0 27px;
    border: 1px solid var(--at-line-strong);
    border-radius: 5px;
    background: #fff;
    box-shadow: none;
    font-family: inherit;
}
.pro-search-input:focus {
    border-color: var(--brand-accent);
    background: #fff;
    box-shadow: 0 0 0 3px rgba(var(--at-accent-rgb), 0.15);
}
.pro-search-clear {
    position: absolute;
    right: 3px;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
    color: #7a857c;
    font-size: 14px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
}
.pro-search-clear:hover {
    color: var(--danger);
    background: rgba(214, 69, 65, 0.1);
}

/* 视图筛选不可用状态（视图未就绪 / 相机未对地） */
.pro-toggle.unavailable .pro-toggle-box {
    border-style: dashed;
    opacity: 0.75;
}
.filter-warn {
    background: #fdf3e4;
    border: 1px solid #ecd3a8;
    border-radius: 999px;
    padding: 1px 9px;
    color: #8a5412;
    margin-left: 8px;
    white-space: nowrap;
    flex-shrink: 0;
}

/* OID 固定列：常驻左侧的固态锚点栏 */
.id-col {
    position: sticky;
    left: 0;
    z-index: 2;
    background: #f7f9f8; /* 常驻固态底色，横向滚动时保持视觉锚定 */
    color: #5a655e;
    border-right: 1px solid var(--at-line-strong);
    font-variant-numeric: tabular-nums;
}
.cell.header.id-col {
    z-index: 4;
    background: var(--at-head-bg);
    font-weight: 700;
}
.pro-tr .cell.id-col {
    cursor: pointer;
    transition:
        background 0.1s ease,
        color 0.1s ease;
}
.pro-tr .cell.id-col:hover {
    background: rgba(var(--at-accent-rgb), 0.12);
    color: var(--brand-primary-dark, var(--brand-accent));
}
.pro-tr.selected .id-col {
    background: #fbeae9;
    color: #822b26;
    box-shadow: inset 3px 0 0 var(--danger); /* 选中行左缘红条 */
}
.pro-tr.selected .cell {
    border-right-color: rgba(214, 69, 65, 0.16);
}

/* --------------- */
/* FOOTER 状态信息条 */
/* --------------- */
.pro-footer-bar {
    height: 26px;
    flex-shrink: 0;
    background: var(--at-head-bg);
    border-top: 1px solid var(--at-line-strong);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    font-size: 11px;
    color: #5b6660;
}
/* 长文案单行截断，空间不足时省略而不是撑破信息条 */
.footer-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 1;
}
.footer-spacer {
    flex: 1;
}
.sel-count {
    background: #dff1e1;
    border: 1px solid #a9d3ad;
    border-radius: 999px;
    padding: 1px 9px;
    color: #164a1a;
    white-space: nowrap;
    flex-shrink: 0;
}

/* 行内操作按钮（定位 / 删除）：幽灵圆角态 */
.cell.actions-col {
    justify-content: center;
    gap: 2px;
    border-right: none; /* 末列免竖线更透气 */
}
.cell.header.actions-col {
    justify-content: center;
    font-weight: 600;
}
.row-act {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--text-secondary, #6b7570);
    cursor: pointer;
    padding: 0;
    line-height: 1;
    transition:
        background 0.12s ease,
        color 0.12s ease;
}
.row-act svg {
    width: 13px;
    height: 13px;
    fill: currentColor;
}
.row-act:hover {
    background: rgba(var(--at-accent-rgb), 0.14);
    color: var(--brand-primary-dark, var(--brand-accent));
}
.row-act.danger:hover {
    background: rgba(214, 69, 65, 0.12);
    color: var(--danger);
}

/* 单元格行内编辑输入框 */
.cell-edit-input {
    width: 100%;
    height: 24px;
    padding: 0 6px;
    border: 1px solid var(--brand-accent);
    border-radius: 4px;
    font-size: 12px;
    font-family: inherit;
    outline: none;
    background: #fff;
    box-shadow: 0 0 0 3px rgba(var(--at-accent-rgb), 0.15);
}

/* --------------- */
/* 八向缩放锚点：四边加厚热区（悬停显色提示可抓取）+ 四角斜线指示标 */
/* 注意：窗口 overflow:hidden，锚点全部内贴边放置（不用负偏移避免被裁剪） */
/* --------------- */
.resize-grip.edge,
.resize-grip.corner {
    position: absolute;
    z-index: 500;
}
.resize-grip.edge.n {
    top: 0;
    left: 16px;
    right: 16px;
    height: 6px;
    cursor: ns-resize;
}
.resize-grip.edge.s {
    bottom: 0;
    left: 16px;
    right: 16px;
    height: 6px;
    cursor: ns-resize;
}
.resize-grip.edge.w {
    left: 0;
    top: 16px;
    bottom: 16px;
    width: 6px;
    cursor: ew-resize;
}
.resize-grip.edge.e {
    right: 0;
    top: 16px;
    bottom: 16px;
    width: 6px;
    cursor: ew-resize;
}

.resize-grip.corner {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #b9c2bc; /* 默认低调可见，让用户知道这里可以抓 */
    z-index: 501; /* 角点压过边缘热区，靠角优先命中 */
    transition: color 0.12s ease;
}
.resize-grip.corner:hover {
    color: var(--brand-accent);
}
.resize-grip.corner svg {
    width: 10px;
    height: 10px;
    display: block;
}
.resize-grip.corner.se {
    right: 1px;
    bottom: 1px;
    cursor: nwse-resize;
}
.resize-grip.corner.sw {
    left: 1px;
    bottom: 1px;
    cursor: nesw-resize;
}
.resize-grip.corner.sw svg {
    transform: scaleX(-1);
}
.resize-grip.corner.ne {
    right: 1px;
    top: 1px;
    cursor: nesw-resize;
}
.resize-grip.corner.ne svg {
    transform: scaleY(-1);
}
.resize-grip.corner.nw {
    left: 1px;
    top: 1px;
    cursor: nwse-resize;
}
.resize-grip.corner.nw svg {
    transform: scale(-1, -1);
}

.pro-float-fade-enter-active,
.pro-float-fade-leave-active {
    transition:
        opacity 0.14s ease-out,
        transform 0.12s ease-out;
}
.pro-float-fade-enter-from,
.pro-float-fade-leave-to {
    opacity: 0;
    transform: translateY(6px) scale(0.995); /* 原生窗口般干脆的轻微浮现 */
}

/* 触控设备基础：拖拽热区禁用浏览器手势接管，保证 pointermove 连续 */
.pro-header,
.resize-grip {
    touch-action: none;
}

/* =====================================================
   移动端适配（≤768px）：全宽底部停靠面板
   - 顶栏只保留标题与关闭/最小化，禁自由拖拽（JS 已拦截）
   - 工具栏图标化 + 横向滚动
   - 仅顶边可拖调高度
   ===================================================== */
@media (max-width: 768px) {
    .pro-float-window {
        min-width: 0;
        border-radius: 12px 12px 0 0;
        border-left: none;
        border-right: none;
        border-bottom: none;
        box-shadow:
            0 -10px 28px rgba(15, 35, 20, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.7);
    }

    /* 顶部拖拽条视觉提示（高度调节把手） */
    .pro-header {
        position: relative;
        height: 42px;
    }
    .pro-title-wrap::before {
        content: '';
        position: absolute;
        top: 4px;
        left: 50%;
        transform: translateX(-50%);
        width: 36px;
        height: 3px;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.45);
    }
    .pro-title {
        font-size: 12px;
    }
    .win-btn {
        width: 46px;
    }

    /* 工具栏：单行横向滚动 + 图标化（隐藏文字标签） */
    .pro-toolbar {
        flex-wrap: nowrap;
        overflow-x: auto;
        scrollbar-width: none;
        padding-left: 8px;
        padding-right: 8px;
    }
    .pro-toolbar::-webkit-scrollbar {
        display: none;
    }
    .toolbar-group {
        flex-shrink: 0;
    }
    .btn-label {
        display: none;
    }
    .divider {
        margin: 0 3px;
    }
    .pro-search-wrap {
        width: 130px;
        flex-shrink: 0;
    }
    .toggle-label {
        max-width: 64px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: inline-block;
    }

    /* 行操作按钮放大触控面积 */
    .row-act {
        min-width: 32px;
        min-height: 32px;
    }

    /* 隐藏被 JS 禁用的缩放热区，仅留顶边调高手感 */
    .resize-grip.edge.s,
    .resize-grip.edge.w,
    .resize-grip.edge.e,
    .resize-grip.corner {
        display: none;
    }
    .resize-grip.edge.n {
        height: 14px;
        top: -6px;
    }

    /* 底部信息条紧凑化 */
    .pro-footer-bar {
        font-size: 10.5px;
        padding: 4px 8px;
        gap: 6px;
    }
}
</style>

