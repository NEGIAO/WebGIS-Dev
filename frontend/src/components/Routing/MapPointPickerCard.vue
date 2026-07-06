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
                {{ pickMode === 'start' ? startPickingText : startLabel }}
            </button>
            <button
                type="button"
                class="point-btn"
                :class="{ active: pickMode === 'end' }"
                @click="$emit('pick-end')"
            >
                {{ pickMode === 'end' ? endPickingText : endLabel }}
            </button>
        </div>

        <div class="point-coords-grid">
            <div class="coord-card">
                <div class="coord-title">{{ startTitle }}</div>

                <!-- 起点关键词搜索 -->
                <div class="search-wrap">
                    <input
                        v-model="startKeyword"
                        type="text"
                        class="search-input"
                        :placeholder="searchPlaceholder"
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
                            <span class="search-item-coord">{{ item.lon?.toFixed(4) }}, {{ item.lat?.toFixed(4) }}</span>
                        </li>
                        <li
                            v-if="!startResults.length && startKeyword.trim()"
                            class="search-item search-item-empty"
                        >
                            暂无结果
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
                    未设置
                </div>
            </div>

            <div class="coord-card">
                <div class="coord-title">{{ endTitle }}</div>

                <!-- 终点关键词搜索 -->
                <div class="search-wrap">
                    <input
                        v-model="endKeyword"
                        type="text"
                        class="search-input"
                        :placeholder="searchPlaceholder"
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
                            <span class="search-item-coord">{{ item.lon?.toFixed(4) }}, {{ item.lat?.toFixed(4) }}</span>
                        </li>
                        <li
                            v-if="!endResults.length && endKeyword.trim()"
                            class="search-item search-item-empty"
                        >
                            暂无结果
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
                    未设置
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { fetchLocationResultsByService } from '../../api/locationSearch';

const props = defineProps({
    pickMode: {
        type: String,
        default: '',
    },
    startPoint: {
        type: Object,
        default: null,
    },
    endPoint: {
        type: Object,
        default: null,
    },
    startAddress: {
        type: String,
        default: '',
    },
    endAddress: {
        type: String,
        default: '',
    },
    startLabel: {
        type: String,
        default: '设置起点（地图选择）',
    },
    endLabel: {
        type: String,
        default: '设置终点（地图选择）',
    },
    startPickingText: {
        type: String,
        default: '请在地图单击起点...',
    },
    endPickingText: {
        type: String,
        default: '请在地图单击终点...',
    },
    startTitle: {
        type: String,
        default: '起点坐标',
    },
    endTitle: {
        type: String,
        default: '终点坐标',
    },
    theme: {
        type: String,
        default: 'bus',
    },
    tiandituTk: {
        type: String,
        default: '',
    },
    searchPlaceholder: {
        type: String,
        default: '搜索地点名称...',
    },
});

const emit = defineEmits(['pick-start', 'pick-end', 'select-start-result', 'select-end-result']);

function isPointValid(point) {
    return Number.isFinite(Number(point?.lng)) && Number.isFinite(Number(point?.lat));
}

const hasStart = computed(() => isPointValid(props.startPoint));
const hasEnd = computed(() => isPointValid(props.endPoint));
const hasStartAddress = computed(() => Boolean(String(props.startAddress || '').trim()));
const hasEndAddress = computed(() => Boolean(String(props.endAddress || '').trim()));
const themeClass = computed(() => (props.theme === 'drive' ? 'theme-drive' : 'theme-bus'));

// ---- 起点搜索 ----
const startKeyword = ref('');
const startResults = ref([]);
const startSearching = ref(false);
const showStartDropdown = ref(false);
const startHighlightIdx = ref(-1);
let startSearchTimer = null;
let startAbort = null;

async function doStartSearch() {
    const kw = startKeyword.value.trim();
    if (!kw) {
        startResults.value = [];
        showStartDropdown.value = false;
        return;
    }
    // 中断前一个请求，避免乱序覆盖
    if (startAbort) startAbort.abort();
    startAbort = new AbortController();

    startSearching.value = true;
    try {
        const result = await fetchLocationResultsByService({
            service: 'tianditu',
            keywords: kw,
            page: 1,
            pageSize: 10,
            tiandituTk: props.tiandituTk,
            signal: startAbort.signal,
        });
        startResults.value = result.items || [];
        showStartDropdown.value = true;
    } catch (e) {
        if (e?.name === 'AbortError') return;
        startResults.value = [];
    } finally {
        startSearching.value = false;
    }
}

function onStartSearchInput() {
    clearTimeout(startSearchTimer);
    // 新输入时中断还在飞行中的请求
    if (startAbort) startAbort.abort();
    startHighlightIdx.value = -1;
    startSearchTimer = setTimeout(doStartSearch, 400);
}

function onStartSearchBlur() {
    // 延迟隐藏下拉，让 mousedown 有机会触发
    setTimeout(() => {
        if (startHighlightIdx.value < 0) showStartDropdown.value = false;
    }, 200);
}

function selectStartResult(item) {
    if (!item) return;
    showStartDropdown.value = false;
    startKeyword.value = item.display_name;
    emit('select-start-result', {
        lng: item.lon,
        lat: item.lat,
        address: item.display_name,
    });
}

function onStartKeyDown(e) {
    if (!showStartDropdown.value || !startResults.value.length) return;
    e.preventDefault();
    const next = startHighlightIdx.value + 1;
    startHighlightIdx.value = next >= startResults.value.length ? 0 : next;
}

function onStartKeyUp() {
    if (!showStartDropdown.value || !startResults.value.length) return;
    const prev = startHighlightIdx.value - 1;
    startHighlightIdx.value = prev < 0 ? startResults.value.length - 1 : prev;
}

function onStartKeyEnter() {
    if (startHighlightIdx.value >= 0 && startResults.value[startHighlightIdx.value]) {
        selectStartResult(startResults.value[startHighlightIdx.value]);
    } else if (startResults.value.length === 1) {
        selectStartResult(startResults.value[0]);
    }
}

// ---- 终点搜索 ----
const endKeyword = ref('');
const endResults = ref([]);
const endSearching = ref(false);
const showEndDropdown = ref(false);
const endHighlightIdx = ref(-1);
let endSearchTimer = null;
let endAbort = null;

async function doEndSearch() {
    const kw = endKeyword.value.trim();
    if (!kw) {
        endResults.value = [];
        showEndDropdown.value = false;
        return;
    }
    // 中断前一个请求，避免乱序覆盖
    if (endAbort) endAbort.abort();
    endAbort = new AbortController();

    endSearching.value = true;
    try {
        const result = await fetchLocationResultsByService({
            service: 'tianditu',
            keywords: kw,
            page: 1,
            pageSize: 10,
            tiandituTk: props.tiandituTk,
            signal: endAbort.signal,
        });
        endResults.value = result.items || [];
        showEndDropdown.value = true;
    } catch (e) {
        if (e?.name === 'AbortError') return;
        endResults.value = [];
    } finally {
        endSearching.value = false;
    }
}

function onEndSearchInput() {
    clearTimeout(endSearchTimer);
    // 新输入时中断还在飞行中的请求
    if (endAbort) endAbort.abort();
    endHighlightIdx.value = -1;
    endSearchTimer = setTimeout(doEndSearch, 400);
}

function onEndSearchBlur() {
    setTimeout(() => {
        if (endHighlightIdx.value < 0) showEndDropdown.value = false;
    }, 200);
}

function selectEndResult(item) {
    if (!item) return;
    showEndDropdown.value = false;
    endKeyword.value = item.display_name;
    emit('select-end-result', {
        lng: item.lon,
        lat: item.lat,
        address: item.display_name,
    });
}

function onEndKeyDown(e) {
    if (!showEndDropdown.value || !endResults.value.length) return;
    e.preventDefault();
    const next = endHighlightIdx.value + 1;
    endHighlightIdx.value = next >= endResults.value.length ? 0 : next;
}

function onEndKeyUp() {
    if (!showEndDropdown.value || !endResults.value.length) return;
    const prev = endHighlightIdx.value - 1;
    endHighlightIdx.value = prev < 0 ? endResults.value.length - 1 : prev;
}

function onEndKeyEnter() {
    if (endHighlightIdx.value >= 0 && endResults.value[endHighlightIdx.value]) {
        selectEndResult(endResults.value[endHighlightIdx.value]);
    } else if (endResults.value.length === 1) {
        selectEndResult(endResults.value[0]);
    }
}
</script>

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
    z-index: 100;
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

.search-item-coord {
    color: #6b7280;
    font-size: 11px;
    white-space: nowrap;
    flex-shrink: 0;
}

.search-item-empty {
    color: #9ca3af;
    justify-content: center;
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
    z-index: 100;
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

.search-item-coord {
    color: #6b7280;
    font-size: 11px;
    white-space: nowrap;
    flex-shrink: 0;
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
