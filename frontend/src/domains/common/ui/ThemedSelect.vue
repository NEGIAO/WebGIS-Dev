<template>
    <div ref="root" class="themed-select" :class="{ open, compact, disabled }">
        <button
            class="themed-select-trigger"
            type="button"
            role="combobox"
            :disabled="disabled"
            :aria-expanded="open"
            :aria-controls="menuId"
            :aria-activedescendant="activeOptionId"
            :aria-label="ariaLabel || undefined"
            @click="toggleMenu"
            @keydown="onTriggerKeydown"
        >
            <span class="themed-select-value">{{ selectedLabel }}</span>
            <ChevronDown :size="14" class="themed-select-chevron" />
        </button>
        <div v-if="open" :id="menuId" class="themed-select-menu" role="listbox">
            <button
                v-for="(option, index) in options"
                :id="optionId(index)"
                :key="String(option.value)"
                class="themed-select-option"
                :class="{ selected: option.value === modelValue, active: index === activeIndex }"
                type="button"
                role="option"
                tabindex="-1"
                :aria-selected="option.value === modelValue"
                @click="choose(option)"
                @mouseenter="activeIndex = index"
            >
                {{ option.label }}
            </button>
        </div>
    </div>
</template>

<script lang="ts" src="./ThemedSelect.ts"></script>

<style scoped>
.themed-select {
    position: relative;
    min-width: 140px;
    width: 100%;
}
.themed-select.compact {
    min-width: 92px;
    width: auto;
}
.themed-select-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-height: 32px;
    padding: 5px 10px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 12px;
    cursor: pointer;
}
.themed-select-trigger:hover:not(:disabled),
.themed-select.open .themed-select-trigger {
    border-color: rgba(var(--brand-primary-rgb), 0.5);
}
.themed-select-trigger:disabled {
    cursor: not-allowed;
    opacity: 0.55;
}
.themed-select-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.themed-select-chevron {
    flex: none;
    color: var(--text-secondary);
    transition: transform 0.15s ease;
}
.themed-select.open .themed-select-chevron {
    transform: rotate(180deg);
}
.themed-select-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 60;
    max-height: 260px;
    overflow-y: auto;
    padding: 4px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    background: var(--bg-primary);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
}
.themed-select-option {
    display: block;
    width: 100%;
    padding: 7px 9px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-primary);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
}
.themed-select-option:hover,
.themed-select-option.selected,
.themed-select-option.active {
    background: rgba(var(--brand-primary-rgb), 0.1);
    color: var(--brand-primary);
}
.themed-select-option.active {
    background: rgba(var(--brand-primary-rgb), 0.16);
}

/* 触屏档：可点击目标 ≥40px（判据用触屏能力，不用宽度断点） */
@media (pointer: coarse) {
    .themed-select-trigger {
        min-height: 40px;
    }
    .themed-select-option {
        padding: 11px 10px;
    }
}
</style>
