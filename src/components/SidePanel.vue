<template>
    <aside class="side-panel" v-show="appStore.isSideBarOpen">
        <div class="panel-head">
            <div class="panel-title">{{ panelTitle }}</div>
            <button class="close-btn" @click="closePanel">×</button>
        </div>

        <div class="panel-body">
            <component :is="activePanelComponent" v-bind="activePanelProps" />
        </div>
    </aside>
</template>

<script setup>
import { computed } from 'vue';
import { useAppStore } from '../stores/appStore';
import ChatPanelContent from './ChatPanelContent.vue';
import LayerToolbox from './LayerToolbox.vue';
import RoutePlannerPanel from './RoutePlannerPanel.vue';

const props = defineProps({
    userLayers: {
        type: Array,
        default: () => []
    },
    baseLayers: {
        type: Array,
        default: () => []
    },
    toolboxOverview: {
        type: Object,
        default: () => ({ drawCount: 0, uploadCount: 0, layers: [] })
    },
    uploadProgress: {
        type: Object,
        default: () => ({ phase: 'idle' })
    }
});

const appStore = useAppStore();
const tiandituToken = import.meta.env.VITE_TIANDITU_TK || '4267820f43926eaf808d61dc07269beb';

const panelMap = {
    layer: LayerToolbox,
    ai: ChatPanelContent,
    route: RoutePlannerPanel
};

const panelTitleMap = {
    layer: '图层工具箱',
    ai: 'AI 助手',
    route: '路线规划'
};

const activePanelComponent = computed(() => panelMap[appStore.activePanel] || ChatPanelContent);

const activePanelProps = computed(() => {
    if (appStore.activePanel === 'layer') {
        return {
            userLayers: props.userLayers,
            baseLayers: props.baseLayers,
            overview: props.toolboxOverview,
            uploadProgress: props.uploadProgress
        };
    }

    if (appStore.activePanel === 'route') {
        return {
            token: tiandituToken
        };
    }

    return {};
});

const panelTitle = computed(() => panelTitleMap[appStore.activePanel] || '业务面板');

function closePanel() {
    appStore.togglePanel(appStore.activePanel);
}
</script>

<style scoped>
.side-panel {
    width: 360px;
    height: 100%;
    background: #ffffff;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: -6px 0 18px rgba(15, 23, 42, 0.16);
    display: flex;
    flex-direction: column;
}

.panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.1);
    background: #f8fafc;
}

.panel-title {
    font-size: 14px;
    font-weight: 700;
    color: #111827;
}

.close-btn {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 6px;
    background: rgba(17, 24, 39, 0.08);
    color: #111827;
    font-size: 18px;
    cursor: pointer;
}

.close-btn:hover {
    background: rgba(17, 24, 39, 0.14);
}

.panel-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
}

@media (max-width: 900px) {
    .side-panel {
        width: 100%;
        border-radius: 12px 12px 0 0;
        max-height: 54vh;
    }
}
</style>
