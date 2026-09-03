// 应用路由表：登录/落地/主页等页面入口，含分享模式与鉴权守卫逻辑
import { createRouter, createWebHashHistory } from 'vue-router';
import RegisterView from '../app/RegisterView.vue';
import LandingView from '../app/LandingView.vue';
import { useAuthStore } from '@common/user/stores/useAuthStore';
import { useAppStore } from '@common/app/stores/useAppStore';
import { useUrlParamStore } from '@common/url-state/stores/useUrlParamStore';
import { hideLoading, showLoading } from '@common/ui/loading';
import { translate as t } from '@common/app/useLocale';
import {
    persistPositionCode,
    persistPositionCodeFromUrl,
    readPositionCodeFromUrl,
    injectGuestTokenForShareMode,
    getAuthToken,
    getAuthUser,
} from '@common/user/services/auth';
import { EMERGENCY_GUEST_MODE } from '@/config/publicRuntime';

const HomeView = () => import('./lazyHomeViewLoader').then((mod) => mod.loadHomeView());

//首屏延迟map，遮罩，避免网络不好白屏
// 首屏 Loading 隐藏延迟：map-core-ready（首张瓦片就绪）后遮罩再停留 3s，
// 作为过渡缓冲，避免遮罩消失瞬间视口其余瓦片尚未铺满露出白底。
const MAP_ENGINE_LOADING_HIDE_DELAY_MS = 3000;

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        {
            path: '/',
            name: 'landing',
            component: LandingView,
            meta: { requiresAuth: false },
        },
        {
            path: '/register',
            name: 'register',
            component: RegisterView,
            meta: { requiresAuth: false },
        },
        {
            path: '/oauth/callback',
            name: 'oauth-callback',
            component: () => import('../app/OAuthCallbackView.vue'),
            meta: { requiresAuth: false, skipAuthCheck: true },
        },
        {
            path: '/home',
            name: 'home',
            component: HomeView,
            meta: { requiresAuth: true },
        },
        {
            path: '/terms',
            name: 'terms',
            component: () => import('../app/TermsOfService.vue'),
            meta: { requiresAuth: false },
        },
        {
            path: '/privacy',
            name: 'privacy',
            component: () => import('../app/PrivacyPolicy.vue'),
            meta: { requiresAuth: false },
        },
        {
            path: '/:pathMatch(.*)*',
            name: 'not-found',
            component: () => import('../app/NotFoundView.vue'),
            meta: { requiresAuth: false },
        },
    ],
});

import { normalizeBinaryFlag } from '@common/utils/normalize';

function readRouteQueryValue(route, key) {
    const raw = route?.query?.[key];
    if (Array.isArray(raw)) {
        return String(raw[0] ?? '').trim();
    }
    return String(raw ?? '').trim();
}

function readShareFlagFromRoute(route) {
    const routeShareFlag = readRouteQueryValue(route, 's');
    if (routeShareFlag) {
        return normalizeBinaryFlag(routeShareFlag, '0') === '1';
    }

    if (typeof window === 'undefined') return false;

    const hash = String(window.location.hash || '');
    const queryStart = hash.indexOf('?');
    const hashParams =
        queryStart >= 0 ? new URLSearchParams(hash.slice(queryStart + 1)) : new URLSearchParams();
    const searchParams = new URLSearchParams(
        String(window.location.search || '').replace(/^\?/, ''),
    );

    const shareFlag = hashParams.get('s') ?? searchParams.get('s');
    return normalizeBinaryFlag(shareFlag, '0') === '1';
}

function cacheRoutePositionCode(route) {
    const routePosCode = readRouteQueryValue(route, 'p');
    if (routePosCode) {
        persistPositionCode(routePosCode);
        return;
    }
    const urlPosCode = readPositionCodeFromUrl();
    if (urlPosCode) {
        persistPositionCode(urlPosCode);
        return;
    }
    persistPositionCodeFromUrl();
}

router.beforeEach(async (to, from) => {
    const requiresAuth = !!to.meta?.requiresAuth;
    const shareModeEnabled = readShareFlagFromRoute(to);
    const shouldCheckAuth = (requiresAuth || to.name === 'register') && !to.meta?.skipAuthCheck;
    const isHomeRoute = to.name === 'home';
    let shouldRelayLoadingToHome = false;

    const urlParamStore = useUrlParamStore();
    const routeQueryParams = {
        lng: readRouteQueryValue(to, 'lng'),
        lat: readRouteQueryValue(to, 'lat'),
        z: readRouteQueryValue(to, 'z'),
        l: readRouteQueryValue(to, 'l'),
        s: readRouteQueryValue(to, 's'),
        loc: readRouteQueryValue(to, 'loc'),
        p: readRouteQueryValue(to, 'p'),
        view: readRouteQueryValue(to, 'view'),
    };

    if (isHomeRoute) {
        // 同一路由 query/hash 变化也需要刷新 pending params，供刷新恢复与前进/后退同步使用。
        urlParamStore.extractAndStorePendingParams(routeQueryParams);
        console.warn('[Router] URL params extracted and stored for deferred application');
    }

    // Guard 1: Ignore pure query/hash changes (parameter updates only)
    const isRealNavigation = !from || from.path !== to.path;
    if (!isRealNavigation) {
        return true;
    }

    // ========== CRITICAL: Share Mode Bypass (Highest Priority) ==========
    // [优先级 1] 如果 s=1（分享模式），直接注入访客令牌，绕过登录
    if (shareModeEnabled && !getAuthToken()) {
        const guestInjected = injectGuestTokenForShareMode();
        if (guestInjected) {
            console.warn('[Router] Share mode detected: Guest token injected');
            // 继续到下一步（参数提取）
        } else {
            console.warn('[Router] Failed to inject guest token for share mode');
            // 即使失败也继续，用户会看到访客受限的功能
        }
    }

    // [优先级 2] 提取 URL 参数并存储到 urlParamStore（独立于鉴权过程）
    // Guard 3: After GIS init completes, prevent re-showing loading for home route
    const appStore = useAppStore();
    if (appStore.isInitialGisLoadComplete && isHomeRoute) {
        return true;
    }

    // ========== Standard Authentication Flow ==========
    if (!shouldCheckAuth) {
        return true;
    }

    const authStore = useAuthStore();
    authStore.beginAuthCheck();
    showLoading(t('loading.authCheck'));
    try {
        const isLoggedIn = await authStore.ensureValidSession();
        const bindingRequired =
            authStore.requiresEmailBinding === true ||
            getAuthUser()?.requires_email_binding === true;

        // 未登录时：应急游客强制模式下直接注入游客令牌放行浏览；否则走原登录流程重定向 register。
        if (requiresAuth && !isLoggedIn && !shareModeEnabled) {
            cacheRoutePositionCode(to);
            if (EMERGENCY_GUEST_MODE) {
                injectGuestTokenForShareMode();
                // 不返回重定向；游客令牌已注入，继续走下方 home 逻辑放行
            } else {
                return {
                    name: 'register',
                    query: { redirect: to.fullPath },
                };
            }
        }

        if (requiresAuth && isLoggedIn && bindingRequired && !shareModeEnabled) {
            cacheRoutePositionCode(to);
            return {
                name: 'register',
                query: { redirect: to.fullPath },
            };
        }

        if (to.name === 'register' && isLoggedIn && !bindingRequired && !shareModeEnabled) {
            showLoading(t('loading.mapEngine'), {
                hideDelayMs: MAP_ENGINE_LOADING_HIDE_DELAY_MS,
            });
            shouldRelayLoadingToHome = true;
            return { name: 'home' };
        }

        if (isHomeRoute) {
            showLoading(t('loading.mapEngine'), {
                hideDelayMs: MAP_ENGINE_LOADING_HIDE_DELAY_MS,
            });
            shouldRelayLoadingToHome = true;
        }

        return true;
    } finally {
        authStore.endAuthCheck();
        if (!shouldRelayLoadingToHome) {
            hideLoading();
        }
    }
});

export default router;
