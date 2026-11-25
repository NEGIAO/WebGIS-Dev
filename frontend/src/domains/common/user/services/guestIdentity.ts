/**
 * 游客身份签发与分享模式注入（V3.7.6 游客身份治理）。
 *
 * 方案：Docs/TODO/guest-identity-governance-plan.md §3.2/§3.5
 * - 身份唯一铸造入口：POST /api/auth/guest/session（后端按 (XFF末跳IP, UA) 限频）；
 * - token 存 localStorage（guestTokenStore），client.ts 拦截器经 X-Guest-Token 头携带；
 * - 签发失败（未配置 GUEST_TOKEN_SECRET / 限频 / 网络异常）一律静默降级：
 *   后端对无 token 请求按确定性派生桶 H(末跳IP|UA) 识别身份，浏览不受影响。
 */
import { apiAuthGuestSession } from '@/api/backend/auth';
import {
    getOrCreateGuestDeviceId,
    setGuestUserSnapshot,
    syncUserRoleToUrl,
} from '@common/user/services/auth';
import { clearGuestToken, getGuestToken, setGuestToken } from '@common/user/services/guestTokenStore';

export interface GuestSessionResult {
    token: string;
    user: Record<string, any> | null;
    expires_in_hours?: number;
}

// 进行中的签发请求（并发调用合并为一次，避免同时多次打签发端点消耗限频额度）
let ensurePromise: Promise<GuestSessionResult | null> | null = null;

/**
 * 确保游客身份就绪：已持 token 直接返回；否则调签发端点换取并落存储。
 *
 * @param options.force=true 时无视已有 token 强制重签（限频由后端约束）
 * @returns 签发结果（含后端返回的游客 user 对象）；不可用时返回 null（不抛错）
 */
export async function ensureGuestSession(options: { force?: boolean } = {}): Promise<GuestSessionResult | null> {
    const force = options.force === true;
    const existing = getGuestToken();
    if (!force && existing) {
        // 已持有 token 直接复用。有效期与撤销由后端判定：签名有效但已过期/被删除时
        // 返回 401 SESSION_EXPIRED，前端统一清游客身份并强制跳 /register。
        // 本项目明确**不做静默续签**（否则被撤销的身份可借续签绕回），
        // 只有显式 force（分享模式首次注入）才重新签发。
        return { token: existing, user: null };
    }

    if (!ensurePromise) {
        ensurePromise = (async (): Promise<GuestSessionResult | null> => {
            try {
                const result: any = await apiAuthGuestSession({
                    device_id: getOrCreateGuestDeviceId() || undefined,
                });
                const token = String(result?.token || '').trim();
                const user = (result?.user && typeof result.user === 'object') ? result.user : null;
                if (!token || !user) return null;
                setGuestToken(token);
                setGuestUserSnapshot(user);
                // V3.7.12：游客签发也同步 URL 身份标签，使访问统计按 guest_<id> 分组
                syncUserRoleToUrl(user);
                return { token, user, expires_in_hours: Number(result?.expires_in_hours) || undefined };
            } catch {
                // 401/429/503/网络失败均静默：游客身份属增强而非阻塞项
                return null;
            } finally {
                ensurePromise = null;
            }
        })();
    }
    return ensurePromise;
}

/**
 * 为分享模式（?s=1）注入游客身份：调后端真实签发并落本地存储。
 * 取代 V3.7.6 之前的本地伪 token（guest_<ts>_<deviceId>）铸造。
 *
 * @returns 是否就绪（true 表示已持有游客身份；false 仅代表走了派生兜底，不阻塞浏览）
 */
export async function injectGuestTokenForShareMode(): Promise<boolean> {
    try {
        const session = await ensureGuestSession({ force: !getGuestToken() });
        if (!session) {
            console.warn('[Auth] Guest identity issuance unavailable for share mode; fallback to derived identity');
            return false;
        }
        console.warn('[Auth] Guest identity ready for share mode', {
            username: session.user?.username ?? '(derived)',
        });
        return true;
    } catch {
        return false;
    }
}

/** 清理游客身份（token 失效或退出分享场景时使用；快照随 clearAuthSession 一并清除） */
export function resetGuestIdentity(): void {
    clearGuestToken();
}
