import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useAppStore = defineStore('appStore', () => {
    const activePanel = ref('');
    const isSideBarOpen = ref(false);
    const isMobile = ref(false);

    function togglePanel(panelName: string): void {
        const normalizedPanel = String(panelName || '').trim();

        if (!normalizedPanel) {
            activePanel.value = '';
            isSideBarOpen.value = false;
            return;
        }

        if (activePanel.value === normalizedPanel) {
            activePanel.value = '';
            isSideBarOpen.value = false;
            return;
        }

        activePanel.value = normalizedPanel;
        isSideBarOpen.value = true;
    }

    return {
        activePanel,
        isSideBarOpen,
        isMobile,
        togglePanel
    };
});