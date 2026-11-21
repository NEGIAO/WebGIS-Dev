/**
 * 登录会话统一出口（V3.7.7 批次 B）
 *
 * 背景：此前登录成功的三件事（写 sessionStorage、同步 URL 角色参数、回填全局 authStore）
 * 散落在 5+ 个登录出口各自为政——RegisterView 两条登录流、OAuth 回调、Google One Tap、
 * 邮箱绑定验证流都只调 setAuthSession + syncUserRoleToUrl，从不回填 authStore.user；
 * 而该 store 的唯一正规写入口 ensureValidSession 只在整页加载的路由守卫里触发
 * （GIS 已加载时短路放行），导致 SPA 内登录后全局身份停留在登录前旧值
 * （V3.7.6 曾在 FloatingAccountPanel.mergeUserPatch 单点回填，属补丁而非收口）。
 *
 * 本模块是**唯一**登录会话写入出口：
 *   - commitLoginSession(token, user)：登录/换号成功后调用；
 *   - resetAuthSessionState()：注销/被踢回登录页时调用（顺带清理 authStore 残留身份）。
 * 新增登录入口一律走这两个函数，禁止散点直调 setAuthSession。
 */

import { useAuthStore } from '@common/user/stores/useAuthStore';
import { clearAuthSession, setAuthSession, syncUserRoleToUrl } from './auth';

/**
 * 登录成功统一出口。
 * @param token 后端下发的会话令牌（登录响应体）
 * @param user  后端返回的用户对象（含 role / requires_email_binding 等）
 */
export function commitLoginSession(token: string, user: any): void {
    setAuthSession({ token, user });
    syncUserRoleToUrl(user);
    try {
        // 回填全局 authStore：SPA 内登录不会触发 ensureValidSession（守卫在 GIS 已加载
        // 时短路放行），authStore.user 若不在此同步将一直停留在登录前旧身份，
        // 依赖它的判定（如用户中心 isAdmin、adminDenied 身份变化监听）会读到过期数据。
        useAuthStore().user = user ?? null;
    } catch {
        // pinia 未激活（极端启动时序）时跳过；路由守卫的 ensureValidSession 兜底
    }
}

/**
 * 注销 / 会话作废统一出口：清 sessionStorage（含广播 auth-changed）+
 * 清全局 authStore（修复登出后 authStore.user 残留旧身份的既有缺口）。
 */
export function resetAuthSessionState(): void {
    clearAuthSession();
    try {
        useAuthStore().resetValidation();
    } catch {
        // pinia 未激活时跳过；下次整页加载守卫会重新校验
    }
}
