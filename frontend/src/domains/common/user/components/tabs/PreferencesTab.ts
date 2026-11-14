/**
 * 功能名称：用户中心「偏好设置」页签逻辑层
 * 说    明：采用视图层（PreferencesTab.vue）与逻辑层（PreferencesTab.ts）分离范式；
 *           管理默认底图、界面语言、测量单位制、默认智能体模型、主题及头像选择与脏状态追踪。
 */
import { computed, defineComponent, type ExtractPropTypes, type PropType, type SetupContext } from 'vue';
import { ASSET_BASE_URL } from '@/config/publicRuntime';
import { detectSystemLanguage, useLocale } from '@common/app/useLocale';

const LANGUAGE_OPTIONS = Object.freeze([
    { value: 'zh-CN', labelKey: 'preferences.languages.zh' },
    { value: 'en-US', labelKey: 'preferences.languages.en' },
]);

const UNIT_OPTIONS = Object.freeze([
    { value: 'metric', labelKey: 'preferences.units.metric' },
    { value: 'imperial', labelKey: 'preferences.units.imperial' },
]);

const THEME_OPTIONS = Object.freeze([
    {
        value: 'default',
        labelKey: 'preferences.themes.default',
        previewClass: 'theme-preview-default',
    },
    {
        value: 'blue',
        labelKey: 'preferences.themes.blue',
        previewClass: 'theme-preview-blue',
    },
]);

// language 走 setLanguagePreference 即时 SSOT，不参与「未保存」dirty / 批量保存
const PREFERENCE_FIELDS = Object.freeze([
    'default_basemap',
    'unit_system',
    'preferred_agent_model',
]);

const AVATAR_COUNT = 12;

function normalizeLanguage(value: unknown): string {
    const compact = String(value || '')
        .trim()
        .toLowerCase()
        .replace('_', '-');
    if (compact === 'en-us') return 'en-US';
    if (compact === 'zh-cn') return 'zh-CN';
    return detectSystemLanguage();
}

function normalizeUnitSystem(value: unknown): 'metric' | 'imperial' {
    const compact = String(value || '')
        .trim()
        .toLowerCase();
    return compact === 'imperial' ? 'imperial' : 'metric';
}

function normalizePreferences(raw: Record<string, any> = {}) {
    return {
        default_basemap: String(raw?.default_basemap || '').trim(),
        language: normalizeLanguage(raw?.language),
        unit_system: normalizeUnitSystem(raw?.unit_system),
        preferred_agent_model: String(raw?.preferred_agent_model || '').trim(),
    };
}

function uniqueOptions(source: unknown): Array<{ value: string; label: string }> {
    const seen = new Set<string>();
    return (Array.isArray(source) ? source : [])
        .map((option: any) => ({
            value: String(option?.value || '').trim(),
            label: String(option?.label || option?.value || '').trim(),
        }))
        .filter((option) => option.value && option.label)
        .filter((option) => {
            if (seen.has(option.value)) return false;
            seen.add(option.value);
            return true;
        });
}

type EmitsType = {
    'update:preference-draft': [payload: { key: string; value: any }];
    'save-preferences': [];
    'reset-preferences': [];
    'update:selected-avatar-index': [index: number];
    'save-avatar': [];
    'set-theme': [theme: string];
};

const propDefine = {
    preferenceDraft: {
        type: Object as PropType<Record<string, any>>,
        default: () => ({
            default_basemap: '',
            language: detectSystemLanguage(),
            unit_system: 'metric',
            preferred_agent_model: '',
        }),
    },
    savedPreferences: {
        type: Object as PropType<Record<string, any>>,
        default: () => ({
            default_basemap: '',
            language: detectSystemLanguage(),
            unit_system: 'metric',
            preferred_agent_model: '',
        }),
    },
    preferenceLoading: {
        type: Boolean,
        default: false,
    },
    preferenceSaving: {
        type: Boolean,
        default: false,
    },
    preferenceModelOptions: {
        type: Array as PropType<any[]>,
        default: () => [],
    },
    basemapPreferenceOptions: {
        type: Array as PropType<any[]>,
        default: () => [],
    },
    selectedAvatarIndex: {
        type: Number,
        default: 0,
    },
    avatarSaving: {
        type: Boolean,
        default: false,
    },
    user: {
        type: Object as PropType<Record<string, any> | null>,
        default: null,
    },
    currentAvatarIndex: {
        type: Number,
        default: 0,
    },
    currentTheme: {
        type: String,
        default: 'default',
    },
} as const;

export type PreferencesTabProps = ExtractPropTypes<typeof propDefine>;

export default defineComponent({
    name: 'PreferencesTab',
    props: propDefine,
    emits: [
        'update:preference-draft',
        'save-preferences',
        'reset-preferences',
        'update:selected-avatar-index',
        'save-avatar',
        'set-theme',
    ],
    setup(props, ctx) {
        return new Instance(props, ctx);
    },
});

export class Instance {
    public LANGUAGE_OPTIONS = LANGUAGE_OPTIONS;
    public UNIT_OPTIONS = UNIT_OPTIONS;
    public THEME_OPTIONS = THEME_OPTIONS;
    public AVATAR_COUNT = AVATAR_COUNT;
    public t!: (key: string, params?: Record<string, any>) => string;

    public draftPreferences;
    public savedPreferenceState;
    public dirtyFields;
    public hasPreferenceChanges;
    public preferenceHint;
    public basemapOptions;
    public modelOptions;
    public selectedBasemapUnavailable;
    public selectedModelUnavailable;
    public thirdPartyAvatarUrl;
    public hasThirdPartyAvatar;
    public avatarChanged;
    public showAvatarSave;
    public avatarHint;

    constructor(
        private props: PreferencesTabProps,
        private ctx: SetupContext<EmitsType>,
    ) {
        const { t } = useLocale();
        this.t = t;

        this.draftPreferences = computed(() => normalizePreferences(this.props.preferenceDraft));
        this.savedPreferenceState = computed(() =>
            normalizePreferences(this.props.savedPreferences),
        );

        this.dirtyFields = computed(() => {
            return PREFERENCE_FIELDS.reduce<Record<string, boolean>>((result, key) => {
                result[key] =
                    (this.draftPreferences.value as any)[key] !==
                    (this.savedPreferenceState.value as any)[key];
                return result;
            }, {});
        });

        this.hasPreferenceChanges = computed(() => {
            return Object.values(this.dirtyFields.value).some(Boolean);
        });

        this.preferenceHint = computed(() => {
            if (this.props.preferenceSaving) return this.t('common.saving');
            if (this.props.preferenceLoading) return this.t('common.syncing');
            return this.hasPreferenceChanges.value
                ? this.t('preferences.status.dirty')
                : this.t('common.saved');
        });

        this.basemapOptions = computed(() => uniqueOptions(this.props.basemapPreferenceOptions));

        this.modelOptions = computed(() => {
            const seen = new Set<string>();
            return (
                Array.isArray(this.props.preferenceModelOptions)
                    ? this.props.preferenceModelOptions
                    : []
            )
                .map((modelId) => String(modelId || '').trim())
                .filter(Boolean)
                .filter((modelId) => {
                    if (seen.has(modelId)) return false;
                    seen.add(modelId);
                    return true;
                });
        });

        this.selectedBasemapUnavailable = computed(() => {
            const value = this.draftPreferences.value.default_basemap;
            return Boolean(value && !this.basemapOptions.value.some((opt) => opt.value === value));
        });

        this.selectedModelUnavailable = computed(() => {
            const value = this.draftPreferences.value.preferred_agent_model;
            return Boolean(value && !this.modelOptions.value.includes(value));
        });

        this.thirdPartyAvatarUrl = computed(() => String(this.props.user?.avatar_url || '').trim());

        this.hasThirdPartyAvatar = computed(() => {
            return /^https?:\/\//i.test(this.thirdPartyAvatarUrl.value);
        });

        this.avatarChanged = computed(() => {
            return this.props.selectedAvatarIndex !== this.props.currentAvatarIndex;
        });

        this.showAvatarSave = computed(() => {
            return this.hasThirdPartyAvatar.value || this.avatarChanged.value;
        });

        this.avatarHint = computed(() => {
            if (this.props.avatarSaving) return this.t('common.saving');
            if (this.hasThirdPartyAvatar.value) return this.t('preferences.status.thirdPartyAvatar');
            return this.avatarChanged.value
                ? this.t('preferences.status.avatarDirty')
                : this.t('preferences.status.currentAvatar');
        });
    }

    public get preferenceSaving() {
        return this.props.preferenceSaving;
    }

    public get preferenceLoading() {
        return this.props.preferenceLoading;
    }

    public get currentTheme() {
        return this.props.currentTheme;
    }

    public get avatarSaving() {
        return this.props.avatarSaving;
    }

    public get selectedAvatarIndex() {
        return this.props.selectedAvatarIndex;
    }

    public get currentAvatarIndex() {
        return this.props.currentAvatarIndex;
    }

    public isDirty = (key: string) => {
        if (key === 'language') return false;
        return Boolean(this.dirtyFields.value[key]);
    };

    public getAvatarSrc = (avatarIndex: number) => {
        const normalizedBase = ASSET_BASE_URL.endsWith('/') ? ASSET_BASE_URL : `${ASSET_BASE_URL}/`;
        return `${normalizedBase}avatars/avatar-${avatarIndex}.svg`;
    };

    public updateDraftField = (key: string, value: any) => {
        this.ctx.emit('update:preference-draft', { key, value });
    };

    public handleSelectChange = (key: string, event: Event) => {
        const target = event.target as HTMLSelectElement | null;
        this.updateDraftField(key, target?.value ?? '');
    };

    public handleSavePreferences = () => {
        if (
            this.props.preferenceSaving ||
            this.props.preferenceLoading ||
            !this.hasPreferenceChanges.value
        ) {
            return;
        }
        this.ctx.emit('save-preferences');
    };

    public handleResetPreferences = () => {
        if (
            this.props.preferenceSaving ||
            this.props.preferenceLoading ||
            !this.hasPreferenceChanges.value
        ) {
            return;
        }
        this.ctx.emit('reset-preferences');
    };

    public handleSetTheme = (theme: string) => {
        if (theme === this.props.currentTheme) return;
        this.ctx.emit('set-theme', theme);
    };

    public handleSelectAvatar = (index: number) => {
        if (this.props.avatarSaving) return;
        this.ctx.emit('update:selected-avatar-index', index);
    };

    public handleResetAvatar = () => {
        if (this.props.avatarSaving || !this.avatarChanged.value) return;
        this.ctx.emit('update:selected-avatar-index', this.props.currentAvatarIndex);
    };

    public handleSaveAvatar = () => {
        if (this.props.avatarSaving || !this.showAvatarSave.value) return;
        this.ctx.emit('save-avatar');
    };
}
