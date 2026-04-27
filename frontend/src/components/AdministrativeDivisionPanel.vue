<template>
    <transition name="district-panel-fade">
        <section v-if="visible" class="district-panel" aria-label="行政区划面板">
            <header class="panel-header">
                <h3 class="panel-title">行政区划</h3>
                <button class="close-button" type="button" aria-label="关闭行政区划面板" @click="emit('close')">×</button>
            </header>

            <div class="panel-search-wrap">
                <input v-model.trim="searchKeyword" class="panel-search" type="text" placeholder="输入省市区名称或 adcode"
                    autocomplete="off" />
            </div>

            <div class="panel-meta">
                <span v-if="loading">行政区数据加载中...</span>
                <span v-else-if="loadError">行政区数据加载失败</span>
                <span v-else>节点总数 {{ totalNodeCount }}，匹配 {{ matchedNodeCount }}</span>
            </div>

            <div class="panel-body">
                <div v-if="loading" class="panel-loading">正在读取 adcode 树...</div>

                <div v-else-if="loadError" class="panel-error">
                    <p>{{ loadError }}</p>
                    <button type="button" class="retry-button" @click="loadTreeData(true)">重试</button>
                </div>

                <template v-else>
                    <ul v-if="filteredTreeData.length" class="tree-root">
                        <AdministrativeDivisionTreeNode v-for="node in filteredTreeData"
                            :key="`${node.value}_${node.label}`" :node="node" :level="0" :auto-expand="autoExpand"
                            :selected-adcode="selectedAdcode" @select="handleNodeSelect" />
                    </ul>
                    <div v-else class="panel-empty">没有匹配到行政区节点</div>
                </template>
            </div>
        </section>
    </transition>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import AdministrativeDivisionTreeNode from './AdministrativeDivisionTreeNode.vue';

const props = defineProps({
    visible: {
        type: Boolean,
        default: false
    }
});

const emit = defineEmits(['close', 'select']);

const BASE_URL = import.meta.env.BASE_URL || '/';
const NORMALIZED_BASE_URL = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;

const loading = ref(false);
const loadError = ref('');
const hasLoaded = ref(false);
const treeData = ref([]);
const searchKeyword = ref('');
const selectedAdcode = ref('');

function normalizeTreeNodes(inputNodes = []) {
    if (!Array.isArray(inputNodes)) return [];

    return inputNodes
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
            const label = String(item.label || '').trim() || '未命名行政区';
            const value = String(item.value || '').trim();
            const children = normalizeTreeNodes(item.children);
            return {
                label,
                value,
                children
            };
        })
        .filter((node) => Boolean(node.value) || node.children.length > 0);
}

function countTreeNodes(nodes = []) {
    let total = 0;
    for (const node of nodes) {
        total += 1;
        if (Array.isArray(node.children) && node.children.length) {
            total += countTreeNodes(node.children);
        }
    }
    return total;
}

function filterTreeNodes(nodes = [], keyword = '') {
    const query = String(keyword || '').trim().toLowerCase();
    if (!query) return nodes;

    const result = [];
    nodes.forEach((node) => {
        const label = String(node.label || '').toLowerCase();
        const value = String(node.value || '').toLowerCase();
        const childMatches = filterTreeNodes(node.children || [], query);
        const currentMatch = label.includes(query) || value.includes(query);

        if (currentMatch || childMatches.length > 0) {
            result.push({
                ...node,
                children: childMatches
            });
        }
    });

    return result;
}

async function tryLoadTreeFile(fileName) {
    const url = `${NORMALIZED_BASE_URL}${String(fileName || '').replace(/^\/+/, '')}`;
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
        throw new Error(`请求失败（${response.status}）: ${fileName}`);
    }

    const payload = await response.json();
    const normalized = normalizeTreeNodes(payload);
    if (!normalized.length) {
        throw new Error(`文件存在但内容为空：${fileName}`);
    }

    return normalized;
}

/**
 * 按顺序尝试加载 adcode.json，兼容不同数据命名。
 */
async function loadTreeData(forceReload = false) {
    if (loading.value) return;
    if (hasLoaded.value && !forceReload) return;

    loading.value = true;
    loadError.value = '';

    const candidates = ['adcode.json'];

    try {
        let loaded = [];

        for (const fileName of candidates) {
            try {
                loaded = await tryLoadTreeFile(fileName);
                break;
            } catch {
                loaded = [];
            }
        }

        if (!loaded.length) {
            throw new Error('未能加载 adcode.json，请检查 public 目录数据文件。');
        }

        treeData.value = loaded;
        hasLoaded.value = true;
    } catch (error) {
        const detail = String(error?.message || '').trim();
        loadError.value = detail || '行政区划树加载失败。';
    } finally {
        loading.value = false;
    }
}

const keywordLower = computed(() => String(searchKeyword.value || '').trim().toLowerCase());
const filteredTreeData = computed(() => filterTreeNodes(treeData.value, keywordLower.value));
const totalNodeCount = computed(() => countTreeNodes(treeData.value));
const matchedNodeCount = computed(() => countTreeNodes(filteredTreeData.value));
const autoExpand = computed(() => false); // 默认不自动展开，后续可根据需求调整为搜索时自动展开匹配节点

function handleNodeSelect(payload) {
    const adcode = String(payload?.value || '').trim();
    if (!adcode) return;

    selectedAdcode.value = adcode;
    emit('select', {
        label: String(payload?.label || '').trim(),
        value: adcode
    });
}

watch(
    () => props.visible,
    (nextVisible) => {
        if (!nextVisible) return;
        void loadTreeData();
    },
    { immediate: true }
);
</script>

<style scoped>
.district-panel {
    position: absolute;
    left: 66px;
    top: 12%;
    bottom: 0;
    width: 340px;

    height: 80%;

    background: rgba(12, 45, 28, 0.88);
    border: 1px solid rgba(92, 198, 150, 0.5);
    box-shadow: 6px 0 22px rgba(0, 0, 0, 0.25);

    border-radius: 0 14px 14px 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 1060;
}

.panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 12px 8px;
    /* 底部边框：柔和绿色 */
    border-bottom: 1px solid rgba(104, 192, 144, 0.32);
}

.panel-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    /* 标题：亮绿色 */
    color: #edfff3;
}

.close-button {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 6px;
    /* 关闭按钮背景：暗绿 */
    background: rgba(110, 168, 134, 0.22);
    color: #e0f7e9;
    cursor: pointer;
}

.close-button:hover {
    /* 悬停：暗红绿色（更高级） */
    background: rgba(188, 70, 70, 0.58);
}

.panel-search-wrap {
    padding: 10px 12px 0;
}

.panel-search {
    width: 100%;
    height: 34px;
    /* 输入框边框：青绿色 */
    border: 1px solid rgba(100, 190, 142, 0.52);
    /* 输入框背景：深绿 */
    background: rgba(10, 38, 20, 0.85);
    color: #d8f9e6;
    border-radius: 8px;
    padding: 0 10px;
    outline: none;
    font-size: 13px;
}

.panel-search:focus {
    /* 聚焦高亮：亮青绿 */
    border-color: rgba(68, 204, 128, 0.92);
}

.panel-meta {
    min-height: 26px;
    padding: 8px 12px 6px;
    /* 辅助文字：浅绿 */
    color: #b1d9c2;
    font-size: 12px;
}

.panel-body {
    flex: 1;
    overflow: auto;
    padding: 0 10px 12px;
}

.panel-loading,
.panel-empty,
.panel-error {
    margin-top: 12px;
    color: #c1e6d2;
    font-size: 13px;
}

.panel-error p {
    margin: 0 0 10px;
    line-height: 1.5;
}

.retry-button {
    border: 1px solid rgba(106, 196, 148, 0.55);
    background: rgba(18, 66, 38, 0.5);
    color: #e0ffe9;
    border-radius: 8px;
    height: 30px;
    padding: 0 12px;
    cursor: pointer;
}

.retry-button:hover {
    background: rgba(22, 92, 48, 0.65);
}

.tree-root {
    margin: 0;
    padding: 0;
}

.district-panel-fade-enter-active,
.district-panel-fade-leave-active {
    transition: opacity 0.2s ease;
}

.district-panel-fade-enter-from,
.district-panel-fade-leave-to {
    opacity: 0;
}

@media (max-width: 900px) {
    .district-panel {
        left: 0;
        width: min(82vw, 340px);
        border-radius: 0 12px 12px 0;
    }
}
</style>
