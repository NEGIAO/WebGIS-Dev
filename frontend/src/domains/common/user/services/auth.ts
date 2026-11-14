const AUTH_TOKEN_KEY = 'webgis_auth_token';
const AUTH_USER_KEY = 'webgis_auth_user';
const GUEST_DEVICE_ID_KEY = 'webgis_guest_device_id';
const PENDING_POSITION_CODE_KEY = 'webgis_pending_position_code';
export const AUTH_CHANGED_EVENT = 'webgis:auth-changed';

let _memoryGuestDeviceId = '';
let _presenceClientId = '';

import { normalizeBinaryFlag } from '@common/utils/normalize';
import { useMessage } from '@common/shell/useMessage';

function readUrlParams() {
    if (typeof window === 'undefined') {
        return {
            hashParams: new URLSearchParams(),
            searchParams: new URLSearchParams(),
        };
    }

    const hash = String(window.location.hash || '');
    const queryStart = hash.indexOf('?');
    const hashParams =
        queryStart >= 0 ? new URLSearchParams(hash.slice(queryStart + 1)) : new URLSearchParams();
    const searchParams = new URLSearchParams(
        String(window.location.search || '').replace(/^\?/, ''),
    );

    return { hashParams, searchParams };
}

function getStorage() {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
}

export function getAuthToken() {
    const storage = getStorage();
    if (!storage) return '';
    return String(storage.getItem(AUTH_TOKEN_KEY) || '').trim();
}

export function getAuthUser() {
    const storage = getStorage();
    if (!storage) return null;

    const raw = storage.getItem(AUTH_USER_KEY);
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        storage.removeItem(AUTH_USER_KEY);
        return null;
    }
}

function emitAuthChanged() {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    try {
        window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
    } catch {
        /* ignore */
    }
}

export function setAuthSession(payload: any = {}) {
    const storage = getStorage();
    if (!storage) return;

    const token = String(payload?.token || '').trim();
    const user = payload?.user || null;

    if (!token || !user) {
        clearAuthSession();
        return;
    }

    storage.setItem(AUTH_TOKEN_KEY, token);
    storage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    emitAuthChanged();
}

export function clearAuthSession() {
    const storage = getStorage();
    if (!storage) return;

    storage.removeItem(AUTH_TOKEN_KEY);
    storage.removeItem(AUTH_USER_KEY);
    emitAuthChanged();
}

export function getBackendBearerToken() {
    const token = getAuthToken();
    if (!token) return '';
    const user = getAuthUser();
    // injectGuestTokenForShareMode 注入的本地占位 token 形如 guest_<ts>_<deviceId>，
    // 并非后端 DB 会话令牌；发送 Authorization 头会触发 require_login 返回 401 SESSION_EXPIRED。
    if (user?.role === 'visitor' && /^guest_\d+_/.test(token)) {
        return '';
    }
    return token;
}

export function isAuthenticated() {
    return !!getAuthToken();
}

export const AUTH_STORAGE_KEYS = Object.freeze({
    token: AUTH_TOKEN_KEY,
    user: AUTH_USER_KEY,
    guestDeviceId: GUEST_DEVICE_ID_KEY,
});

function randomGuestDeviceSeed() {
    if (
        typeof globalThis !== 'undefined' &&
        globalThis.crypto &&
        typeof globalThis.crypto.getRandomValues === 'function'
    ) {
        const bytes = new Uint8Array(16);
        globalThis.crypto.getRandomValues(bytes);
        return Array.from(bytes)
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeGuestDeviceId(rawValue: any) {
    const compact = String(rawValue || '')
        .trim()
        .replace(/[^A-Za-z0-9_.:-]/g, '');
    if (compact.length < 6) return '';
    return compact.slice(0, 128);
}

function getLocalStorageSafely() {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage || null;
    } catch {
        return null;
    }
}

export function getGuestDeviceId() {
    // 访客设备 ID 优先落 localStorage：同一浏览器多标签页共享同一访客身份，
    // 避免开多个标签页被统计成多个独立在线用户；保留 sessionStorage 兼容迁移。
    const local = getLocalStorageSafely();
    if (local) {
        try {
            const fromLocal = normalizeGuestDeviceId(local.getItem(GUEST_DEVICE_ID_KEY) || '');
            if (fromLocal) return fromLocal;
        } catch {
            /* ignore localStorage read failure */
        }
    }

    const session = getStorage();
    if (session) {
        try {
            const fromSession = normalizeGuestDeviceId(session.getItem(GUEST_DEVICE_ID_KEY) || '');
            if (fromSession) {
                if (local) {
                    try {
                        local.setItem(GUEST_DEVICE_ID_KEY, fromSession);
                    } catch {
                        /* ignore */
                    }
                }
                return fromSession;
            }
        } catch {
            /* ignore sessionStorage read failure */
        }
    }

    return _memoryGuestDeviceId;
}

export function getOrCreateGuestDeviceId() {
    const existing = getGuestDeviceId();
    if (existing) {
        _memoryGuestDeviceId = existing;
        return existing;
    }

    const generated = normalizeGuestDeviceId(`gd_${randomGuestDeviceSeed()}`);
    if (!generated) return '';

    _memoryGuestDeviceId = generated;
    const local = getLocalStorageSafely();
    if (local) {
        try {
            local.setItem(GUEST_DEVICE_ID_KEY, generated);
            return generated;
        } catch {
            /* fallback to sessionStorage */
        }
    }
    const session = getStorage();
    if (session) {
        try {
            session.setItem(GUEST_DEVICE_ID_KEY, generated);
        } catch {
            /* keep memory fallback */
        }
    }
    return generated;
}

/**
 * 当前文档实例（单标签页本次加载）的唯一在线实例 ID（不跨标签/不跨刷新持久化），
 * 用于后端区分「同人多个标签页」与「同标签重连/刷新」，做到关一页不误杀其余页。
 */
export function getPresenceClientId() {
    if (_presenceClientId) return _presenceClientId;
    const raw = `c_${randomGuestDeviceSeed().slice(0, 24)}`;
    _presenceClientId = raw.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64);
    return _presenceClientId;
}

export function readShareModeFromUrl() {
    const { hashParams, searchParams } = readUrlParams();
    const raw = hashParams.get('s') ?? searchParams.get('s');
    return normalizeBinaryFlag(raw, '0') === '1';
}

export function readPositionCodeFromUrl() {
    const { hashParams, searchParams } = readUrlParams();
    const code = String(hashParams.get('p') ?? searchParams.get('p') ?? '').trim();
    return code;
}

export function persistPositionCode(code: any) {
    const storage = getStorage();
    if (!storage) return '';

    const normalized = String(code || '').trim();
    if (!normalized) {
        storage.removeItem(PENDING_POSITION_CODE_KEY);
        return '';
    }

    storage.setItem(PENDING_POSITION_CODE_KEY, normalized);
    return normalized;
}

export function persistPositionCodeFromUrl() {
    const code = readPositionCodeFromUrl();
    return persistPositionCode(code);
}

export function peekPersistedPositionCode() {
    const storage = getStorage();
    if (!storage) return '';
    return String(storage.getItem(PENDING_POSITION_CODE_KEY) || '').trim();
}

export function consumePersistedPositionCode() {
    const storage = getStorage();
    if (!storage) return '';

    const code = String(storage.getItem(PENDING_POSITION_CODE_KEY) || '').trim();
    storage.removeItem(PENDING_POSITION_CODE_KEY);
    return code;
}

export function injectPositionCodeToPath(path = '/home', code = '') {
    const normalizedPath = String(path || '/home').trim();
    const safePath = normalizedPath.startsWith('/') ? normalizedPath : '/home';

    const [pathnameRaw, queryRaw = ''] = safePath.split('?');
    const pathname = pathnameRaw || '/home';
    const params = new URLSearchParams(queryRaw);

    const normalizedCode = String(code || '').trim();
    if (normalizedCode && !String(params.get('p') || '').trim()) {
        params.set('p', normalizedCode);
        if (normalizedCode !== '0' && !String(params.get('loc') || '').trim()) {
            params.set('loc', '1');
        }
    }

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
}

// ============ Share Mode 访客令牌注入 ============

/**
 * 为分享模式注入访客令牌（临时）
 * 仅在 s=1 时调用，会生成临时访客凭证并存储
 *
 * @returns {boolean} 是否成功注入（true 表示已注入访客令牌）
 */
export function injectGuestTokenForShareMode() {
    const message = useMessage();
    try {
        // 1. 生成或获取访客设备 ID
        const guestDeviceId = getOrCreateGuestDeviceId();
        if (!guestDeviceId) {
            console.warn('[Auth] Failed to create guest device ID');
            return false;
        }

        // 2. 构造临时访客令牌（格式：guest_<timestamp>_<deviceId>）
        const timestamp = Date.now();
        const guestToken = `guest_${timestamp}_${guestDeviceId}`;

        // 3. 构造访客用户对象
        const guestUser = {
            username: 'Guest',
            role: 'visitor',
            guest_uid: guestDeviceId,
            guest_token: guestToken,
            created_at: new Date().toISOString(),
        };

        // 4. 注入到认证存储中
        setAuthSession({
            token: guestToken,
            user: guestUser,
        });

        console.warn('[Auth] Guest token injected for share mode', {
            guestDeviceId,
            timestamp,
            user: guestUser.username,
        });

        return true;
    } catch (_error) {
        // 访客令牌注入失败会导致分享模式无法访问,以 message.error 提示用户
        message.error('访客模式登录失败，请刷新页面重试');
        return false;
    }
}

/**
 * 检查当前会话是否是访客身份
 * @returns {boolean}
 */
export function isGuestSession() {
    const user = getAuthUser();
    return user?.role === 'visitor' || user?.guest_uid !== undefined;
}

/**
 * 获取当前访客会话的元数据
 * @returns {Object|null} {guestDeviceId, guestToken, createdAt} 或 null
 */
export function getGuestSessionMetadata() {
    if (!isGuestSession()) return null;

    const user = getAuthUser();
    const token = getAuthToken();

    return {
        guestDeviceId: user?.guest_uid || '',
        guestToken: token,
        createdAt: user?.created_at || '',
        username: user?.username || 'Unknown',
    };
}

/**
 * 将用户角色同步到 URL hash 参数中（ut=userType）
 *
 * 该参数仅用于访问统计与人工排查（按身份分组看访问），
 * **不参与任何权限判断**：它在地址栏里，任何人手工改写都能伪造，
 * 因此不能作为「管理员登录过」的证据；鉴权只认 Authorization / X-Auth-Token 的会话令牌。
 *
 * @param {Object} user - 用户对象，包含 role 字段
 */
export function syncUserRoleToUrl(user: any) {
    if (typeof window === 'undefined') return;

    const roleRaw = String(user?.role || '')
        .trim()
        .toLowerCase();
    const role = roleRaw === 'admin' ? 'admin' : roleRaw === 'guest' ? 'guest' : 'registered';

    try {
        const hash = String(window.location.hash || '#/home');
        const hashWithoutSharp = hash.startsWith('#') ? hash.slice(1) : hash;
        const [hashPathRaw, hashQueryRaw = ''] = hashWithoutSharp.split('?');
        const hashPath = hashPathRaw || '/home';
        const normalizedHashPath = hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
        const params = new URLSearchParams(hashQueryRaw);

        params.set('ut', role);

        const nextHashQuery = params.toString();
        const nextHash = nextHashQuery
            ? `#${normalizedHashPath}?${nextHashQuery}`
            : `#${normalizedHashPath}`;

        const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
        window.history.replaceState(window.history.state, '', nextUrl);
    } catch {
        // ignore URL sync errors
    }
}
