<template>
    <Transition name="guide-slide">
        <div
            v-if="visible"
            class="player-guide"
        >
            <!-- 状态指示器 -->
            <div class="guide-pill">
                <span class="pill-dot" :class="{ fp: isFirstPerson }" />
                <span class="pill-label">{{ isFirstPerson ? '第一人称' : '第三人称' }}</span>
                <span v-if="isFlying" class="pill-fly"><Plane :size="12" /></span>
                <button class="pill-close" title="关闭提示" @click="$emit('close')"><X :size="14" /></button>
            </div>
            <!-- 键位提示条 -->
            <div class="guide-keys">
                <span class="key-group">
                    <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
                    <em>移动</em>
                </span>
                <span class="key-sep" />
                <span class="key-group">
                    <kbd>⇧</kbd><em>跑</em>
                    <kbd>␣</kbd><em>跳</em>
                </span>
                <span class="key-sep" />
                <span class="key-group">
                    <kbd>V</kbd><em>视角</em>
                    <kbd>F</kbd><em>飞行</em>
                </span>
                <span class="key-sep" />
                <span class="key-group">
                    <span class="key-mouse"><Mouse :size="14" /></span><em>旋转</em>
                </span>
            </div>
        </div>
    </Transition>
</template>

<script setup>
import { Plane, Mouse, X } from '@lucide/vue';
defineProps({
    visible: { type: Boolean, default: false },
    isFirstPerson: { type: Boolean, default: false },
    isFlying: { type: Boolean, default: false },
});
defineEmits(['close']);
</script>

<style scoped>
.player-guide {
    position: fixed;
    right: 16px;
    bottom: 86px;
    z-index: calc(var(--z-toast) - 1);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    max-width: calc(100vw - 32px);
    pointer-events: none;
}

/* 状态胶囊 */
.guide-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.3);
    border-radius: 20px;
    font-size: 12px;
    color: var(--brand-primary-dark);
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.12);
    pointer-events: auto;
}

.pill-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--brand-primary);
    box-shadow: 0 0 6px rgba(var(--brand-primary-rgb), 0.55);
}
.pill-dot.fp {
    background: var(--brand-accent);
    box-shadow: 0 0 6px rgba(var(--brand-accent-rgb), 0.55);
}

.pill-label {
    font-weight: 500;
    letter-spacing: 0.3px;
}

.pill-fly {
    color: var(--warning);
    font-size: 13px;
}

.pill-close {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 12px;
    padding: 0 2px;
    line-height: 1;
    margin-left: 2px;
    pointer-events: auto;
}
.pill-close:hover {
    color: var(--brand-primary);
}

/* 键位提示条 */
.guide-keys {
    display: inline-flex;
    align-items: center;
    gap: 0;
    padding: 5px 12px;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.24);
    border-radius: 8px;
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.1);
    pointer-events: auto;
}

.key-group {
    display: inline-flex;
    align-items: center;
    gap: 3px;
}

.key-sep {
    width: 1px;
    height: 14px;
    background: rgba(var(--brand-primary-rgb), 0.22);
    margin: 0 8px;
}

kbd {
    display: inline-block;
    min-width: 18px;
    padding: 1px 5px;
    font-family: inherit;
    font-size: 10px;
    font-weight: 700;
    text-align: center;
    color: var(--brand-primary-dark);
    background: rgba(var(--brand-primary-rgb), 0.08);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.28);
    border-radius: 3px;
    line-height: 1.5;
}

.key-mouse {
    font-size: 12px;
}

em {
    font-style: normal;
    font-size: 10px;
    color: var(--text-secondary);
    margin-left: 1px;
    margin-right: 4px;
}

/* 过渡 */
.guide-slide-enter-active,
.guide-slide-leave-active {
    transition: opacity 0.3s, transform 0.3s;
}
.guide-slide-enter-from,
.guide-slide-leave-to {
    opacity: 0;
    transform: translateX(16px);
}

@media (max-width: 767px) {
    .player-guide {
        right: 12px;
        bottom: 142px;
        max-width: calc(100vw - 24px);
    }

    .guide-keys {
        flex-wrap: wrap;
        justify-content: flex-end;
        row-gap: 4px;
        padding: 6px 9px;
    }
}
</style>
