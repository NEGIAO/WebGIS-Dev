import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useMessage } from '@common/shell/useMessage';
import { loadLocaleMessages } from '@common/app/useLocale';
import { useUserPreferencesStore } from './stores';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

// 尽早拉完整语言包，避免登录页等首屏在 preferences 网络返回前泄漏 auth.* key
void loadLocaleMessages();

const userPreferencesStore = useUserPreferencesStore(pinia);
void userPreferencesStore.bootstrap();

// Mount immediately so RouterView and GlobalLoading can render during async guards.
app.mount('#app');

// Keep message host initialization after router ready.
router.isReady().finally(() => {
    queueMicrotask(() => {
        const message = useMessage();
        message.ensureMessageHost('top-center');
    });
});
