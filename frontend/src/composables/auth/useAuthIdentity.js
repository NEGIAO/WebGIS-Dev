const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{6,64}$/;
const DISPLAY_NAME_CONTROL_REGEX = /[\x00-\x1f\x7f]/;

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

export function validateDisplayName(value) {
    const normalized = normalizeDisplayName(value);
    if (!normalized) {
        return { valid: false, message: '请填写昵称' };
    }
    if (normalized.length > 40) {
        return { valid: false, message: '昵称长度不能超过 40 个字符' };
    }
    if (DISPLAY_NAME_CONTROL_REGEX.test(normalized)) {
        return { valid: false, message: '昵称不能包含控制字符' };
    }
    return { valid: true, value: normalized, message: '' };
}

export function getUserDisplayName(user) {
    return String(user?.display_name || user?.username || user?.email || '用户').trim();
}
