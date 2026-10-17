const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{6,64}$/;
function hasControlCharacter(value) {
    return Array.from(String(value || '')).some((char) => {
        const code = char.charCodeAt(0);
        return code <= 31 || code === 127;
    });
}

export function normalizeEmail(raw) {
    return String(raw || '').trim().toLowerCase();
}

export function normalizeDisplayName(raw) {
    return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 40).trim();
}

export function normalizeCredential(raw) {
    return String(raw || '').trim();
}

export function isValidEmail(value) {
    return EMAIL_REGEX.test(normalizeEmail(value));
}

export function isValidPassword(value) {
    return PASSWORD_REGEX.test(String(value || ''));
}

/**
 * 校验展示昵称。返回 i18n 键 path（code），由调用方 t(code) 渲染，避免硬编码文案。
 * @param {unknown} value
 * @returns {{ valid: true, value: string, code?: undefined } | { valid: false, code: string, value?: undefined }}
 */
export function validateDisplayName(value) {
    const normalized = normalizeDisplayName(value);
    if (!normalized) {
        return { valid: false, code: 'auth.displayNameRequired' };
    }
    if (normalized.length > 40) {
        return { valid: false, code: 'auth.displayNameTooLong' };
    }
    if (hasControlCharacter(normalized)) {
        return { valid: false, code: 'auth.displayNameControlChars' };
    }
    return { valid: true, value: normalized };
}

/**
 * 由访客设备 ID（guest_uid）派生稳定兜底序号：同设备恒定、范围 1..999。
 * 仅当后端未回传 guest_no（guest_identity_records.id 自增真序号，1 起递增）
 * 时使用，例如本地存有旧版本登录态的会话。
 * @param {unknown} rawUid
 * @returns {number} 1..999，uid 为空返回 0
 */
function guestIndexFromUid(rawUid) {
    const uid = String(rawUid ?? '').trim();
    if (!uid) return 0;
    let hash = 5381;
    for (const ch of uid) {
        hash = ((hash * 33) ^ ch.codePointAt(0)) >>> 0;
    }
    return (hash % 999) + 1;
}

/**
 * 取用户展示名；无则返回空串，由 UI 侧 t('common.user') 兜底。
 * 游客（guest_uid 存在 / role=visitor）且未设置昵称时展示为 guest_<序号>
 * （后端 guest_identity_records 自增 real id，形如 guest_1、guest_108）。
 * 兼容两类匿名形态：用户名为「Guest」（客户端兜底会话）或
 * 「guest_<hex16>」（后端确定性派生，历史 display_name 也会被写入该形态）。
 * @param {object|null|undefined} user
 * @param {string} [guestLabel='guest'] 序号前缀
 * @returns {string}
 */
export function getUserDisplayName(user, guestLabel = 'guest') {
    const uid = user?.guest_uid;
    const role = String(user?.role || '').trim();
    if (uid !== undefined || role === 'visitor') {
        const base = String(user?.display_name || user?.username || user?.email || '').trim();
        const anonymized = !base || /^guest$/i.test(base) || /^guest_[0-9a-f]{6,}$/i.test(base);
        if (anonymized) {
            const label = String(guestLabel || '').trim() || 'guest';
            const realNo = Number(user?.guest_no);
            const no = Number.isFinite(realNo) && realNo > 0 ? realNo : guestIndexFromUid(uid);
            return `${label}_${no}`;
        }
        return base;
    }
    return String(user?.display_name || user?.username || user?.email || '').trim();
}
