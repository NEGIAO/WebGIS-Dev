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
    background: linear-gradient(165deg, rgba(249, 253, 250, 0.95), rgba(239, 249, 243, 0.9));
    border: 1px solid rgba(21, 94, 54, 0.2);
    border-radius: 14px;
    overflow: hidden;
    box-shadow: -8px 0 22px rgba(8, 35, 25, 0.2);
    backdrop-filter: blur(10px);
    display: flex;
    flex-direction: column;
}

.panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(21, 94, 54, 0.14);
    background: linear-gradient(180deg, rgba(230, 248, 237, 0.96), rgba(244, 251, 247, 0.9));
}

.panel-title {
    font-size: 14px;
    font-weight: 700;
    color: #113725;
}

.close-btn {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 6px;
    background: rgba(21, 94, 54, 0.1);
    color: #113725;
    font-size: 18px;
    cursor: pointer;
}

.close-btn:hover {
    background: rgba(21, 94, 54, 0.16);
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
