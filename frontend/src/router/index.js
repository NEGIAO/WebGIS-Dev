import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import RegisterView from '../views/RegisterView.vue';
import { apiAuthMe } from '../api/backend';
import { clearAuthSession, getAuthToken } from '../utils/auth';

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

let validatedToken = '';

async function ensureValidSession() {
  const token = getAuthToken();
  if (!token) {
    validatedToken = '';
    return false;
  }

  if (validatedToken === token) {
    return true;
  }

  try {
    await apiAuthMe();
    validatedToken = token;
    return true;
  } catch {
    clearAuthSession();
    validatedToken = '';
    return false;
  }
}

router.beforeEach(async (to) => {
  const isLoggedIn = await ensureValidSession();
  const requiresAuth = !!to.meta?.requiresAuth;

  if (requiresAuth && !isLoggedIn) {
    return {
      name: 'register',
      query: { redirect: to.fullPath }
    };
  }

  if (to.name === 'register' && isLoggedIn) {
    return { name: 'home' };
  }

  return true;
});

export default router;
