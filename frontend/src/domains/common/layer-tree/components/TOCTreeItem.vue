<template>
    <div
        class="toc-item"
        :class="[`kind-${node.type}`, { expanded: isExpanded }]"
        :style="{ '--node-level': Number(node.level || 0) }"
    >
        <div
            class="toc-row"
            :class="{
                'is-folder': node.type === 'folder',
                'is-leaf': node.type === 'layer',
                'is-active': node.type === 'layer' && node.id === activeLayerId,
                'is-multi-selected': isLayerMultiSelected,
                'is-off': !isVisible,
            }"
            :draggable="!!node.draggable"
            @click="handlePrimaryClick"
            @contextmenu.prevent="openContextMenuFromEvent"
            @dragstart="handleDragStart"
            @dragover.prevent
            @drop="handleDrop"
        >
            <span
                v-if="node.draggable"
                class="drag-grip"
                title="拖拽排序"
            >
                <GripVertical
                    :size="12"
                    :stroke-width="2"
                />
            </span>

            <button
                v-if="node.type === 'folder'"
                class="tree-toggle"
                :aria-label="isExpanded ? '折叠' : '展开'"
                @click.stop="handleToggleExpand"
            >
                <ChevronRight
                    class="chevron"
                    :class="{ open: isExpanded }"
                    :size="13"
                    :stroke-width="2.2"
                />
            </button>

            <!-- 类型图标：文件夹 / 图层 -->
            <span
                class="kind-icon"
                :class="{ 'is-folder': node.type === 'folder' }"
            >
                <FolderOpen
                    v-if="node.type === 'folder' && isExpanded"
                    :size="14"
                    :stroke-width="1.8"
                />
                <Folder
                    v-else-if="node.type === 'folder'"
                    :size="14"
                    :stroke-width="1.8"
                />
                <Layers
                    v-else
                    :size="13"
                    :stroke-width="1.8"
                />
            </span>

            <div
                class="row-label"
                @click.stop="handleLabelClick"
            >
                <span
                    v-if="!isRenaming"
                    class="name"
                    :title="node.displayName || node.name"
                    @dblclick.stop="startRename"
                    >{{ node.displayName || node.name }}</span
                >
                <input
                    v-else
                    ref="renameInputRef"
                    class="rename-input"
                    type="text"
                    :value="renameValue"
                    @input="handleRenameInput"
                    @keydown.enter="commitRename"
                    @keydown.escape="cancelRename"
                    @blur="commitRename"
                    @click.stop
                />
                <span
                    v-if="node.type === 'layer' && node.id === activeLayerId"
                    class="active-indicator"
                ></span>
            </div>

            <span
                v-if="node.type === 'layer' && (node.featureCount || 0) > 0"
                class="feature-badge"
                >{{ node.featureCount }}</span
            >

            <!-- 可见性：ESRI 式眼睛开关（文件夹支持半选态） -->
            <button
                class="visibility-btn"
                :class="{ off: !isVisible, partial: isPartialVisible }"
                :aria-label="isVisible ? '隐藏图层' : '显示图层'"
                :title="isPartialVisible ? '部分子图层可见' : isVisible ? '隐藏图层' : '显示图层'"
                @click.stop="handleToggleVisibility"
            >
                <EyeOff
                    v-if="!isVisible"
                    :size="14"
                    :stroke-width="1.9"
                />
                <Eye
                    v-else
                    :size="14"
                    :stroke-width="1.9"
                />
            </button>

            <button
                v-if="menuItems.length"
                class="more-btn"
                aria-label="更多操作"
                @click.stop="openContextMenuFromButton"
            >
                <MoreHorizontal
                    :size="15"
                    :stroke-width="2"
                />
            </button>
        </div>

        <div
            v-if="node.type === 'folder' && isExpanded"
            class="toc-children"
        >
            <TOCTreeItem
                v-for="child in node.children || []"
                :key="child.id"
                :node="child"
                :active-layer-id="activeLayerId"
                :selected-layer-ids="selectedLayerIds"
                :search-active="searchActive"
                @action="emit('action', $event)"
            />
        </div>

        <teleport to="body">
            <div
                v-if="menuVisible"
                ref="menuRef"
                class="toc-context-menu"
                :style="{ left: `${menuX}px`, top: `${menuY}px` }"
                @contextmenu.prevent
            >
                <template
                    v-for="item in menuItems"
                    :key="item.key"
                >
                    <div
                        v-if="item.divider"
                        class="menu-divider"
                    ></div>
                    <div
                        v-else-if="item.key === 'opacity'"
                        class="menu-opacity-item"
                    >
                        <span class="menu-item-label">{{ item.label }}</span>
                        <input
                            type="range"
                            class="opacity-slider"
                            min="0"
                            max="1"
                            step="0.05"
                            :value="item.opacity ?? 1"
                            @input="handleOpacityChange"
                        />
                        <span class="opacity-value">{{ Math.round((item.opacity ?? 1) * 100) }}%</span>
                    </div>
                    <div
                        v-else-if="item.key === 'set-height'"
                        class="menu-opacity-item"
                    >
                        <span class="menu-item-label">{{ item.label }}</span>
                        <input
                            type="range"
                            class="opacity-slider"
                            :min="item.slider?.min ?? 0"
                            :max="item.slider?.max ?? 0"
                            :step="item.slider?.step || 1"
                            :value="item.value ?? 0"
                            @input="handleHeightChange"
                        />
                        <span class="opacity-value">{{ Math.round(item.value ?? 0) }}m</span>
                    </div>
                    <div
                        v-else-if="item.key === 'set-material'"
                        class="menu-opacity-item"
                    >
                        <span class="menu-item-label">{{ item.label }}</span>
                        <select
                            class="menu-material-select"
                            :value="item.value"
                            @change="handleMaterialChange"
                        >
                            <option
                                v-for="choice in item.choices || []"
                                :key="choice.value"
                                :value="choice.value"
                            >
                                {{ choice.label }}
                            </option>
                        </select>
                    </div>
                    <!-- 分组项（如「导出数据」）：点击就地展开格式子项，不占主菜单常驻空间 -->
                    <template v-else-if="item.children?.length">
                        <button
                            class="menu-item has-submenu"
                            :class="{ 'is-open': openSubmenuKey === item.key }"
                            :aria-expanded="openSubmenuKey === item.key ? 'true' : 'false'"
                            @click="toggleSubmenu(item.key)"
                        >
                            <component
                                :is="item.icon"
                                v-if="item.icon"
                                class="menu-icon"
                                :size="13"
                                :stroke-width="1.8"
                            />
                            <span class="menu-item-text">{{ item.label }}</span>
                            <ChevronRight
                                class="submenu-chevron"
                                :size="13"
                                :stroke-width="2"
                            />
                        </button>
                        <div
                            v-if="openSubmenuKey === item.key"
                            class="menu-subitems"
                        >
                            <button
                                v-for="child in item.children"
                                :key="child.key"
                                class="menu-item menu-subitem"
                                :class="{ danger: !!child.danger }"
                                @click="handleMenuCommand(child.key)"
                            >
                                <span>{{ child.label }}</span>
                            </button>
                        </div>
                    </template>
                    <button
                        v-else
                        class="menu-item"
                        :class="{ danger: !!item.danger }"
                        @click="handleMenuCommand(item.key)"
                    >
                        <component
                            :is="item.icon"
                            v-if="item.icon"
                            class="menu-icon"
                            :size="13"
                            :stroke-width="1.8"
                        />
                        <span>{{ item.label }}</span>
                    </button>
                </template>
            </div>
        </teleport>
    </div>
</template>


<script lang="ts" src="./TOCTreeItem.ts"></script>

<style scoped>
.toc-item {
    position: relative;
}

.toc-row {
    position: relative;
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: var(--toc-spacing-sm);
    border-radius: var(--toc-radius-md);
    padding: var(--toc-spacing-xs) var(--toc-spacing-md) var(--toc-spacing-xs) calc(6px + (var(--node-level, 0) * 18px));
    transition: all var(--toc-transition-normal);
    cursor: pointer;
    user-select: none;
}

/* 隐藏的图层整行淡化（ESRI 惯例） */
.toc-row.is-off .name,
.toc-row.is-off .kind-icon {
    opacity: 0.5;
}

/* 提高特异性并排除激活/多选行，避免被 is-leaf/is-folder 的后置背景覆盖 */
.toc-row:not(.is-active):not(.is-multi-selected):hover {
    background: rgba(var(--brand-primary-rgb), 0.18);
    box-shadow: inset 0 0 0 1px rgba(var(--brand-primary-rgb), 0.14);
}

.toc-row.is-active {
    background: var(--toc-bg-active);
}

/* 激活态左侧强调条：伪元素实现，不产生布局位移 */
.toc-row.is-active::after {
    content: '';
    position: absolute;
    left: calc(var(--node-level, 0) * 18px + 2px);
    top: 7px;
    bottom: 7px;
    width: 3px;
    border-radius: 999px;
    background: var(--brand-gradient);
    box-shadow: 0 0 8px rgba(var(--brand-primary-dark-rgb), 0.35);
}

.toc-row.is-active .name {
    color: var(--toc-primary);
    font-weight: 600;
}

.toc-row.is-active:hover {
    background: var(--toc-bg-active-hover);
}

.toc-row.is-multi-selected {
    background: var(--toc-bg-selected);
    box-shadow: inset 0 0 0 1px var(--toc-border-selected);
}

.toc-row.is-multi-selected .name {
    color: var(--toc-selected-text);
}

.toc-row::before {
    content: '';
    position: absolute;
    left: calc((var(--node-level, 0) * 18px) - 9px);
    top: 50%;
    width: 10px;
    border-top: 1px solid rgba(var(--brand-primary-rgb), 0.28);
    transform: translateY(-50%);
    opacity: calc(min(var(--node-level, 0), 1));
}

.tree-toggle {
    border: none;
    background: transparent;
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
    color: var(--toc-text-secondary);
    transition: color var(--toc-transition-normal);
    border-radius: var(--toc-radius-sm);
}

.tree-toggle:hover {
    background: var(--toc-primary-bg);
    color: var(--toc-primary);
}

.chevron {
    transition: transform var(--toc-transition-normal);
}

.chevron.open {
    transform: rotate(90deg);
}

/* 拖拽排序把手：仅可拖拽行显示，悬停浮现 */
.drag-grip {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    margin-left: -4px;
    color: var(--toc-text-light);
    opacity: 0;
    cursor: grab;
    transition: opacity var(--toc-transition-normal);
}

.toc-row:hover .drag-grip {
    opacity: 0.85;
}

/* 类型图标：文件夹品牌色 / 图层中性色 */
.kind-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    color: var(--toc-text-secondary);
}

.kind-icon.is-folder {
    color: var(--brand-primary);
}

/* 可见性：ESRI 式眼睛开关 */
.visibility-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--toc-primary);
    cursor: pointer;
    transition:
        color var(--toc-transition-fast),
        background var(--toc-transition-fast),
        transform var(--toc-transition-fast);
}

.visibility-btn:hover {
    background: var(--toc-primary-bg-hover);
    transform: scale(1.06);
}

.visibility-btn:active {
    transform: scale(0.9);
}

.visibility-btn.off {
    color: var(--toc-text-light);
}

.visibility-btn.partial {
    opacity: 0.55;
}

.row-label {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 7px;
    transition: all var(--toc-transition-normal);
}

.name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--toc-font-sm);
    color: var(--toc-text-dark);
    transition: color var(--toc-transition-normal);
}

/* 激活态呼吸圆点 */
.active-indicator {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--brand-gradient);
    box-shadow: 0 0 6px rgba(var(--brand-primary-dark-rgb), 0.45);
    animation: activePulse 1.8s ease-in-out infinite;
}

@keyframes activePulse {
    50% {
        transform: scale(0.7);
        opacity: 0.55;
    }
}

.feature-badge {
    flex-shrink: 0;
    font-size: var(--toc-font-xs);
    font-variant-numeric: tabular-nums;
    color: var(--toc-text-secondary);
    border: 1px solid var(--toc-badge-border);
    background: rgba(255, 255, 255, 0.55);
    border-radius: 999px;
    padding: 1px 7px;
    line-height: 14px;
    transition: all var(--toc-transition-normal);
}

.toc-row:hover .feature-badge {
    border-color: var(--toc-badge-border-hover);
    background: var(--toc-badge-bg-hover);
}

.toc-row.is-active .feature-badge {
    color: var(--toc-primary);
    border-color: var(--toc-border-active);
    background: var(--toc-badge-bg-active);
}

.more-btn {
    margin-left: auto;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--toc-text-secondary);
    border-radius: var(--toc-radius-md);
    width: 24px;
    height: 24px;
    padding: 0;
    cursor: pointer;
    opacity: 0;
    transform: translateX(4px);
    transition:
        opacity var(--toc-transition-normal),
        transform var(--toc-transition-normal),
        color var(--toc-transition-fast),
        background var(--toc-transition-fast);
}

.more-btn:hover {
    color: var(--toc-primary);
    background: var(--toc-primary-bg-hover);
}

.more-btn:active {
    transform: scale(0.92);
}

.toc-row:hover .more-btn,
.toc-row:focus-within .more-btn,
.toc-row.is-active .more-btn {
    opacity: 1;
    transform: translateX(0);
}

.toc-row.is-active .more-btn {
    color: var(--toc-primary);
}

/* 图层行：干净透明，靠 hover/激活态反馈 */
.toc-row.is-leaf {
    background-color: transparent;
    transition: background-color var(--toc-transition-slow);
}

/* 文件夹行：轻品牌色着色 + 加粗标题 */
.toc-row.is-folder {
    background: linear-gradient(
        135deg,
        rgba(var(--brand-primary-rgb), 0.13) 0%,
        rgba(var(--brand-primary-rgb), 0.04) 100%
    );
    transition: background-color var(--toc-transition-slow);
}

.toc-row.is-folder .name {
    font-weight: 600;
    color: var(--toc-text-dark);
}

.toc-children {
    position: relative;
}

.toc-children::before {
    content: '';
    position: absolute;
    left: calc((var(--node-level, 0) * 18px) + 5px);
    top: 0;
    bottom: 6px;
    border-left: 1px solid rgba(var(--brand-primary-rgb), 0.22);
}

.toc-context-menu {
    position: fixed;
    z-index: var(--z-popover);
    min-width: 190px;
    /* 视口高度约束：图层 action 较多时菜单会高于屏幕，若不约束，
       「移回视口」也无处可移，底部命令永远落在视口外（移动端必现）。
       约束后由菜单自身滚动承载溢出内容，手指在菜单内上下拖动即可看全。
       先 vh 兜底再 dvh：移动端地址栏收放时 dvh 跟随可视区变化，更准。 */
    max-height: calc(100vh - 30px);
    max-height: calc(100dvh - 30px);
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    border: 1px solid var(--toc-border-light);
    border-radius: var(--toc-radius-lg);
    background: var(--toc-bg-menu);
    box-shadow: var(--toc-shadow-lg);
    padding: var(--toc-spacing-sm);
    backdrop-filter: blur(10px);
}

.menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    border: none;
    background: transparent;
    color: var(--toc-text-primary);
    text-align: left;
    border-radius: var(--toc-radius-md);
    padding: var(--toc-spacing-md) 10px;
    font-size: var(--toc-font-sm);
    cursor: pointer;
    transition: all var(--toc-transition-fast);
}

.menu-icon {
    flex-shrink: 0;
    color: var(--toc-text-secondary);
    transition: color var(--toc-transition-fast);
}

.menu-item:hover {
    background: var(--toc-primary-bg-hover);
    color: var(--toc-primary);
}

.menu-item:hover .menu-icon {
    color: var(--toc-primary);
}

.menu-item:active {
    transform: scale(0.98);
}

.menu-item.danger {
    color: var(--toc-danger);
}

.menu-item.danger:hover {
    background: var(--toc-danger-bg);
    color: var(--toc-danger-hover);
}

/* 分组项（如「导出数据」）：文字占满剩余宽度，箭头贴右表达「可展开」 */
.menu-item-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.menu-item.has-submenu .submenu-chevron {
    flex-shrink: 0;
    margin-left: auto;
    color: var(--toc-text-light);
    transition:
        transform var(--toc-transition-fast),
        color var(--toc-transition-fast);
}

.menu-item.has-submenu.is-open {
    color: var(--toc-primary);
}

.menu-item.has-submenu.is-open .submenu-chevron {
    transform: rotate(90deg);
    color: var(--toc-primary);
}

/* 子选项容器：左缩进 + 竖线表达从属关系；子项复用 .menu-item 的点击态，
   仅降低文字权重，触屏档的 44px 最小高度由 .menu-item 统一提供 */
.menu-subitems {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 2px 0 var(--toc-spacing-xs) 10px;
    padding-left: 6px;
    border-left: 1px solid var(--toc-border-light);
    animation: tocSubmenuIn 0.14s ease-out;
}

.menu-subitem {
    color: var(--toc-text-secondary);
}

@keyframes tocSubmenuIn {
    from {
        opacity: 0;
        transform: translateY(-3px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@media (prefers-reduced-motion: reduce) {
    .menu-subitems {
        animation: none;
    }
}

.menu-divider {
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, rgba(67, 83, 69, 0.4) 50%, transparent 100%);
    margin: var(--toc-spacing-xs) 0;
}

.rename-input {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--toc-primary);
    border-radius: var(--toc-radius-sm);
    padding: 1px var(--toc-spacing-xs);
    font-size: var(--toc-font-sm);
    color: var(--toc-text-dark);
    background: var(--toc-bg-input);
    outline: none;
    box-shadow: 0 0 0 2px var(--toc-primary-bg-hover);
}

.menu-opacity-item {
    display: flex;
    align-items: center;
    gap: var(--toc-spacing-md);
    padding: var(--toc-spacing-sm) 11px;
    font-size: var(--toc-font-sm);
    color: var(--toc-text-primary);
}

.menu-item-label {
    flex-shrink: 0;
    min-width: 42px;
}

.opacity-slider {
    flex: 1;
    height: 4px;
    accent-color: var(--toc-primary);
    cursor: pointer;
}

.opacity-value {
    flex-shrink: 0;
    width: 36px;
    text-align: right;
    font-size: 11px;
    color: var(--toc-text-secondary);
}

.menu-material-select {
    flex: 1;
    min-width: 0;
    height: 24px;
    border: 1px solid var(--toc-border, #d9d9d9);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font-size: 12px;
    padding: 0 4px;
    cursor: pointer;
}

/* 触屏设备（真机手机/平板）：手指目标至少 40px，且图标同步放大。
 * 注：F12 只拉窄窗口测不出 iOS 问题，真机以触屏+窄视口双条件为准，
 * 故用 pointer: coarse 而不用宽度断点。 */
@media (pointer: coarse) {
    .toc-row {
        min-height: 44px;
    }

    .visibility-btn,
    .tree-toggle {
        width: 40px;
        height: 40px;
    }

    .visibility-btn svg,
    .tree-toggle svg,
    .kind-icon svg {
        width: 18px;
        height: 18px;
    }

    .menu-item {
        min-height: 44px;
    }

    .toc-context-menu {
        max-width: calc(100vw - 32px);
        /* 扣除底部安全区：菜单接近满屏时，最后一项不被 Home Indicator 压住 */
        max-height: calc(100dvh - 16px - env(safe-area-inset-bottom, 0px));
        padding-bottom: calc(var(--toc-spacing-sm) + env(safe-area-inset-bottom, 0px));
    }

    /* 触屏无 hover，拖拽把手永不浮现，隐藏以省出横向空间 */
    .drag-grip {
        display: none;
    }
}
</style>

