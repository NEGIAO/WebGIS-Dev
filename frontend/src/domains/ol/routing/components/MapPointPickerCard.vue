<template>
    <div
        class="point-picker-wrap"
        :class="themeClass"
    >
        <div class="point-picker-actions">
            <button
                type="button"
                class="point-btn"
                :class="{ active: pickMode === 'start' }"
                @click="$emit('pick-start')"
            >
                {{ pickMode === 'start' ? resolvedStartPickingText : resolvedStartLabel }}
            </button>
            <button
                type="button"
                class="point-btn"
                :class="{ active: pickMode === 'end' }"
                @click="$emit('pick-end')"
            >
                {{ pickMode === 'end' ? resolvedEndPickingText : resolvedEndLabel }}
            </button>
        </div>

        <div class="point-coords-grid">
            <div class="coord-card">
                <div class="coord-title">{{ resolvedStartTitle }}</div>

                <!-- 起点关键词搜索 -->
                <div class="search-wrap">
                    <input
                        v-model="startKeyword"
                        type="text"
                        class="search-input"
                        :placeholder="resolvedSearchPlaceholder"
                        @input="onStartSearchInput"
                        @blur="onStartSearchBlur"
                        @keydown.down.prevent="onStartKeyDown($event)"
                        @keydown.up.prevent="onStartKeyUp"
                        @keydown.enter.prevent="onStartKeyEnter"
                    />
                    <div
                        v-if="startSearching"
                        class="search-spinner"
                    ></div>
                    <ul
                        v-if="showStartDropdown"
                        class="search-dropdown"
                    >
                        <li
                            v-for="(item, idx) in startResults"
                            :key="idx"
                            class="search-item"
                            :class="{ highlighted: startHighlightIdx === idx }"
                            @mousedown.prevent="selectStartResult(item)"
                        >
                            <span
                                class="search-item-name"
                                :title="item.display_name"
                            >{{ item.display_name }}</span>
                        </li>
                        <li
                            v-if="!startResults.length && startKeyword.trim()"
                            class="search-item search-item-empty"
                        >
                            {{ t('routing.noResults') }}
                        </li>
                    </ul>
                </div>

                <div
                    v-if="hasStart"
                    class="coord-value"
                >
                    {{ Number(startPoint.lng).toFixed(6) }}, {{ Number(startPoint.lat).toFixed(6) }}
                </div>
                <div
                    v-if="hasStartAddress"
                    class="coord-address"
                >
                    {{ startAddress }}
                </div>
                <div
                    v-else-if="!hasStart"
                    class="coord-empty"
                >
                    {{ t('routing.notSet') }}
                </div>
            </div>

            <div class="coord-card">
                <div class="coord-title">{{ resolvedEndTitle }}</div>

                <!-- 终点关键词搜索 -->
                <div class="search-wrap">
                    <input
                        v-model="endKeyword"
                        type="text"
                        class="search-input"
                        :placeholder="resolvedSearchPlaceholder"
                        @input="onEndSearchInput"
                        @blur="onEndSearchBlur"
                        @keydown.down.prevent="onEndKeyDown($event)"
                        @keydown.up.prevent="onEndKeyUp"
                        @keydown.enter.prevent="onEndKeyEnter"
                    />
                    <div
                        v-if="endSearching"
                        class="search-spinner"
                    ></div>
                    <ul
                        v-if="showEndDropdown"
                        class="search-dropdown"
                    >
                        <li
                            v-for="(item, idx) in endResults"
                            :key="idx"
                            class="search-item"
                            :class="{ highlighted: endHighlightIdx === idx }"
                            @mousedown.prevent="selectEndResult(item)"
                        >
                            <span
                                class="search-item-name"
                                :title="item.display_name"
                            >{{ item.display_name }}</span>
                        </li>
                        <li
                            v-if="!endResults.length && endKeyword.trim()"
                            class="search-item search-item-empty"
                        >
                            {{ t('routing.noResults') }}
                        </li>
                    </ul>
                </div>

                <div
                    v-if="hasEnd"
                    class="coord-value"
                >
                    {{ Number(endPoint.lng).toFixed(6) }}, {{ Number(endPoint.lat).toFixed(6) }}
                </div>
                <div
                    v-if="hasEndAddress"
                    class="coord-address"
                >
                    {{ endAddress }}
                </div>
                <div
                    v-else-if="!hasEnd"
                    class="coord-empty"
                >
                    {{ t('routing.notSet') }}
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts" src="./MapPointPickerCard.ts"></script>

<style scoped>
.point-picker-wrap {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.point-picker-wrap.theme-drive {
    --pp-accent: #2563eb;
    --pp-soft-bg: #eff6ff;
    --pp-soft-border: rgba(37, 99, 235, 0.2);
    --pp-soft-text: #1e40af;
}

.point-picker-wrap.theme-bus {
    --pp-accent: #1f6a3f;
    --pp-soft-bg: #eefcf4;
    --pp-soft-border: rgba(31, 106, 63, 0.2);
    --pp-soft-text: #166534;
}

.point-picker-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.point-btn {
    border: 1px solid var(--pp-soft-border);
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.92);
    color: var(--pp-accent);
    font-size: 13px;
    font-weight: 700;
    padding: 9px 10px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.point-btn:hover {
    background: var(--pp-soft-bg);
    border-color: var(--pp-accent);
}

.point-btn.active {
    background: var(--pp-accent);
    color: #fff;
    border-color: var(--pp-accent);
}

.point-coords-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.coord-card {
    border: 1px solid var(--pp-soft-border);
    border-radius: 9px;
    padding: 9px;
    background: var(--pp-soft-bg);
}

.coord-title {
    font-size: 12px;
    color: var(--pp-soft-text);
}

.search-wrap {
    position: relative;
    margin-top: 6px;
}

.search-input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--pp-soft-border);
    border-radius: 7px;
    padding: 6px 8px;
    font-size: 12px;
    background: #fff;
    color: #1f2937;
    outline: none;
    transition: border-color 0.2s;
}

.search-input:focus {
    border-color: var(--pp-accent);
}

.search-input::placeholder {
    color: #9ca3af;
}

.search-spinner {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 14px;
    height: 14px;
    border: 2px solid var(--pp-soft-border);
    border-top-color: var(--pp-accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
}

@keyframes spin {
    to { transform: translateY(-50%) rotate(360deg); }
}

.search-dropdown {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    z-index: var(--z-float);
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid var(--pp-soft-border);
    border-radius: 7px;
    background: #fff;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
    list-style: none;
    margin: 0;
    padding: 4px 0;
}

.search-item {
    padding: 7px 10px;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    gap: 6px;
    transition: background 0.15s;
}

.search-item:hover,
.search-item.highlighted {
    background: var(--pp-soft-bg);
}

.search-item-name {
    color: #1f2937;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
}

.search-item-empty {
    color: #9ca3af;
    justify-content: center;
}

.coord-value {
    margin-top: 6px;
    margin-top: 6px;
    font-size: 12px;
    font-weight: 700;
    color: #183a2a;
    word-break: break-all;
}

.coord-address {
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.45;
    color: #2d5a43;
    word-break: break-word;
}

.coord-empty {
    margin-top: 6px;
    margin-top: 6px;
    font-size: 12px;
    color: #9aaea0;
}

@media (max-width: 860px) {
    .point-picker-actions,
    .point-coords-grid {
        grid-template-columns: 1fr;
    }
}
</style>


