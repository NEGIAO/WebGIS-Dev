import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { apiAuthGetPreferences, apiAuthUpdatePreferences } from '../api/backend';
import { getAuthToken } from '../services/auth';
import { normalizeLocaleLanguage, setLocaleLanguage } from '../composables/useLocale';

const USER_PREFERENCES_STORAGE_KEY = 'webgis_user_preferences_cache';
export const USER_PREFERENCE_BASEMAP_KEY = 'webgis_pref_default_basemap';
export const USER_PREFERENCE_LANGUAGE_KEY = 'webgis_pref_language';
export const USER_PREFERENCE_UNIT_KEY = 'webgis_pref_unit_system';
export const USER_PREFERENCE_AGENT_MODEL_KEY = 'webgis_pref_agent_model';

export type UserPreferences = {
    default_basemap: string;
    language: string;
    unit_system: 'metric' | 'imperial';
    preferred_agent_model: string;
};

const DEFAULT_PREFERENCES: UserPreferences = {
    default_basemap: '',
    language: 'zh-CN',
    unit_system: 'metric',
    preferred_agent_model: '',
};

function getStorage(): Storage | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
}

function normalizeLanguage(value: unknown): string {
    return normalizeLocaleLanguage(value);
}

function normalizeUnitSystem(value: unknown): 'metric' | 'imperial' {
    const compact = String(value ?? '')
        .trim()
        .toLowerCase();
    return compact === 'imperial' ? 'imperial' : 'metric';
}

function normalizeBasemap(value: unknown): string {
    const compact = String(value ?? '').trim();
    if (!compact) return '';
    return compact.slice(0, 80);
}

function normalizeAgentModel(value: unknown): string {
    const compact = String(value ?? '').trim();
    if (!compact) return '';
    return compact.slice(0, 160);
}

function normalizePreferences(raw: any): UserPreferences {
    return {
        default_basemap: normalizeBasemap(raw?.default_basemap),
        language: normalizeLanguage(raw?.language),
        unit_system: normalizeUnitSystem(raw?.unit_system),
        preferred_agent_model: normalizeAgentModel(raw?.preferred_agent_model),
    };
}

function savePreferenceRuntimeCache(preferences: UserPreferences): void {
    const storage = getStorage();
    if (!storage) return;

    storage.setItem(USER_PREFERENCE_BASEMAP_KEY, preferences.default_basemap);
    storage.setItem(USER_PREFERENCE_LANGUAGE_KEY, preferences.language);
    storage.setItem(USER_PREFERENCE_UNIT_KEY, preferences.unit_system);
    storage.setItem(USER_PREFERENCE_AGENT_MODEL_KEY, preferences.preferred_agent_model);
}

export function readCachedPreferredAgentModel(): string {
    const storage = getStorage();
    if (!storage) return '';
    return normalizeAgentModel(storage.getItem(USER_PREFERENCE_AGENT_MODEL_KEY));
}

/**
 * 不可作为默认底图偏好的特殊 preset：
 * custom 需配套自定义 URL（偏好中无 URL 上下文），local_tiles_preset 依赖本地瓦片环境
 */
const PREFERENCE_EXCLUDED_BASEMAPS = new Set(['custom', 'local_tiles_preset']);

/**
 * 判断 preset id 是否可作为默认底图偏好
 */
export function isBasemapPreferenceSelectable(presetId: unknown): boolean {
    const id = String(presetId ?? '').trim();
    return !!id && !PREFERENCE_EXCLUDED_BASEMAPS.has(id);
}

/**
 * 同步读取用户偏好的默认底图 preset id（runtime 缓存）
 * 供 2D MapContainer / 3D CesiumContainer 初始化时零依赖读取；
 * 未设置或为特殊 preset（custom/local_tiles_preset，无法脱离上下文还原）时返回空串
 */
export function readCachedPreferredBasemap(): string {
    const storage = getStorage();
    if (!storage) return '';
    const value = normalizeBasemap(storage.getItem(USER_PREFERENCE_BASEMAP_KEY));
    return isBasemapPreferenceSelectable(value) ? value : '';
}

export const useUserPreferencesStore = defineStore('userPreferencesStore', () => {
    const preferences = ref<UserPreferences>({ ...DEFAULT_PREFERENCES });
    const loading = ref(false);
    const saving = ref(false);
    const initialized = ref(false);

    const preferredAgentModel = computed(() =>
        String(preferences.value.preferred_agent_model || '').trim(),
    );

    function persistToStorage(): void {
        const storage = getStorage();
        if (!storage) return;
        storage.setItem(USER_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences.value));
        savePreferenceRuntimeCache(preferences.value);
    }

    function applyRuntimePreferences(): void {
        savePreferenceRuntimeCache(preferences.value);
        setLocaleLanguage(preferences.value.language || 'zh-CN');
    }

    function loadFromStorage(): void {
        const storage = getStorage();
        if (!storage) return;

        const raw = storage.getItem(USER_PREFERENCES_STORAGE_KEY);
        if (!raw) {
            preferences.value = { ...DEFAULT_PREFERENCES };
            applyRuntimePreferences();
            return;
        }

        try {
            preferences.value = normalizePreferences(JSON.parse(raw));
            applyRuntimePreferences();
        } catch {
            storage.removeItem(USER_PREFERENCES_STORAGE_KEY);
            preferences.value = { ...DEFAULT_PREFERENCES };
            applyRuntimePreferences();
        }
    }

    async function loadPreferences(
        options: { force?: boolean; silent?: boolean } = {},
    ): Promise<UserPreferences> {
        const { force = false, silent = true } = options;

        if (!force && initialized.value) {
            return preferences.value;
        }

        loadFromStorage();

        const token = getAuthToken();
        if (!token) {
            initialized.value = true;
            return preferences.value;
        }

        loading.value = true;
        try {
            const result = await apiAuthGetPreferences();
            const payload =
                result && typeof result === 'object' && 'data' in result
                    ? (result as any).data
                    : result;
            const remote = normalizePreferences(payload?.preferences || payload || {});
            preferences.value = remote;
            persistToStorage();
            applyRuntimePreferences();
            initialized.value = true;
            return preferences.value;
        } catch (error) {
            if (!silent) {
                throw error;
            }
            initialized.value = true;
            return preferences.value;
        } finally {
            loading.value = false;
        }
    }

    async function savePreferences(partial: Partial<UserPreferences>): Promise<UserPreferences> {
        const normalizedPayload: Partial<UserPreferences> = {};

        if (Object.prototype.hasOwnProperty.call(partial, 'default_basemap')) {
            normalizedPayload.default_basemap = normalizeBasemap(partial.default_basemap);
        }
        if (Object.prototype.hasOwnProperty.call(partial, 'language')) {
            normalizedPayload.language = normalizeLanguage(partial.language);
        }
        if (Object.prototype.hasOwnProperty.call(partial, 'unit_system')) {
            normalizedPayload.unit_system = normalizeUnitSystem(partial.unit_system);
        }
        if (Object.prototype.hasOwnProperty.call(partial, 'preferred_agent_model')) {
            normalizedPayload.preferred_agent_model = normalizeAgentModel(
                partial.preferred_agent_model,
            );
        }

        saving.value = true;
        try {
            const result = await apiAuthUpdatePreferences(normalizedPayload);
            const payload =
                result && typeof result === 'object' && 'data' in result
                    ? (result as any).data
                    : result;
            const merged = normalizePreferences({
                ...preferences.value,
                ...(payload?.preferences || payload || {}),
            });
            preferences.value = merged;
            persistToStorage();
            applyRuntimePreferences();
            initialized.value = true;
            return preferences.value;
        } finally {
            saving.value = false;
        }
    }

    async function bootstrap(): Promise<void> {
        loadFromStorage();
        applyRuntimePreferences();
        await loadPreferences({ force: true, silent: true });
    }

    return {
        preferences,
        loading,
        saving,
        initialized,
        preferredAgentModel,
        loadFromStorage,
        loadPreferences,
        savePreferences,
        bootstrap,
        applyRuntimePreferences,
    };
});
