<template>
    <div
        class="map-controls-group modern-glass"
        :class="{ 'coord-open': coordPanelOpen }"
    >
        <!-- 坐标显示开关：桌面默认显示、触屏默认收起，点击切换 -->
        <button
            class="coord-toggle-btn"
            :class="{ open: coordPanelOpen }"
            type="button"
            :title="t('mapControls.toggleCoord')"
            :aria-label="t('mapControls.toggleCoord')"
            :aria-pressed="coordPanelOpen"
            @click="coordPanelOpen = !coordPanelOpen"
        >
            <Eye
                v-if="coordPanelOpen"
                :size="17"
                :stroke-width="2"
            />
            <EyeOff
                v-else
                :size="17"
                :stroke-width="2"
            />
        </button>
        <div class="coordinate-section">
            <!-- <svg id="map-marker-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="margin: 0 10px;">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg> -->

            <div
                class="coordinate-display"
                :class="{ editing: isCoordinateEditing, invalid: isInputInvalid }"
                :title="t('mapControls.editCoordTip')"
                @mouseenter="isCoordinateHover = true"
                @mouseleave="isCoordinateHover = false"
                @click="startCoordinateInput"
            >
                <template v-if="!isCoordinateEditing">
                    <span class="coordinate-text">{{ displayCoordinateText }}</span>
                    <div class="coordinate-actions">
                        <button
                            v-if="canCopyCoordinate && (isCoordinateHover || (isTouch && coordPanelOpen))"
                            class="copy-coordinate-btn"
                            type="button"
                            :title="t('mapControls.copyCoord')"
                            @click.stop="copyCurrentCoordinate"
                        >
                            <Copy
                                :size="15"
                                :stroke-width="2"
                            />
                            <span class="copy-tooltip">{{ copyTooltipText }}</span>
                        </button>
                        <button
                            class="format-config-btn"
                            type="button"
                            :class="{ open: isFormatMenuVisible }"
                            :title="t('mapControls.formatSettings')"
                            @click.stop="toggleFormatMenu"
                        >
                            <ChevronRight
                                :size="16"
                                :stroke-width="2.2"
                            />
                        </button>
                    </div>
                </template>
                <input
                    v-else
                    ref="coordinateInputRef"
                    v-model="coordinateInputValue"
                    class="coordinate-input"
                    type="text"
                    :placeholder="t('mapControls.inputPlaceholder')"
                    @click.stop
                    @input="isInputInvalid = false"
                    @keydown.enter.prevent="submitCoordinateInput"
                    @keydown.esc.prevent="cancelCoordinateInput"
                    @blur="cancelCoordinateInput"
                />
            </div>

            <!-- 格式配置菜单 -->
            <div
                v-if="isFormatMenuVisible"
                class="format-menu"
            >
                <div class="format-menu-content">
                    <div class="menu-section">
                        <div class="menu-label">{{ t('mapControls.displayFormat') }}</div>
                        <div class="format-options">
                            <button
                                v-for="fmt in formatOptions"
                                :key="fmt.id"
                                class="format-option"
                                :class="{ active: currentFormatId === fmt.id }"
                                @click="selectFormat(fmt.id)"
                            >
                                <span class="format-label">{{ fmt.label }}</span>
                                <span class="format-example">{{ fmt.example }}</span>
                            </button>
                        </div>
                    </div>

                    <div class="menu-divider"></div>

                    <div class="menu-section">
                        <div class="menu-label">{{ t('mapControls.decimalPlaces') }}</div>
                        <div class="decimal-options">
                            <button
                                v-for="(config, places) in decimalPlaces"
                                :key="places"
                                class="decimal-option"
                                :class="{ active: currentDecimalPlaces === Number(places) }"
                                @click="selectDecimalPlaces(Number(places))"
                            >
                                {{ config.label }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div
            class="zoom-level-display"
            :title="t('mapControls.zoomLevel')"
        >
            {{ displayZoom }}
        </div>
        <div class="divider"></div>
        <button
            class="home-btn"
            :class="{ rippling: homeButtonRippling }"
            :title="t('mapControls.homeTip')"
            type="button"
            @click="handleHomeInteract"
        >
            <House
                :size="18"
                :stroke-width="1.8"
            />
        </button>
    </div>
</template>

<script lang="ts" src="./MapControlsBar.ts"></script>

<style scoped>
/* 浅色玻璃拟态，与 LayerControlPanel / TOC 面板统一 */
.map-controls-group {
    --mc-text: var(--text-brand-dark);
    --mc-muted: var(--brand-accent-muted);
    position: absolute;
    right: 8px;
    bottom: 8px;
    z-index: var(--z-panel);
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 9999px;
    color: var(--mc-text);
    white-space: nowrap;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    box-shadow:
        var(--toc-shadow-md),
        inset 0 1px 0 rgba(255, 255, 255, 0.6);
    padding: 4px;
}

.coordinate-display {
    min-width: 260px;
    height: 36px;
    padding: 0 10px 0 14px;
    border-radius: 9999px;
    border: 1px solid transparent;
    background: rgba(var(--brand-primary-rgb), 0.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    cursor: text;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.coordinate-display:hover {
    background: rgba(var(--brand-primary-rgb), 0.1);
}

.coordinate-display.editing {
    background: #ffffff;
    border-color: var(--brand-primary-light);
    box-shadow: 0 0 0 3px var(--toc-primary-bg-hover);
}

.coordinate-display.invalid {
    border-color: rgba(var(--danger-rgb), 0.55);
    box-shadow: 0 0 0 3px rgba(var(--danger-rgb), 0.12);
}

.coordinate-section {
    position: relative;
    display: flex;
    align-items: center;
}

/* 坐标显示开关：桌面与触屏共用；关闭时隐藏坐标区 */
.coord-toggle-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.92);
    color: var(--brand-accent-dark);
    cursor: pointer;
    flex-shrink: 0;
    transition:
        transform 0.15s ease,
        background 0.15s ease,
        color 0.15s ease;
}

.coord-toggle-btn:hover {
    background: var(--toc-primary-bg-hover);
}

.coord-toggle-btn:active {
    transform: scale(0.94);
}

.coord-toggle-btn svg {
    width: 17px;
    height: 17px;
}

/* 关闭态隐藏坐标区（桌面与触屏通用） */
.map-controls-group:not(.coord-open) .coordinate-section {
    display: none;
}

.coordinate-actions {
    display: flex;
    align-items: center;
    gap: 3px;
}

.coordinate-text {
    /* 等宽字体保证数字跳动时不抖动 */
    font-family: 'JetBrains Mono', 'Fira Code', 'Roboto Mono', monospace;
    font-size: 15px;
    font-weight: 600;
    color: var(--mc-text);
    letter-spacing: 0.03em;
}

.coordinate-display.editing .coordinate-input {
    color: var(--text-brand-dark);
}

.copy-coordinate-btn {
    height: 24px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: none;
    background: transparent;
    color: var(--toc-text-secondary);
    border-radius: 9999px;
    padding: 0 7px;
    font-size: 11px;
    cursor: pointer;
    transition:
        background 0.15s ease,
        color 0.15s ease,
        transform 0.12s ease;
}

.copy-coordinate-btn:hover {
    transform: translateY(-1px);
    background: var(--toc-primary-bg-hover);
    color: var(--brand-accent-dark);
}

.copy-tooltip {
    line-height: 1;
    font-variant-numeric: tabular-nums;
}

.format-config-btn {
    height: 24px;
    width: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--toc-text-secondary);
    border-radius: 50%;
    padding: 0;
    cursor: pointer;
    flex-shrink: 0;
    transition:
        background 0.15s ease,
        color 0.15s ease;
}

.format-config-btn:hover {
    background: var(--toc-primary-bg-hover);
    color: var(--brand-accent-dark);
}

.format-config-btn.open {
    background: var(--toc-primary-bg-hover);
    color: var(--brand-accent-dark);
}

.format-config-btn.open svg {
    transform: rotate(90deg);
}

.format-config-btn svg {
    transition: transform 0.2s ease;
}

.format-menu {
    position: absolute;
    bottom: 100%;
    left: 0;
    margin-bottom: 8px;
    z-index: var(--z-modal);
    background: rgba(255, 255, 255, 0.97);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    border-radius: 12px;
    box-shadow: var(--toc-shadow-lg);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    overflow: hidden;
    animation: slideUp 0.22s var(--trans-curve, ease-out);
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(8px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.format-menu-content {
    padding: 12px;
    min-width: 280px;
    max-height: 420px;
    overflow-y: auto;
}

.menu-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.menu-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 0 4px;
}

.format-options {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.format-option {
    padding: 6px 9px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.16);
    border-radius: 9px;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
}

.format-option:hover {
    background: var(--toc-primary-bg);
    border-color: rgba(var(--brand-primary-dark-rgb), 0.4);
}

.format-option.active {
    background: var(--toc-primary-bg-hover);
    border-color: var(--brand-primary);
}

.format-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--brand-primary-dark);
    margin-bottom: 2px;
}

.format-example {
    display: block;
    font-size: 11px;
    color: var(--text-secondary);
    font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.menu-divider {
    height: 1px;
    background: rgba(var(--brand-primary-rgb), 0.1);
    margin: 8px 0;
}

.decimal-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
}

.decimal-option {
    padding: 7px 12px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.16);
    border-radius: 9px;
    background: transparent;
    cursor: pointer;
    text-align: center;
    font-size: 12px;
    font-weight: 600;
    color: var(--toc-text-secondary);
    transition: all 0.15s ease;
}

.decimal-option:hover {
    background: var(--toc-primary-bg);
    border-color: rgba(var(--brand-primary-dark-rgb), 0.4);
}

.decimal-option.active {
    background: var(--brand-gradient);
    border-color: transparent;
    color: #ffffff;
    box-shadow: 0 2px 7px rgba(var(--brand-primary-dark-rgb), 0.3);
}

.coordinate-input {
    width: 100%;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-brand-dark);
    font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
    font-size: 13px;
}

.coordinate-input::placeholder {
    color: var(--toc-text-light);
}

.zoom-level-display {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #ffffff;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    color: var(--brand-accent-dark);
    font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
    font-size: 15px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    font-variant-numeric: tabular-nums;
}

.divider {
    width: 1px;
    height: 20px;
    background-color: rgba(var(--brand-primary-rgb), 0.18);
    flex-shrink: 0;
}

.home-btn {
    --ripple-x: 50%;
    --ripple-y: 50%;
    width: 36px;
    height: 36px;
    position: relative;
    overflow: hidden;
    border-radius: 50%;
    background: var(--brand-gradient);
    border: none;
    color: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow:
        0 3px 9px rgba(var(--brand-primary-dark-rgb), 0.32),
        inset 0 1px 0 rgba(255, 255, 255, 0.28);
    transition:
        transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
        filter 0.2s ease,
        box-shadow 0.2s ease;
}

.home-btn::after {
    content: '';
    position: absolute;
    left: var(--ripple-x);
    top: var(--ripple-y);
    width: 10px;
    height: 10px;
    border-radius: 50%;
    transform: translate(-50%, -50%) scale(0);
    background: rgba(255, 255, 255, 0.4);
    opacity: 0;
    pointer-events: none;
}

.home-btn.rippling::after {
    animation: home-button-ripple 0.45s ease-out;
}

.home-btn:hover {
    filter: brightness(1.07);
    transform: scale(1.06);
    box-shadow:
        0 5px 14px rgba(var(--brand-primary-dark-rgb), 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.28);
}

.home-btn:active {
    transform: scale(0.94);
}

@keyframes home-button-ripple {
    0% {
        opacity: 0.5;
        transform: translate(-50%, -50%) scale(0);
    }
    100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(10);
    }
}

@media (pointer: coarse) {
    /* 触屏默认右侧竖列：只保留缩放 / 主页(定位) / 坐标开关图标 */
    .map-controls-group {
        right: 12px;
        bottom: 10%;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 8px 6px;
        width: auto;
        border-radius: 999px;
    }

    .map-controls-group {
        right: 10px;
        bottom: 30px;
        transform: scale(0.8);
    }

    /* 展开坐标时恢复为桌面式横向一行；隐藏时保持右侧竖列 */
    .map-controls-group.coord-open {
        flex-direction: row;
        align-items: center;
        gap: 8px;
        padding: 4px;
        border-radius: 9999px;
        max-width: calc(100vw - 24px);
    }

    .map-controls-group.coord-open .coordinate-section {
        min-width: 0;
        flex: 1 1 auto;
    }

    .map-controls-group.coord-open .coordinate-display {
        min-width: 0;
        flex: 1 1 auto;
    }

    /* 窄屏下坐标文本允许省略，保证横向一行不溢出 */
    .map-controls-group.coord-open .coordinate-text {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* 横向一行时分隔线改回竖向发丝线 */
    .map-controls-group.coord-open .divider {
        width: 1px;
        height: 20px;
    }

    /* 触屏坐标开关放大到 ≥40px，图标同步放大（规范 §3 移动端基线） */
    .coord-toggle-btn {
        width: 40px;
        height: 40px;
    }

    .coord-toggle-btn svg {
        width: 20px;
        height: 20px;
    }

    .divider {
        width: 60%;
        height: 1px;
        flex-shrink: 0;
    }

    .copy-tooltip {
        display: none;
    }

    /* 触屏下格式菜单不再使用固定 min-width，避免窄屏横向溢出（规范 §3 移动端基线） */
    .format-menu-content {
        min-width: 0;
        width: min(280px, calc(100vw - 48px));
        max-height: 55vh;
    }

    /* 触屏可点击目标 ≥40px，图标 glyph 同步放大（规范 §3 移动端基线） */
    .zoom-level-display {
        width: 40px;
        height: 40px;
        font-size: 16px;
    }

    .home-btn {
        width: 42px;
        height: 42px;
    }

    .home-btn svg {
        width: 22px;
        height: 22px;
    }
}
</style>
