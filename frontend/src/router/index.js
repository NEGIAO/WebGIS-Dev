import { createRouter, createWebHashHistory } from 'vue-router';
import RegisterView from '../views/RegisterView.vue';
import { useAuthStore } from '../stores';
import { hideLoading, showLoading } from '../utils/loading';
import {
  persistPositionCode,
  persistPositionCodeFromUrl,
  readPositionCodeFromUrl
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

router.beforeEach(async (to) => {
  const requiresAuth = !!to.meta?.requiresAuth;
  const shareModeEnabled = readShareFlagFromRoute(to);
  const shouldCheckAuth = requiresAuth || to.name === 'register';

  if (!shouldCheckAuth) {
    return true;
  }

  const authStore = useAuthStore();
  authStore.beginAuthCheck();
  showLoading('正在验证登录状态...');

  try {
    const isLoggedIn = await authStore.ensureValidSession();

    if (requiresAuth && !isLoggedIn && !shareModeEnabled) {
      cacheRoutePositionCode(to);
      return {
        name: 'register',
        query: { redirect: to.fullPath }
      };
    }

    if (to.name === 'register' && isLoggedIn && !shareModeEnabled) {
      return { name: 'home' };
    }

    return true;
  } finally {
    authStore.endAuthCheck();
    hideLoading();
  }
});

export default router;
