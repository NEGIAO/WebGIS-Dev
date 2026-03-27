<template>
    <div class="route-panel">
        <div class="route-tabs">
            <button class="tab" :class="{ active: mode === 'bus' }" @click="mode = 'bus'">公交</button>
            <button class="tab" :class="{ active: mode === 'drive' }" @click="mode = 'drive'">驾车</button>
        </div>

        <BusPlannerPanel
            v-if="mode === 'bus'"
            :token="token"
        />

        <DrivingPlannerPanel
            v-else
            :token="token"
        />
    </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import BusPlannerPanel from './BusPlannerPanel.vue';
import DrivingPlannerPanel from './DrivingPlannerPanel.vue';
import { useRouteStore } from '../stores/routeStore';

defineProps({
    token: {
        type: String,
        default: ''
    }
});

const routeStore = useRouteStore();
const mode = ref(routeStore.mode === 'drive' ? 'drive' : 'bus');

watch(
    () => routeStore.mode,
    (nextMode) => {
        const normalized = nextMode === 'drive' ? 'drive' : 'bus';
        if (mode.value !== normalized) {
            mode.value = normalized;
        }
    }
);

watch(
    () => mode.value,
    (nextMode) => {
        routeStore.setMode(nextMode === 'drive' ? 'drive' : 'bus');
    },
    { immediate: true }
);
</script>

<style scoped>
.route-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.route-tabs {
    display: flex;
    gap: 8px;
    padding: 10px 10px 0;
}

.tab {
    border: 1px solid rgba(17, 24, 39, 0.15);
    background: #ffffff;
    color: #111827;
    border-radius: 8px;
    padding: 6px 10px;
    cursor: pointer;
}

.tab.active {
    background: #2563eb;
    color: #fff;
    border-color: #2563eb;
}
</style>
