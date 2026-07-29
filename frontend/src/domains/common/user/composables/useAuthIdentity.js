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
 * 取用户展示名；无则返回空串，由 UI 侧 t('common.user') 兜底。
 * @param {object|null|undefined} user
 * @returns {string}
 */
export function getUserDisplayName(user) {
    return String(user?.display_name || user?.username || user?.email || '').trim();
}
