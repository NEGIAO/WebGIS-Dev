/**
 * 主题状态管理
 * 支持绿色/蓝色主题切换，通过 data-theme 属性驱动 CSS 变量
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';

const THEME_STORAGE_KEY = 'webgis_theme_v1';

const THEMES: Record<string, string> = {
    default: '默认绿',
    blue: '海洋蓝',
};

export const useThemeStore = defineStore('themeStore', () => {
    const theme = ref('default');

    /** 从 localStorage 恢复主题 */
    function init() {
        try {
            const saved = localStorage.getItem(THEME_STORAGE_KEY);
            if (saved && THEMES[saved]) {
                theme.value = saved;
            }
        } catch {
            // ignore
        }
        applyTheme();
    }

    /** 切换主题 */
    function setTheme(newTheme) {
        if (!THEMES[newTheme]) return;
        theme.value = newTheme;
        applyTheme();
        try {
            localStorage.setItem(THEME_STORAGE_KEY, newTheme);
        } catch {
            // ignore
        }
    }

    /** 将主题应用到 DOM */
    function applyTheme() {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        if (theme.value === 'default') {
            root.removeAttribute('data-theme');
        } else {
            root.setAttribute('data-theme', theme.value);
        }
    }

    return {
        theme,
        init,
        setTheme,
        THEMES,
    };
});
