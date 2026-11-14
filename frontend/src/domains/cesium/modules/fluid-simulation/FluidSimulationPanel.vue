<template>
    <div
        v-if="!headless"
        class="fluid-root"
    >
        <div class="fluid-panel">
            <div class="panel-head">
                <span class="panel-title">水体流体</span>
                <button
                    class="panel-close"
                    title="关闭"
                    @click="closePanel"
                >
                    ×
                </button>
            </div>

            <div class="panel-actions">
                <button
                    class="action-btn primary"
                    :class="{ active: isPicking }"
                    @click="startPickHeightMap"
                >
                    {{ isPicking ? '等待选点' : '捕捉高度图' }}
                </button>
                <button
                    class="action-btn"
                    :disabled="!hasFluid && !isPicking"
                    @click="clearFluid"
                >
                    清除
                </button>
            </div>

            <div
                v-if="selectedText"
                class="selected-text"
            >
                {{ selectedText }}
            </div>

            <LilGuiControls
                class="param-list"
                title="Fluid Parameters"
                :controls="fluidGuiControls"
                @change="handleFluidGuiChange"
            />
        </div>
    </div>
</template>

<script lang="ts" src="./FluidSimulationPanel.ts"></script>

<style scoped>
.fluid-root {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 1250;
    pointer-events: none;
}

.fluid-panel {
    width: 360px;
    border: 1px solid rgba(148, 210, 255, 0.32);
    border-radius: 8px;
    background: rgba(9, 27, 42, 0.86);
    color: #e8f6ff;
    box-shadow: 0 12px 28px rgba(2, 10, 18, 0.34);
    backdrop-filter: blur(10px);
    pointer-events: auto;
}

.panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(148, 210, 255, 0.18);
}

.panel-title {
    font-size: 13px;
    font-weight: 700;
}

.panel-close {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: #e8f6ff;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
}

.panel-close:hover {
    background: rgba(255, 255, 255, 0.12);
}

.panel-actions {
    display: flex;
    gap: 10px;
    padding: 12px 14px 4px;
}

.action-btn {
    height: 32px;
    border: 1px solid rgba(148, 210, 255, 0.36);
    border-radius: 8px;
    background: rgba(12, 46, 70, 0.72);
    color: #e8f6ff;
    padding: 0 14px;
    cursor: pointer;
}

.action-btn.primary {
    background: rgba(33, 118, 172, 0.82);
}

.action-btn.active {
    background: rgba(230, 164, 55, 0.88);
}

.action-btn:disabled {
    cursor: not-allowed;
    opacity: 0.48;
}

.selected-text {
    padding: 6px 14px 2px;
    color: rgba(232, 246, 255, 0.82);
    font-size: 12px;
}

.param-list {
    display: grid;
    gap: 12px;
    padding: 12px 14px 14px;
}

@media (max-width: 768px) {
    .fluid-root {
        top: 10px;
        left: 10px;
        right: 10px;
    }

    .fluid-panel {
        width: 100%;
    }
}
</style>

