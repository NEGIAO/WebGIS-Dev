/**
 * 游客身份签名 token 本地存储（叶子模块，零依赖，供 client.ts 拦截器与身份服务共用）。
 *
 * V3.7.6 游客身份治理：token 由后端 POST /api/auth/guest/session 签发（HMAC），
 * localStorage 持久化（跨标签页共享、24h 有效），请求经 `X-Guest-Token` 头携带。
 * 与登录态（sessionStorage webgis_auth_token）完全隔离：guest token 永远不进入
 * Authorization 头，登录会话也永远不写入本 key。
 */

const GUEST_TOKEN_KEY = 'webgis_guest_token';

function safeLocal(): Storage | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage || null;
    } catch {
        return null;
    }
}

/** 读取已存储的游客身份 token（空串表示无） */
export function getGuestToken(): string {
    return String(safeLocal()?.getItem(GUEST_TOKEN_KEY) || '').trim();
}

/** 写入游客身份 token（空值视为清除） */
export function setGuestToken(token: string): void {
    const storage = safeLocal();
    if (!storage) return;
    const normalized = String(token || '').trim();
    try {
        if (normalized) {
            storage.setItem(GUEST_TOKEN_KEY, normalized);
        } else {
            storage.removeItem(GUEST_TOKEN_KEY);
        }
    } catch {
        /* localStorage 写失败（隐私模式等）：静默降级为派生桶身份 */
    }
}

/** 清除游客身份 token（token 过期/验签失效时由身份服务调用） */
export function clearGuestToken(): void {
    setGuestToken('');
}
