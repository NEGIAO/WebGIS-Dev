const AUTH_TOKEN_KEY = 'webgis_auth_token';
const AUTH_USER_KEY = 'webgis_auth_user';
const GUEST_DEVICE_ID_KEY = 'webgis_guest_device_id';
const PENDING_POSITION_CODE_KEY = 'webgis_pending_position_code';
export const AUTH_CHANGED_EVENT = 'webgis:auth-changed';
/** 会话过期统一事件：任意 API 检测到 token 失效后派发，由 main.ts 统一提示并跳 /register */
export const SESSION_EXPIRED_EVENT = 'webgis:session-expired';

let _memoryGuestDeviceId = '';
let _lastSessionExpiredAt = 0;
let _presenceClientId = '';

import { normalizeBinaryFlag } from '@common/utils/normalize';
import { sanitizeUrlParams } from '@common/url-state/urlParamSanitizer';
import { clearGuestToken } from './guestTokenStore';

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
    // 重新登录后允许再次触发会话过期提醒（跨过上一次的合并窗口）
    _lastSessionExpiredAt = 0;
    emitAuthChanged();
}

export function clearAuthSession() {
    const storage = getStorage();
    if (!storage) return;

    storage.removeItem(AUTH_TOKEN_KEY);
    storage.removeItem(AUTH_USER_KEY);
    emitAuthChanged();
}

/**
 * 统一处理“会话过期 / token 失效”：清本地会话 + 派发全局事件。
 *
 * 多个并发请求同时拿到 401 时会重复进入，这里做 3s 合并，保证只弹一次提示、
 * 只跳一次 /register；真正跳转到哪由 main.ts 的全局监听器决定，
 * 避免 api 层直接依赖 router 造成循环引用。
 */
export function markSessionExpired(): void {
    clearAuthSession();
    // 游客 token 独立于登录会话存放；被管理员撤销/过期时必须一并清掉，
    // 否则刷新后仍带旧 token，会再次 401 形成循环。
    clearGuestToken();
    const now = Date.now();
    if (now - _lastSessionExpiredAt < 3000) return;
    _lastSessionExpiredAt = now;
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    try {
        window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    } catch {
        /* ignore */
    }
}

/**
 * 写入游客身份用户快照（仅 user，不写 token）。
 * V3.7.6 游客身份治理：guest token 存 localStorage（guestTokenStore），
 * 永不进入 webgis_auth_token（否则会被误当登录态发送 Authorization 头）；
 * 本函数只把后端返回的游客 user 对象落到 sessionStorage 供 UI 读取
 * （getAuthUser / roleText / guest_no 展示）。
 */
export function setGuestUserSnapshot(user: any): void {
    const storage = getStorage();
    if (!storage || !user || typeof user !== 'object') return;
    try {
        storage.setItem(AUTH_USER_KEY, JSON.stringify(user));
        emitAuthChanged();
    } catch {
        /* sessionStorage 不可用时静默：UI 回退到无身份展示 */
    }
}

export function getBackendBearerToken() {
    const token = getAuthToken();
    if (!token) return '';
    const user = getAuthUser();
    // V3.6.6 兼容残留：旧分享模式写入的本地占位 token（guest_<ts>_<deviceId>）
    // 并非后端 DB 会话令牌；发送 Authorization 头会触发 require_login 返回 401。
    // V3.7.6 起新代码不再产生该形态 token，本守卫仅为清理旧 sessionStorage 存量。
    if ((user?.role === 'visitor' || user?.role === 'guest') && /^guest_\d+_/.test(token)) {
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
    // V3.7.13：仅有效编码（非空且非 '0'）才注入 p；未编码不写占位值。
    // 定位来源统一用 gps/ip（不再写 loc=1），由调用方或定位链路设置。
    if (normalizedCode && normalizedCode !== '0' && !String(params.get('p') || '').trim()) {
        params.set('p', normalizedCode);
    }

    sanitizeUrlParams(params);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
}

// ============ Share Mode 访客身份注入 ============
//
// V3.7.6 游客身份治理：本地伪 token（guest_<ts>_<deviceId>）铸造已废除。
// 分享模式的游客身份改由 `guestIdentity.ts` 的 injectGuestTokenForShareMode
// 调用后端 /api/auth/guest/session 真实签发（HMAC token，受签发限频约束），
// 本文件不再承担该职责（router/index.ts 已改从 guestIdentity 导入）。

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
 * ut 标签专用展示名清洗（V3.7.13）：trim → 去控制字符 → 压缩空白 → 限长 32。
 * 不复用 composables/useAuthIdentity::normalizeDisplayName——那是昵称校验用
 * （限长 40、不去控制字符），且 service 层不应依赖 composable。
 * @param raw 原始展示名
 * @returns 可安全写入 URL 的展示名；空串表示不可用
 */
function sanitizeDisplayNameForUrlTag(raw: unknown): string {
    const cleaned = Array.from(String(raw ?? ''))
        .filter((char) => {
            const code = char.charCodeAt(0);
            return code > 31 && code !== 127;
        })
        .join('')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 32)
        .trim();
    return cleaned;
}

/**
 * 由用户对象构造 URL `ut` 身份标签（V3.7.12）。
 *
 * 规则：
 * - admin → `admin`（管理员全局唯一，不附加标识）
 * - guest → `guest_<guest_no>`，缺失时回退 `guest_<username 中的数字 id>`
 * - registered → `registered_<清洗后的 display_name>`，空值回退 `registered_<username>`
 *
 * V3.7.13：registered 原取 username，但 OAuth 账号的 username 带唯一性 hash
 * （如 negiao_033f72，用于避免撞名），不适合展示；改用 display_name 并做温和清洗
 * （去控制字符、压缩空白、限长 32），避免展示名的不确定性污染 URL 标签。
 *
 * 纯函数，无副作用，便于单测与排查；含中文/特殊字符的展示名由 URLSearchParams 自动编码。
 *
 * @param user 用户对象（含 role / guest_no / display_name / username）
 * @returns ut 参数值
 */
export function buildUserTypeTag(user: any): string {
    const roleRaw = String(user?.role || '')
        .trim()
        .toLowerCase();
    if (roleRaw === 'admin') return 'admin';

    if (roleRaw === 'guest') {
        const no = Number(user?.guest_no);
        if (Number.isFinite(no) && no > 0) return `guest_${no}`;
        // 兜底：username 已是 guest_<id>（上一轮统一后的形态），提取数字部分
        const matched = /^guest_(\d+)$/.exec(String(user?.username || '').trim());
        return matched ? `guest_${matched[1]}` : 'guest';
    }

    // V3.7.13：优先展示名；OAuth 用户的 username 带唯一性 hash，不适合出现在 URL 标签。
    const displayName = sanitizeDisplayNameForUrlTag(user?.display_name);
    if (displayName) return `registered_${displayName}`;
    const username = String(user?.username || '').trim();
    return username ? `registered_${username}` : 'registered';
}

/**
 * 将用户身份标签同步到 URL hash 参数中（ut=userTypeTag）
 *
 * 该参数仅用于访问统计与人工排查（按身份分组看访问），
 * **不参与任何权限判断**：它在地址栏里，任何人手工改写都能伪造，
 * 因此不能作为「管理员登录过」的证据；鉴权只认 Authorization / X-Auth-Token 的会话令牌。
 *
 * @param {Object} user - 用户对象，包含 role / guest_no / username 字段
 */
export function syncUserRoleToUrl(user: any) {
    if (typeof window === 'undefined') return;

    const ut = buildUserTypeTag(user);

    try {
        const hash = String(window.location.hash || '#/home');
        const hashWithoutSharp = hash.startsWith('#') ? hash.slice(1) : hash;
        const [hashPathRaw, hashQueryRaw = ''] = hashWithoutSharp.split('?');
        const hashPath = hashPathRaw || '/home';
        const normalizedHashPath = hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
        const params = new URLSearchParams(hashQueryRaw);

        params.set('ut', ut);

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
