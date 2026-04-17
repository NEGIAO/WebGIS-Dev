import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useAppStore = defineStore('appStore', () => {
    const loading = ref(false);
    const loadingText = ref('');

    function showLoading(text: string = '') {
        loading.value = true;
        loadingText.value = String(text || '').trim();
    }

    function hideLoading() {
        loading.value = false;
        loadingText.value = '';
    }

    return {
        loading,
        loadingText,
        showLoading,
        hideLoading
    };
});
