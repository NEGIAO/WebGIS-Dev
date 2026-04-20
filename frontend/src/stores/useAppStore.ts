import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useAppStore = defineStore('appStore', () => {
    const loading = ref(false);
    const loadingText = ref('');
    const isInitialGisLoadComplete = ref(false);
    
    let loadingTimeoutId: any = null;

    function showLoading(text: string = '') {
        loading.value = true;
        loadingText.value = String(text || '').trim();
        
        // Clear any existing timeout
        if (loadingTimeoutId !== null) {
            clearTimeout(loadingTimeoutId);
        }
        
        // Set 15-second fail-safe timeout: auto-hide loading if still active
        loadingTimeoutId = window.setTimeout(() => {
            if (loading.value) {
                console.warn('[Loading Timeout] Auto-hiding loading overlay after 15s safety threshold.');
                hideLoading();
            }
            loadingTimeoutId = null;
        }, 15000);
    }

    function hideLoading() {
        loading.value = false;
        loadingText.value = '';
        
        // Clear timeout when manually hiding
        if (loadingTimeoutId !== null) {
            clearTimeout(loadingTimeoutId);
            loadingTimeoutId = null;
        }
    }
    
    function markGisInitComplete() {
        isInitialGisLoadComplete.value = true;
    }

    return {
        loading,
        loadingText,
        isInitialGisLoadComplete,
        showLoading,
        hideLoading,
        markGisInitComplete
    };
});
