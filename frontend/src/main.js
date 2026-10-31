import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useMessage } from '@common/shell/useMessage';
import { loadLocaleMessages } from '@common/app/useLocale';
// 深导入：禁止从 './stores' 聚合桶取 store。
// 该桶以 `export *` 汇总 14 个 store（含 OL / chat / data-import 域），
// `export *` 对含副作用的模块无法被 tree-shake，会把整张 store 图拖进入口 chunk。
import { useUserPreferencesStore } from '@common/user/stores/useUserPreferencesStore';

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
