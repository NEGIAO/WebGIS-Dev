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
import { ensureGuestSession } from '@common/user/services/guestIdentity';
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

// 游客身份预签发（V3.7.6）：非阻塞后台执行，未登录访客尽早获得稳定签名身份；
// 签发失败静默（后端派生桶兜底），首几个请求可能先走派生身份，token 到位后自动切换。
void ensureGuestSession();

// 进入系统自动定位标记（V3.7.13）：后端 IP 定位成功即写 loc=ip；
// GPS 授权仍由现有定位流程覆盖为 loc=gps（优先级更高）；失败静默不写 loc。
void markIpLocationFromBackend();

// Mount immediately so RouterView and GlobalLoading can render during async guards.
app.mount('#app');

// Keep message host initialization after router ready.
router.isReady().finally(() => {
    queueMicrotask(() => {
        const message = useMessage();
        message.ensureMessageHost('top-center');
    });
});
