/**
 * 功能名称：注册 / 登录页
 * 日    期：2026/11/13（范式化改造；2026/11/14 拆分验证流与 Google One Tap 独立领域）
 * 说    明：登录、注册、OAuth 入口、游客一键登录与登录后重定向编排；
 *          邮箱验证码/迁移绑邮/密码重置委托 useAuthVerificationFlows，Google One Tap 委托 useGoogleOneTapAuth。
 */
import { computed, defineComponent, onMounted, ref, type ExtractPropTypes } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
    AlertCircle,
    Check,
    CheckCircle2,
    Footprints,
    Home,
    Info,
    KeyRound,
    Loader2,
    Lock,
    LogIn,
    Mail,
    MailCheck,
    Send,
    ShieldCheck,
    Unlock,
    User,
    UserPlus,
    X,
} from '@lucide/vue';
import { useLocale } from '@common/app/useLocale';
import { useTimerRegistry } from '@common/composables/useTimerRegistry';
import { useMessage } from '@common/shell/useMessage';
import {
    isValidEmail,
    isValidPassword,
    normalizeCredential,
    normalizeEmail,
    validateDisplayName,
} from '@common/user/composables/useAuthIdentity';
import {
    consumePersistedPositionCode,
    getAuthToken,
    getAuthUser,
    getOrCreateGuestDeviceId,
    injectPositionCodeToPath,
    peekPersistedPositionCode,
    setAuthSession,
    syncUserRoleToUrl,
} from '@common/user/services/auth';
// 深导入：注册页与落地页同属首屏入口，禁止经 '../stores' 聚合桶取 store
import { useUserPreferencesStore } from '@common/user/stores/useUserPreferencesStore';
import { apiAuthLogin, apiAuthRegister, apiLocationTrackVisit, redirectToOAuthProvider } from '../api/backend';
import { ASSET_BASE_URL, GUEST_PASSWORD } from '../config/publicRuntime';
import AuthDecorBackground from './components/AuthDecorBackground.vue';
import AuthGlobeStage from './components/AuthGlobeStage.vue';
import { useAuthVerificationFlows } from './composables/useAuthVerificationFlows';
import { useGoogleOneTapAuth } from './composables/useGoogleOneTapAuth';
import { consumeViewTransitionNavFlag } from './composables/useViewTransitionNavigation';

// 语言切换器标签用固定文案（各自母语书写），不依赖懒加载 i18n chunk
const LANGUAGE_OPTIONS = Object.freeze([
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'EN' },
]);

// 一、Emits（本组件无对外事件）

// 二、Props（本组件无入参）
const propDefine = {} as const;

export type RegisterViewProps = ExtractPropTypes<typeof propDefine>;

// 三、组件注册入口
export default defineComponent({
    name: 'RegisterView',
    components: {
        AuthDecorBackground,
        AuthGlobeStage,
        AlertCircle,
        Check,
        CheckCircle2,
        Footprints,
        Home,
        Info,
        KeyRound,
        Loader2,
        Lock,
        LogIn,
        Mail,
        MailCheck,
        Send,
        ShieldCheck,
        Unlock,
        User,
        UserPlus,
        X,
    },
    props: propDefine,
    emits: [],
    setup() {
        return new Instance();
    },
});

// 四、组件实例
export class Instance {
    public languageOptions = LANGUAGE_OPTIONS;

    /** 模板以 :is 形式消费的图标（components 注册不会进入实例类型，需显式暴露） */
    public AlertCircleIcon = AlertCircle;
    public CheckCircle2Icon = CheckCircle2;
    public Loader2Icon = Loader2;
    public MailIcon = Mail;
    public UserIcon = User;

    // ── 表单状态 ──
    public mode = ref('login');
    /** 确认登录按钮悬停/聚焦时置 true，驱动装饰层的渐变色轮加速 */
    public confirmHovered = ref(false);
    public username = ref('');
    public password = ref('');
    public confirmPassword = ref('');
    public selectedAvatarIndex = ref(0);
    public isSubmitting = ref(false);
    public formMessage = ref('');
    public formStatus = ref('');

    // ── 邮箱 & 验证码（由 useAuthVerificationFlows 提供） ──
    public email;
    public emailCode;
    public isSendingCode;
    public isVerifyingCode;
    public codeCountdown;
    public emailVerified;
    public emailCheckStatus;
    public emailCheckMessage;
    public handleSendCode;
    public handleVerifyCode;
    private resetEmailVerification: () => void;

    // ── 旧账号绑定邮箱（由 useAuthVerificationFlows 提供） ──
    public requiresEmailBinding;
    public bindEmail;
    public bindCode;
    public bindCurrentPassword;
    public bindCodeCountdown;
    public isBindingCodeSending;
    public getStoredBindingUser;
    public handleBindSendCode;
    public handleBindEmailSubmit;
    public cancelBinding;

    // ── 密码重置（由 useAuthVerificationFlows 提供） ──
    public showResetPanel;
    public resetEmail;
    public resetCode;
    public resetNewPassword;
    public resetConfirmPassword;
    public resetStep;
    public isResetSubmitting;
    public resetCodeCountdown;
    public resetCodeSent;
    public openResetPanel;
    public closeResetPanel;
    public handleResetSendCode;
    public handleResetSubmit;

    // ── Google One Tap（由 useGoogleOneTapAuth 提供） ──
    public handleGoogleOneTap;
    public initGoogleOneTap;

    /** Hugging Face 官方 logo（品牌资产彩色版） */
    public hfLogoUrl = '';
    /** 品牌徽牌 mask 遮罩源（与 img 同源同缓存） */
    public brandLogoUrl = '';

    /** 由 Landing 的形变过渡进入时跳过入场动画（否则浏览器抓到透明卡片快照） */
    public arrivedByTransition = false;

    public t!: (key: string, params?: Record<string, any>) => string;
    public language: any;

    private router: ReturnType<typeof useRouter>;
    private route: ReturnType<typeof useRoute>;
    private message: ReturnType<typeof useMessage>;
    private userPreferencesStore: ReturnType<typeof useUserPreferencesStore>;
    private timers = useTimerRegistry();

    constructor() {
        this.router = useRouter();
        this.route = useRoute();
        this.message = useMessage();
        const { t, language } = useLocale();
        this.t = t;
        this.language = language;
        this.userPreferencesStore = useUserPreferencesStore();
        this.arrivedByTransition = consumeViewTransitionNavFlag();
        this.hfLogoUrl = this.resolvePublicAssetPath('images/hf-logo.svg');
        this.brandLogoUrl = this.resolvePublicAssetPath('images/icon.webp');

        const verificationFlows = useAuthVerificationFlows({
            username: this.username,
            t: this.t,
            message: this.message,
            router: this.router,
            setFormState: this.setFormState,
            setSubmitting: (submitting: boolean) => {
                this.isSubmitting.value = submitting;
            },
            resolveRedirectTarget: () => this.resolveRedirectTarget(),
        });

        this.email = verificationFlows.email;
        this.emailCode = verificationFlows.emailCode;
        this.isSendingCode = verificationFlows.isSendingCode;
        this.isVerifyingCode = verificationFlows.isVerifyingCode;
        this.codeCountdown = verificationFlows.codeCountdown;
        this.emailVerified = verificationFlows.emailVerified;
        this.emailCheckStatus = verificationFlows.emailCheckStatus;
        this.emailCheckMessage = verificationFlows.emailCheckMessage;
        this.handleSendCode = verificationFlows.handleSendCode;
        this.handleVerifyCode = verificationFlows.handleVerifyCode;
        this.resetEmailVerification = verificationFlows.resetEmailVerification;

        this.requiresEmailBinding = verificationFlows.requiresEmailBinding;
        this.bindEmail = verificationFlows.bindEmail;
        this.bindCode = verificationFlows.bindCode;
        this.bindCurrentPassword = verificationFlows.bindCurrentPassword;
        this.bindCodeCountdown = verificationFlows.bindCodeCountdown;
        this.isBindingCodeSending = verificationFlows.isBindingCodeSending;
        this.getStoredBindingUser = verificationFlows.getStoredBindingUser;
        this.handleBindSendCode = verificationFlows.handleBindSendCode;
        this.handleBindEmailSubmit = verificationFlows.handleBindEmailSubmit;
        this.cancelBinding = verificationFlows.cancelBinding;

        this.showResetPanel = verificationFlows.showResetPanel;
        this.resetEmail = verificationFlows.resetEmail;
        this.resetCode = verificationFlows.resetCode;
        this.resetNewPassword = verificationFlows.resetNewPassword;
        this.resetConfirmPassword = verificationFlows.resetConfirmPassword;
        this.resetStep = verificationFlows.resetStep;
        this.isResetSubmitting = verificationFlows.isResetSubmitting;
        this.resetCodeCountdown = verificationFlows.resetCodeCountdown;
        this.resetCodeSent = verificationFlows.resetCodeSent;
        this.openResetPanel = verificationFlows.openResetPanel;
        this.closeResetPanel = verificationFlows.closeResetPanel;
        this.handleResetSendCode = verificationFlows.handleResetSendCode;
        this.handleResetSubmit = verificationFlows.handleResetSubmit;

        const googleOneTap = useGoogleOneTapAuth({
            t: this.t,
            message: this.message,
            router: this.router,
            setFormState: this.setFormState,
            setSubmitting: (submitting: boolean) => {
                this.isSubmitting.value = submitting;
            },
            resolveRedirectTarget: () => this.resolveRedirectTarget(),
        });
        this.handleGoogleOneTap = googleOneTap.handleGoogleOneTap;
        this.initGoogleOneTap = googleOneTap.initGoogleOneTap;

        this.init();
    }

    //#region 派生

    public avatarOptions = computed(() =>
        Array.from({ length: 12 }, (_, index) => ({
            index,
            label: this.t('auth.avatarOption', { index: index + 1 }),
            src: this.resolvePublicAssetPath(`avatars/avatar-${index}.svg`),
        })),
    );

    //#endregion

    //#region 生命周期

    private init(): void {
        onMounted(async () => {
            await this.handleOAuthErrorQuery();

            const token = getAuthToken();
            if (token) {
                const storedUser = getAuthUser();
                if (storedUser?.requires_email_binding) {
                    this.requiresEmailBinding.value = true;
                    this.setFormState('success', this.t('auth.pleaseBindEmailToMigrate'));
                    return;
                }
                await this.router.replace(this.resolveRedirectTarget());
                consumePersistedPositionCode();
                return;
            }

            void this.initGoogleOneTap();

            // 自动发送定位追踪请求（异步，失败静默）
            apiLocationTrackVisit({
                userAgent: navigator?.userAgent,
                referrer: document?.referrer,
            })
                .then((result: any) => {
                    if (result?.tracked) {
                        console.warn('[Location Tracking] 访问已记录:', {
                            ip: result?.ip,
                            city: result?.city,
                            province: result?.province,
                            country: result?.country,
                        });
                    }
                })
                .catch((error: any) => {
                    console.warn('[Location Tracking] 追踪请求失败:', error?.message);
                });

            // 登录页就绪 1 秒后才开始后台预热 GIS 资产，避免首屏带宽争抢
            if (typeof window !== 'undefined') {
                this.timers.later(() => {
                    if (this.route.name !== 'register') return;
                    import('@common/data-import/deferredGisWarmupLauncher')
                        .then((mod: any) => mod.launchDeferredGisWarmup())
                        .catch((error: any) => {
                            console.warn(
                                '[GIS Prewarm] 预热失败(不影响登录流程):',
                                error?.message || error,
                            );
                        });
                }, 1000);
            }
        });
    }

    /** OAuth 回调错误 query：提示一次后清掉，避免刷新重复弹 */
    private async handleOAuthErrorQuery(): Promise<void> {
        const oauthStatus = String(this.route.query?.status || '')
            .trim()
            .toLowerCase();
        const oauthMessage = String(this.route.query?.message || '').trim();
        if (oauthStatus !== 'error' || !oauthMessage) return;

        this.setFormState('error', oauthMessage);
        this.message.error(oauthMessage);

        const nextQuery: any = { ...this.route.query };
        delete nextQuery.status;
        delete nextQuery.message;
        delete nextQuery.provider;
        await this.router.replace({ name: 'register', query: nextQuery });
    }

    //#endregion

    //#region 基础工具

    public setFormState = (status = '', text = ''): void => {
        this.formStatus.value = status;
        this.formMessage.value = text;
    };

    public normalizeUsername = (raw: any) => normalizeCredential(raw);

    public resolvePublicAssetPath = (relativePath: string): string => {
        const normalizedBase = ASSET_BASE_URL.endsWith('/') ? ASSET_BASE_URL : `${ASSET_BASE_URL}/`;
        const normalizedPath = String(relativePath || '').replace(/^\/+/, '');
        return `${normalizedBase}${normalizedPath}`;
    };

    private resolveRedirectTarget(): string {
        const redirect = String(this.route.query?.redirect || '/home').trim();
        const safeRedirect = redirect.startsWith('/') ? redirect : '/home';
        const persistedPositionCode = peekPersistedPositionCode();
        return injectPositionCodeToPath(safeRedirect, persistedPositionCode);
    }

    /** 与账号中心偏好同一全局开关：本机 SSOT + 登录后回写远端 */
    public switchLanguage = (nextLanguage: string): void => {
        if (!nextLanguage || nextLanguage === this.language.value) return;
        void this.userPreferencesStore.setLanguagePreference(nextLanguage);
    };

    public switchMode = (nextMode: string): void => {
        this.mode.value = nextMode;
        this.requiresEmailBinding.value = false;
        this.setFormState('', '');
        if (nextMode === 'login') {
            this.confirmPassword.value = '';
            this.resetEmailVerification();
            this.selectedAvatarIndex.value = 0;
        }
    };

    /** 跳转 Google/GitHub/Hugging Face OAuth 登录入口 */
    public handleOAuthLogin = (provider: 'google' | 'github' | 'huggingface'): void => {
        this.setFormState('', '');
        redirectToOAuthProvider(provider);
    };

    //#endregion

    //#region 登录与注册

    public fillGuestAccount = (): void => {
        this.mode.value = 'login';
        this.username.value = 'user';
        this.password.value = GUEST_PASSWORD;
        this.setFormState('success', this.t('auth.guestCredentialsFilled'));
    };

    /** 游客一键登录：账号 user，密码从环境变量读取 */
    public quickGuestLogin = async (): Promise<void> => {
        this.isSubmitting.value = true;
        this.setFormState('', '');
        try {
            const guestDeviceId = getOrCreateGuestDeviceId();
            const result: any = await apiAuthLogin({
                username: 'user',
                password: GUEST_PASSWORD,
                guest_device_id: guestDeviceId || undefined,
            });
            const token = String(result?.token || '').trim();
            const user = result?.user || null;
            if (!token || !user) throw new Error(this.t('auth.guestLoginResponseError'));

            setAuthSession({ token, user });
            syncUserRoleToUrl(user);
            this.message.success(this.t('auth.guestLoginSuccess'));
            await this.router.replace(this.resolveRedirectTarget());
            consumePersistedPositionCode();
        } catch (error: any) {
            const detail = String(
                error?.originalError?.response?.data?.detail ||
                    error?.message ||
                    this.t('auth.guestLoginFailed'),
            );
            this.setFormState('error', detail);
            this.message.error(detail);
        } finally {
            this.isSubmitting.value = false;
        }
    };

    public handleLogin = async (): Promise<void> => {
        const normalizedUsername = this.normalizeUsername(this.username.value);
        const normalizedPassword = String(this.password.value || '').trim();
        if (!normalizedPassword) {
            this.setFormState('error', this.t('auth.pleaseEnterPassword'));
            return;
        }

        this.isSubmitting.value = true;
        this.setFormState('', '');
        try {
            const payload: any = { password: normalizedPassword };
            if (normalizedUsername) payload.username = normalizedUsername;
            if (normalizedUsername.toLowerCase() === 'user') {
                payload.guest_device_id = getOrCreateGuestDeviceId() || undefined;
            }

            const result: any = await apiAuthLogin(payload);
            const token = String(result?.token || '').trim();
            const user = result?.user || null;
            if (!token || !user) throw new Error(this.t('auth.loginResponseError'));

            setAuthSession({ token, user });
            syncUserRoleToUrl(user);
            if (user?.requires_email_binding) {
                this.requiresEmailBinding.value = true;
                this.bindCurrentPassword.value = normalizedPassword;
                this.setFormState('success', this.t('auth.legacyVerifiedBindEmail'));
                this.message.warning(this.t('auth.pleaseBindEmailFirst'));
                return;
            }

            this.message.success(
                this.t('auth.loginSuccessWithRole', { role: String(user.role || 'unknown') }),
            );
            await this.router.replace(this.resolveRedirectTarget());
            consumePersistedPositionCode();
        } catch (error: any) {
            const detail = String(
                error?.originalError?.response?.data?.detail ||
                    error?.message ||
                    this.t('auth.loginFailed'),
            );
            this.setFormState('error', detail);
            this.message.error(detail);
        } finally {
            this.isSubmitting.value = false;
        }
    };

    public handleRegister = async (): Promise<void> => {
        const displayValidation = validateDisplayName(this.username.value);
        const normalizedPassword = String(this.password.value || '').trim();
        const normalizedConfirmPassword = String(this.confirmPassword.value || '').trim();
        const normalizedEmail = normalizeEmail(this.email.value);

        if (!displayValidation.valid) {
            this.setFormState('error', this.t(displayValidation.code));
            return;
        }
        if (!isValidEmail(normalizedEmail)) {
            this.setFormState('error', this.t('auth.invalidEmail'));
            return;
        }
        if (!this.emailVerified.value) {
            this.setFormState('error', this.t('auth.pleaseVerifyEmailFirst'));
            return;
        }
        if (!isValidPassword(normalizedPassword)) {
            this.setFormState('error', this.t('auth.passwordRuleError'));
            return;
        }
        if (normalizedConfirmPassword !== normalizedPassword) {
            this.setFormState('error', this.t('auth.passwordMismatch'));
            return;
        }

        this.isSubmitting.value = true;
        this.setFormState('', '');
        try {
            await apiAuthRegister({
                email: normalizedEmail,
                email_code: this.emailCode.value,
                password: normalizedPassword,
                display_name: displayValidation.value,
                avatar_index: this.selectedAvatarIndex.value,
            });
            this.message.success(this.t('auth.registerSuccess'));
            this.username.value = '';
            this.password.value = '';
            this.confirmPassword.value = '';
            this.resetEmailVerification();
            this.selectedAvatarIndex.value = 0;
            this.switchMode('login');
            this.setFormState('success', this.t('auth.registerComplete'));
        } catch (error: any) {
            const detail = String(
                error?.originalError?.response?.data?.detail ||
                    error?.message ||
                    this.t('auth.registerFailed'),
            );
            this.setFormState('error', detail);
            this.message.error(detail);
        } finally {
            this.isSubmitting.value = false;
        }
    };

    public handleSubmit = async (): Promise<void> => {
        if (this.isSubmitting.value) return;
        if (this.mode.value === 'register') {
            await this.handleRegister();
            return;
        }
        await this.handleLogin();
    };

    //#endregion
}
