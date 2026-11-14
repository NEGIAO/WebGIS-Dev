<template>
    <div
        v-if="!headless"
        class="advanced-effects-root"
    >
        <div class="effects-panel">
            <div class="panel-head">
                <span class="panel-title">Cinematic FX</span>
                <button
                    class="panel-btn"
                    @click="toggleChartVisibility"
                >
                    {{ chartVisible ? '隐藏图表' : '显示图表' }}
                </button>
            </div>

            <div class="effect-switches">
                <LilGuiControls
                    title="Effect Parameters"
                    :controls="effectGuiControls"
                    @change="handleEffectGuiChange"
                />
            </div>

            <div
                v-show="chartVisible"
                ref="chartRef"
                class="fx-chart"
            ></div>
        </div>
    </div>
</template>

<script lang="ts" src="./CesiumAdvancedEffects.ts"></script>

<style scoped>
.advanced-effects-root {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 1300;
    pointer-events: none;
}

.effects-panel {
    width: 360px;
    border-radius: 12px;
    border: 1px solid rgba(162, 245, 190, 0.22);
    background: linear-gradient(155deg, rgba(9, 38, 23, 0.82), rgba(20, 71, 44, 0.78));
    box-shadow: 0 14px 28px rgba(3, 17, 10, 0.35);
    color: #ddf8e8;
    backdrop-filter: blur(10px);
    pointer-events: auto;
}

.panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(162, 245, 190, 0.15);
}

.panel-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.3px;
}

.panel-btn {
    border: 1px solid rgba(162, 245, 190, 0.35);
    background: rgba(13, 55, 33, 0.6);
    color: #def8e8;
    border-radius: 8px;
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
}

.panel-btn:hover {
    background: rgba(25, 90, 52, 0.78);
}

.effect-switches {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 14px 16px 12px;
}

.switch-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: rgba(223, 248, 232, 0.95);
}

.switch-item input[type='checkbox'] {
    accent-color: #4ade80;
}

.fx-chart {
    width: calc(100% - 16px);
    height: 200px;
    margin: 0 8px 10px;
}

@media (max-width: 768px) {
    .advanced-effects-root {
        top: 10px;
        right: 10px;
    }

    .effects-panel {
        width: 320px;
    }

    .fx-chart {
        height: 160px;
    }
}
</style>

