/**
 * useAccountPreferences.ts — 账户中心用户偏好与预设头像持久化子域
 *
 * 从 FloatingAccountPanel 抽离偏好草稿同步、智能体模型列表、底图预设过滤及头像保存逻辑，
 * 避免宿主面板混杂过多跨标签业务细节。
 */
import { computed, ref, watch, type Ref } from 'vue';
import { apiAgentListModels, apiAuthChangeAvatar } from '@/api/backend';
import { BASEMAP_OPTIONS } from '@/constants';
import { isBasemapPreferenceSelectable, type useUserPreferencesStore } from '@/stores';
import { detectSystemLanguage } from '@common/app/useLocale';

interface MessageLike {
    success: (msg: string) => void;
    warning: (msg: string) => void;
    error: (msg: string) => void;
}

export interface UseAccountPreferencesOptions {
    t: (key: string, params?: Record<string, any>) => string;
    message: MessageLike;
    userPreferencesStore: ReturnType<typeof useUserPreferencesStore>;
    mergeUserPatch: (nextUser?: any) => any;
    oauthAvatarUrl?: Ref<string>;
}

/** 仅支持 zh-CN / en-US；其它（含空值、历史脏数据）= 未设置有效偏好 → 跟随浏览器默认 */
export function normalizeAccountPreferences(raw: any = {}) {
    const languageRaw = String(raw?.language || '')
        .trim()
        .toLowerCase()
        .replace('_', '-');
    const language =
        languageRaw === 'en-us'
            ? 'en-US'
            : languageRaw === 'zh-cn'
              ? 'zh-CN'
              : detectSystemLanguage();
    const unitRaw = String(raw?.unit_system || '')
        .trim()
        .toLowerCase();
    return {
        default_basemap: String(raw?.default_basemap || '').trim(),
        language,
        unit_system: unitRaw === 'imperial' ? 'imperial' : 'metric',
        preferred_agent_model: String(raw?.preferred_agent_model || '').trim(),
    };
}

export function useAccountPreferences(options: UseAccountPreferencesOptions) {
    const selectedAvatarIndex = ref(0);
    const avatarSaving = ref(false);
    const oauthAvatarFailed = ref(false);

    const preferenceDraft = ref<any>({
        default_basemap: '',
        // 无偏好时跟随浏览器默认语言（中文 → zh-CN，其它 → en-US）
        language: detectSystemLanguage(),
        unit_system: 'metric',
        preferred_agent_model: '',
    });
    const preferenceSaving = ref(false);
    const preferenceModelOptions = ref<string[]>([]);

    /** 过滤无法作为偏好还原的特殊 preset（custom 需配套 URL、local_tiles_preset 依赖本地环境） */
    const basemapPreferenceOptions = computed(() => {
        const list = Array.isArray(BASEMAP_OPTIONS) ? BASEMAP_OPTIONS : [];
        return list.filter((item: any) => isBasemapPreferenceSelectable(item?.value));
    });

    if (options.oauthAvatarUrl) {
        watch(options.oauthAvatarUrl, () => {
            oauthAvatarFailed.value = false;
        });
    }

    // 语言偏好变化：本机 SSOT + 已登录时写远端
    watch(
        () => preferenceDraft.value.language,
        (language) => {
            void options.userPreferencesStore.setLanguagePreference(language);
        },
    );

    const syncPreferenceDraftFromStore = (): void => {
        preferenceDraft.value = normalizeAccountPreferences(
            options.userPreferencesStore.preferences,
        );
    };

    const loadUserPreferences = async ({ silent = true } = {}): Promise<void> => {
        try {
            await options.userPreferencesStore.loadPreferences({ force: true, silent });
            syncPreferenceDraftFromStore();
        } catch (error: any) {
            if (!silent) {
                options.message.error(
                    String(error?.message || options.t('account.messages.prefsLoadFailed')),
                );
            }
        }
    };

    const loadPreferenceModelOptions = async ({ silent = true } = {}): Promise<void> => {
        try {
            const result: any = await apiAgentListModels();
            const data = result?.data || result || {};
            const models = Array.isArray(data?.models) ? data.models : [];
            preferenceModelOptions.value = models
                .filter((item: any) => item?.chat_compatible !== false)
                .map((item: any) => String(item?.id || '').trim())
                .filter(Boolean)
                .filter(
                    (item: string, index: number, array: string[]) => array.indexOf(item) === index,
                );
        } catch (error: any) {
            preferenceModelOptions.value = [];
            if (!silent) {
                options.message.warning(
                    String(error?.message || options.t('account.messages.modelsLoadFailed')),
                );
            }
        }
    };

    const handleSavePreferences = async (): Promise<void> => {
        if (preferenceSaving.value) return;
        preferenceSaving.value = true;
        try {
            const saved: any = await options.userPreferencesStore.savePreferences(
                normalizeAccountPreferences(preferenceDraft.value) as any,
            );
            preferenceDraft.value = normalizeAccountPreferences(saved);
            options.message.success(options.t('account.messages.prefsSaved'));
        } catch (error: any) {
            options.message.error(
                String(error?.message || options.t('account.messages.prefsSaveFailed')),
            );
        } finally {
            preferenceSaving.value = false;
        }
    };

    const handleSaveAvatar = async (): Promise<void> => {
        if (avatarSaving.value) return;
        avatarSaving.value = true;
        try {
            const result: any = await apiAuthChangeAvatar(selectedAvatarIndex.value);
            if (result?.status === 'success') {
                options.message.success(options.t('account.messages.avatarUpdated'));
                options.mergeUserPatch(
                    result?.user || {
                        avatar_index: Number(result?.avatar_index ?? selectedAvatarIndex.value),
                    },
                );
            } else {
                options.message.error(options.t('account.messages.avatarUpdateFailed'));
            }
        } catch (error: any) {
            const detail = String(error?.message || '').trim();
            options.message.error(detail || options.t('account.messages.avatarUpdateFailed'));
        } finally {
            avatarSaving.value = false;
        }
    };

    return {
        selectedAvatarIndex,
        avatarSaving,
        oauthAvatarFailed,
        preferenceDraft,
        preferenceSaving,
        preferenceModelOptions,
        basemapPreferenceOptions,
        syncPreferenceDraftFromStore,
        loadUserPreferences,
        loadPreferenceModelOptions,
        handleSavePreferences,
        handleSaveAvatar,
    };
}
