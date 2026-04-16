import { getActivePinia } from 'pinia';
import { useAppStore } from '../stores';

function resolveAppStore() {
    if (!getActivePinia()) return null;
    return useAppStore();
}

export function showLoading(text = '') {
    const appStore = resolveAppStore();
    if (!appStore) return;
    appStore.showLoading(text);
}

export function hideLoading() {
    const appStore = resolveAppStore();
    if (!appStore) return;
    appStore.hideLoading();
}
