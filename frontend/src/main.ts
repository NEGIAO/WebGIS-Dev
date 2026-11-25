import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useMessage } from '@common/shell/useMessage';
import { loadLocaleMessages, translate } from '@common/app/useLocale';
import {
    getAuthToken,
    SESSION_EXPIRED_EVENT,
} from '@common/user/services/auth';
import { getGuestToken } from '@common/user/services/guestTokenStore';
// 深导入：禁止从 './stores' 聚合桶取 store。
// 该桶以 `export *` 汇总 14 个 store（含 OL / chat / data-import 域），
// `export *` 对含副作用的模块无法被 tree-shake，会把整张 store 图拖进入口 chunk。
import { useUserPreferencesStore } from '@common/user/stores/useUserPreferencesStore';
import { markIpLocationFromBackend } from '@common/map-view/services/autoLocationMark';
import { injectAppVersionToUrl } from '@common/url-state/appVersionQuery';

// V3.7.12：首页加载即把构建版本写入 URL search（?v=3.7.12），
// 供缓存标识与人工排查；replaceState 不新增历史记录、不触发路由重建。
injectAppVersionToUrl();

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

// 会话过期统一出口：任意 API 检测到 token 失效后派发该事件，
// 这里统一弹提示并强制回注册/登录页，避免各调用点各弹一套文案、各跳各的页面。
window.addEventListener(SESSION_EXPIRED_EVENT, () => {
    const message = useMessage();
    message.ensureMessageHost('top-center');
    message.error(translate('account.messages.sessionExpired'), { duration: 5000 });
    void router.replace('/register');
});

// 三类身份（admin / registered / guest）统一周期性会话体检：
// 页面长时间停留时用户可能不再触发业务 API，管理员删 token 或 token 到期就不会被发现。
// /api/auth/me 为免配额只读端点；仅在本地确实持有任一 token 时探测，失败由 API 拦截器
// 统一走 SESSION_EXPIRED → 提示 → /register。
const SESSION_CHECK_INTERVAL_MS = 60_000;
let _sessionCheckInFlight = false;
window.setInterval(async () => {
    if (_sessionCheckInFlight) return;
    if (!getAuthToken() && !getGuestToken()) return;
    _sessionCheckInFlight = true;
    try {
        const { apiAuthMe } = await import('@/api/backend/auth');
        await apiAuthMe();
    } catch {
        /* 401 已由拦截器统一处理；其它失败静默，不打断浏览 */
    } finally {
        _sessionCheckInFlight = false;
    }
}, SESSION_CHECK_INTERVAL_MS);

// 尽早拉完整语言包，避免登录页等首屏在 preferences 网络返回前泄漏 auth.* key
void loadLocaleMessages();

const userPreferencesStore = useUserPreferencesStore(pinia);
void userPreferencesStore.bootstrap();

// V3.7.14 架构收敛：游客身份不再在应用入口无条件签发。
// landing 根目录是纯展示页，零签发零验证；只有进入 /home 时由路由守卫按需签发，
// 避免自动化脚本访问首页即获得有效 token 并计入在线人数。

// 进入地图主页后自动定位标记（V3.7.13）：后端 IP 定位成功即写 loc=ip；
// 仅 /home 触发（落地页 / 不需要定位标记），GPS 授权仍由既有流程覆盖为 loc=gps。
// 失败静默不写 loc；markIpLocationFromBackend 内部保证整页只执行一次。
router.afterEach((to) => {
    if (to.path === '/home') void markIpLocationFromBackend(to.path);
});

// Mount immediately so RouterView and GlobalLoading can render during async guards.
app.mount('#app');

// Keep message host initialization after router ready.
router.isReady().finally(() => {
    queueMicrotask(() => {
        const message = useMessage();
        message.ensureMessageHost('top-center');
    });
});
