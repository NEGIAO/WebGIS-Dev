import { createRouter, createWebHashHistory } from 'vue-router';
import RegisterView from '../views/RegisterView.vue';
import { useAuthStore, useAppStore, useUrlParamStore } from '../stores';
import { hideLoading, showLoading } from '../utils/loading';
import {
  persistPositionCode,
  persistPositionCodeFromUrl,
  readPositionCodeFromUrl,
  injectGuestTokenForShareMode,
  readShareModeFromUrl,
  getAuthToken
} from '../utils/auth';

const HomeView = () => import('./lazyHomeViewLoader').then((mod) => mod.loadHomeView());

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/register'
    },
    {
      path: '/register',
      name: 'register',
      component: RegisterView,
      meta: { requiresAuth: false }
    },
    {
      path: '/home',
      name: 'home',
      component: HomeView,
      meta: { requiresAuth: true }
    }
  ]
});

function normalizeBinaryFlag(value, fallback = '0') {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === '1' || raw === 'true') return '1';
  if (raw === '0' || raw === 'false') return '0';
  return fallback === '1' ? '1' : '0';
}

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
  const hashParams = queryStart >= 0
    ? new URLSearchParams(hash.slice(queryStart + 1))
    : new URLSearchParams();
  const searchParams = new URLSearchParams(String(window.location.search || '').replace(/^\?/, ''));

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

let lastNavigationPath = null;

router.beforeEach(async (to, from) => {
  const requiresAuth = !!to.meta?.requiresAuth;
  const shareModeEnabled = readShareFlagFromRoute(to);
  const shouldCheckAuth = requiresAuth || to.name === 'register';
  const isHomeRoute = to.name === 'home';
  let shouldRelayLoadingToHome = false;

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
      console.info('[Router] Share mode detected: Guest token injected');
      // 继续到下一步（参数提取）
    } else {
      console.warn('[Router] Failed to inject guest token for share mode');
      // 即使失败也继续，用户会看到访客受限的功能
    }
  }

  // [优先级 2] 提取 URL 参数并存储到 urlParamStore（独立于鉴权过程）
  const urlParamStore = useUrlParamStore();
  const routeQueryParams = {
    lng: readRouteQueryValue(to, 'lng'),
    lat: readRouteQueryValue(to, 'lat'),
    z: readRouteQueryValue(to, 'z'),
    l: readRouteQueryValue(to, 'l'),
    s: readRouteQueryValue(to, 's'),
    loc: readRouteQueryValue(to, 'loc'),
    p: readRouteQueryValue(to, 'p')
  };

  if (isHomeRoute) {
    // 在路由阶段就提取 URL 参数，等待 MapContainer 挂载后再应用
    urlParamStore.extractAndStorePendingParams(routeQueryParams);
    console.info('[Router] URL params extracted and stored for deferred application');
  }

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
  showLoading('正在验证登录状态...');
  lastNavigationPath = to.path;

  try {
    const isLoggedIn = await authStore.ensureValidSession();

    // [Share Mode] 即使未登录，分享模式也允许访问（已通过访客令牌）
    if (requiresAuth && !isLoggedIn && !shareModeEnabled) {
      cacheRoutePositionCode(to);
      return {
        name: 'register',
        query: { redirect: to.fullPath }
      };
    }

    if (to.name === 'register' && isLoggedIn && !shareModeEnabled) {
      showLoading('Loading Map Engine & Assets...');
      shouldRelayLoadingToHome = true;
      return { name: 'home' };
    }

    if (isHomeRoute) {
      showLoading('Loading Map Engine & Assets...');
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
