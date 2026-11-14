<template>
    <div
        ref="containerRef"
        class="lil-gui-host"
    ></div>
</template>

<script lang="ts" src="./LilGuiControls.ts"></script>

<style scoped>
.lil-gui-host {
    min-width: 0;
}

.lil-gui-host :deep(.cesium-lil-gui) {
    width: 100% !important;
    overflow: hidden;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.92);
    color: var(--text-primary);
    --background-color: rgba(255, 255, 255, 0.92);
    --title-background-color: rgba(var(--brand-primary-rgb), 0.1);
    --title-text-color: var(--text-primary);
    --text-color: var(--text-primary);
    --widget-color: rgba(0, 0, 0, 0.05);
    --hover-color: rgba(var(--brand-primary-rgb), 0.1);
    --focus-color: rgba(var(--brand-primary-rgb), 0.22);
    --number-color: var(--text-primary);
    --string-color: var(--text-primary);
    --font-size: 11px;
    --input-font-size: 11px;
    --widget-height: 24px;
    --title-height: 30px;
    --name-width: 46%;
    --slider-input-width: 31%;
    --color-input-width: 31%;
    --widget-border-radius: 6px;
}

.lil-gui-host :deep(.cesium-lil-gui > .lil-title) {
    /* 视觉隐藏 lil-gui 自带标题（避免与 module-head 重复），保留 DOM 以维持折叠逻辑 */
    height: 0;
    min-height: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    overflow: hidden;
    border: none !important;
    font-size: 0;
    line-height: 0;
}

.lil-gui-host :deep(.cesium-lil-gui .lil-children) {
    padding: 6px;
}

.lil-gui-host :deep(.cesium-lil-gui .lil-controller) {
    min-height: 30px;
    border-radius: 7px;
}

.lil-gui-host :deep(.cesium-lil-gui .lil-name) {
    overflow: hidden;
    color: rgba(31, 41, 55, 0.85);
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.lil-gui-host :deep(.cesium-lil-gui input),
.lil-gui-host :deep(.cesium-lil-gui select) {
    color: #1f2937;
}

/* ===== 模块内嵌下拉 option 弹出层（lil-gui 动态注入的 .lil-selector） =====
   lil-gui select 框底为 --widget-color 半透明冰蓝、显示正常，但其展开的 <option>
   弹出层为浏览器原生白底，与继承的浅色字叠加成「白底白字」不可读；
   显式接管 option 配色 + color-scheme 暗色化弹层框架，与工具面板暗色观感对齐。
   :deep() 编译后 data-v 属性锚定在 .lil-gui-host 宿主上，对运行时注入 DOM 依然命中。 */
.lil-gui-host :deep(.cesium-lil-gui select) {
    color-scheme: light;
}

.lil-gui-host :deep(.cesium-lil-gui select option) {
    background: var(--ctp-option-bg);
    color: var(--ctp-text);
}

.lil-gui-host :deep(.cesium-lil-gui select option:hover) {
    background: rgba(var(--ctp-active-rgb), 0.92);
    color: var(--ctp-title);
}

.lil-gui-host :deep(.cesium-lil-gui select option:checked) {
    background: rgba(var(--ctp-active-deep-rgb), 0.92);
    color: var(--ctp-mint-mark);
}

.lil-gui-host :deep(.cesium-lil-gui .lil-controller.lil-disabled) {
    opacity: 0.46;
}
</style>
