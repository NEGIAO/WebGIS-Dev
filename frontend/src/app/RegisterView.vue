<template>
    <div class="register-container">
        <!-- 动态线框地球：单颗会自转的球，悬在宇航员脚下（实现见 AuthGlobeStage）。
             刻意先于 AuthDecorBackground 挂载 —— 两者同为 z-index:0，
             同层由 DOM 顺序决定前后：地球在后、装饰层（含宇航员与双轨）在前，
             宇航员因此压在地球与其轨道环之上，不会被线稿穿过 -->
        <AuthGlobeStage />
        <!-- 背景装饰层：经纬网 + 天光 + 双环旋转纹样 + 光斑
             （与 Landing 首屏同一套装饰语言，实现见 AuthDecorBackground） -->
        <AuthDecorBackground :boost="confirmHovered" />

        <div
            class="container"
            :class="{ 'fade-in': !arrivedByTransition }"
        >
            <div class="form-header">
                <div class="brand-row">
                    <!-- 品牌区整体为返回首页入口（点击 logo/标题回 LandingView） -->
                    <router-link
                        to="/"
                        class="brand-link"
                        :title="t('landing.backHome')"
                        :aria-label="t('landing.backHome')"
                    >
                        <!-- 无底衬：注册页头部本身即品牌绿渐变，白 logo 原色直放即可，
                             不再做 mask 染色、也不加任何色块底衬 -->
                        <div class="brand-badge">
                            <img
                                :src="brandLogoUrl"
                                alt="NEGIAO's WebGIS"
                                loading="eager"
                            />
                        </div>
                        <div class="brand-text">
                            <h1 class="form-title">NEGIAO's WebGIS</h1>
                            <p class="app-purpose-title">{{ t('auth.appPurpose') }}</p>
                        </div>
                    </router-link>
                    <!-- 返回首页图标按钮：右侧操作区，不占品牌区空间 -->
                    <router-link
                        to="/"
                        class="back-home-icon"
                        :title="t('landing.backHome')"
                        :aria-label="t('landing.backHome')"
                    >
                        <Home :size="16" />
                    </router-link>
                    <div
                        class="lang-toggle"
                        role="group"
                        :aria-label="t('preferences.language')"
                    >
                        <button
                            v-for="option in languageOptions"
                            :key="option.value"
                            type="button"
                            class="lang-btn"
                            :class="{ active: language === option.value }"
                            :aria-pressed="language === option.value"
                            @click="switchLanguage(option.value)"
                        >
                            {{ option.label }}
                        </button>
                    </div>
                </div>
            </div>

            <div class="form-body">
                <div
                    class="mode-switch"
                    role="tablist"
                    :aria-label="t('auth.modeSwitchAria')"
                >
                    <button
                        type="button"
                        class="mode-btn"
                        :class="{ active: mode === 'login' }"
                        @click="switchMode('login')"
                    >
                        {{ t('auth.login') }}
                    </button>
                    <button
                        type="button"
                        class="mode-btn"
                        :class="{ active: mode === 'register' }"
                        @click="switchMode('register')"
                    >
                        {{ t('auth.register') }}
                    </button>
                </div>

                <div
                    v-if="!requiresEmailBinding"
                    class="oauth-section"
                >
                    <button
                        type="button"
                        class="oauth-btn google"
                        @click="handleOAuthLogin('google')"
                    >
                        <svg class="g-logo" viewBox="0 0 23.5 24" aria-hidden="true">
                            <clipPath id="rg-a">
                                <path d="M12 10v4.5h6.47c-.5 2.7-3 4.74-6.47 4.74-3.9 0-7.1-3.3-7.1-7.25S8.1 4.75 12 4.75c1.8 0 3.35.6 4.6 1.8l3.4-3.4C18 1.2 15.24 0 12 0 5.4 0 0 5.4 0 12s5.4 12 12 12c7 0 11.5-4.9 11.5-11.7 0-.8-.1-1.54-.2-2.3z"/>
                            </clipPath>
                            <filter id="rg-b">
                                <feGaussianBlur stdDeviation="1"/>
                            </filter>
                            <g style="clip-path:url(#rg-a)">
                                <foreignObject style="filter:url(#rg-b)" height="28" width="28" transform="translate(-2 -2)">
                                    <div xmlns="http://www.w3.org/1999/xhtml" style="height:100%;width:100%;background:conic-gradient(#FF4641,#FD5061 40deg,#FD5061 60deg,#3186FF 85deg,#3186FF 117deg,#00A5B7 142deg,#0EBC5F 167deg,#0EBC5F 200deg,#6CC500 226deg,#FC0 253deg,#FFD314 268deg,#FC0 292deg,#FF4641 327deg)"/>
                                </foreignObject>
                                <path fill="#3186FF" d="M11 8h16v8H11z"/>
                            </g>
                        </svg>
                        {{ t('auth.loginWithGoogle') }}
                    </button>
                    <button
                        type="button"
                        class="oauth-btn github"
                        @click="handleOAuthLogin('github')"
                    >
                        <i class="fab fa-github"></i>
                        {{ t('auth.loginWithGithub') }}
                    </button>
                    <button
                        type="button"
                        class="oauth-btn huggingface"
                        @click="handleOAuthLogin('huggingface')"
                    >
                        <img
                            :src="hfLogoUrl"
                            class="hf-logo"
                            alt=""
                        />
                        {{ t('auth.loginWithHuggingface') }}
                    </button>
                    <div class="oauth-divider">
                        <span>{{ t('auth.orUseEmail') }}</span>
                    </div>
                </div>

                <form
                    v-if="!requiresEmailBinding"
                    @submit.prevent="handleSubmit"
                >
                    <div class="form-group">
                        <label for="username">{{ mode === 'login' ? t('auth.usernameLogin') : t('auth.username') }}</label>
                        <div class="input-group">
                            <component
                                :is="mode === 'login' ? MailIcon : UserIcon"
                                class="icon"
                                :size="14"
                            />
                            <input
                                id="username"
                                v-model="username"
                                type="text"
                                :placeholder="mode === 'login'
                                        ? t('auth.usernamePlaceholderLogin')
                                        : t('auth.usernamePlaceholderRegister')
                                    "
                                :required="mode === 'register'"
                            />
                        </div>
                        <div
                            v-if="mode === 'login'"
                            class="hint"
                        >
                            <Info :size="13" />
                            {{ t('auth.newAccountNote') }}
                        </div>
                        <div
                            v-else
                            class="hint"
                        >
                            <UserPlus :size="13" />
                            {{ t('auth.nicknameNote') }}
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="password">{{ t('auth.password') }}</label>
                        <div class="input-group">
                            <Lock
                                class="icon"
                                :size="14"
                            />
                            <input
                                id="password"
                                v-model="password"
                                type="password"
                                :placeholder="mode === 'login' ? t('auth.passwordPlaceholderLogin') : t('auth.passwordPlaceholderRegister')
                                    "
                                required
                            />
                        </div>
                        <div
                            v-if="mode === 'login'"
                            class="hint"
                        >
                            <ShieldCheck :size="13" />
                            {{ t('auth.guestNote') }}
                        </div>
                        <div
                            v-else
                            class="hint"
                        >
                            <ShieldCheck :size="13" />
                            {{ t('auth.passwordRuleNote') }}
                        </div>
                    </div>

                    <div
                        v-if="mode === 'register'"
                        class="form-group"
                    >
                        <label for="confirmPassword">{{ t('auth.confirmPassword') }}</label>
                        <div class="input-group">
                            <CheckCircle2
                                class="icon"
                                :size="14"
                            />
                            <input
                                id="confirmPassword"
                                v-model="confirmPassword"
                                type="password"
                                :placeholder="t('auth.confirmPasswordPlaceholder')"
                                required
                            />
                        </div>
                    </div>

                    <!-- 注册模式：邮箱 & 验证码 -->
                    <div
                        v-if="mode === 'register'"
                        class="form-group"
                    >
                        <label for="email">{{ t('auth.email') }}</label>
                        <div class="input-group">
                            <Mail
                                class="icon"
                                :size="14"
                            />
                            <input
                                id="email"
                                v-model="email"
                                type="email"
                                :placeholder="t('auth.emailPlaceholder')"
                                required
                            />
                        </div>
                        <div
                            v-if="emailCheckMessage"
                            class="hint username-check"
                            :class="emailCheckStatus"
                        >
                            <component
                                :is="emailCheckStatus === 'success'
                                    ? CheckCircle2Icon
                                    : emailCheckStatus === 'loading'
                                        ? Loader2Icon
                                        : AlertCircleIcon"
                                :size="13"
                                :class="{ spin: emailCheckStatus === 'loading' }"
                            ></component>
                            {{ emailCheckMessage }}
                        </div>
                    </div>

                    <div
                        v-if="mode === 'register'"
                        class="form-group"
                    >
                        <label for="emailCode">{{ t('auth.emailCode') }}</label>
                        <div class="email-code-row">
                            <div class="input-group email-code-input">
                                <ShieldCheck
                                    class="icon"
                                    :size="14"
                                />
                                <input
                                    id="emailCode"
                                    v-model="emailCode"
                                    type="text"
                                    inputmode="numeric"
                                    pattern="[0-9]*"
                                    maxlength="6"
                                    :placeholder="t('auth.emailCodePlaceholder')"
                                    :disabled="emailVerified"
                                />
                            </div>
                            <button
                                v-if="!emailVerified"
                                type="button"
                                class="send-code-btn"
                                :disabled="isSendingCode || codeCountdown > 0"
                                @click="handleSendCode"
                            >
                                <Loader2
                                        v-if="isSendingCode"
                                        :size="14"
                                        class="spin"
                                    />
                                    <Send
                                        v-else
                                        :size="14"
                                    />
                                    {{ codeCountdown > 0 ? t('auth.codeCountdown', { count: codeCountdown }) : t('auth.sendCode') }}
                            </button>
                            <button
                                v-if="!emailVerified && emailCode.length === 6"
                                type="button"
                                class="verify-code-btn"
                                :disabled="isVerifyingCode"
                                @click="handleVerifyCode"
                            >
                                <Loader2
                                        v-if="isVerifyingCode"
                                        :size="14"
                                        class="spin"
                                    />
                                    <Check
                                        v-else
                                        :size="14"
                                    />
                                    {{ t('auth.verify') }}
                            </button>
                            <span
                                v-if="emailVerified"
                                class="verified-badge"
                            >
                                <CheckCircle2 :size="13" /> {{ t('auth.verified') }}
                            </span>
                        </div>
                    </div>

                    <div
                        v-if="mode === 'register'"
                        class="form-group"
                    >
                        <label>{{ t('auth.selectAvatar') }}</label>
                        <div
                            class="avatar-grid"
                            role="radiogroup"
                            :aria-label="t('auth.avatarGroupAria')"
                        >
                            <button
                                v-for="avatar in avatarOptions"
                                :key="avatar.index"
                                type="button"
                                class="avatar-item"
                                :class="{ active: selectedAvatarIndex === avatar.index }"
                                :aria-label="avatar.label"
                                :aria-pressed="selectedAvatarIndex === avatar.index"
                                @click="selectedAvatarIndex = avatar.index"
                            >
                                <img
                                    :src="avatar.src"
                                    :alt="avatar.label"
                                    loading="lazy"
                                />
                                <span>{{ avatar.label }}</span>
                            </button>
                        </div>
                    </div>

                    <div
                        v-if="mode === 'login'"
                        class="quick-action-row"
                    >
                        <button
                            type="button"
                            class="quick-btn guest-login"
                            @click="quickGuestLogin"
                        >
                            <Footprints :size="14" />
                            {{ t('auth.guestLogin') }}
                        </button>
                        <button
                            type="submit"
                            class="quick-btn confirm-login"
                            :disabled="isSubmitting"
                            @mouseenter="confirmHovered = true"
                            @mouseleave="confirmHovered = false"
                            @focus="confirmHovered = true"
                            @blur="confirmHovered = false"
                        >
                            <LogIn :size="15" />
                            {{ isSubmitting ? t('auth.submitting') : t('auth.confirmLogin') }}
                        </button>
                    </div>

                    <!-- 登录模式：忘记密码链接 -->
                    <div
                        v-if="mode === 'login'"
                        class="forgot-password-row"
                    >
                        <a
                            href="#"
                            class="forgot-link"
                            @click.prevent="openResetPanel"
                        >
                            <KeyRound :size="13" />
                            {{ t('auth.forgotPassword') }}
                        </a>
                    </div>

                    <div
                        v-if="formMessage"
                        :class="['validation-message', formStatus]"
                    >
                        {{ formMessage }}
                    </div>

                    <button
                        v-if="mode === 'register'"
                        type="submit"
                        class="btn"
                        :disabled="isSubmitting"
                    >
                        {{ isSubmitting ? t('auth.submitting') : t('auth.createAccount') }}
                    </button>

                    <div class="login-link">
                        <template v-if="mode === 'login'">
                            {{ t('auth.noAccount') }}
                            <a
                                href="#"
                                @click.prevent="switchMode('register')"
                            >{{ t('auth.registerNow') }}</a>
                        </template>
                        <template v-else>
                            {{ t('auth.hasAccount') }}
                            <a
                                href="#"
                                @click.prevent="switchMode('login')"
                            >{{ t('auth.backToLogin') }}</a>
                        </template>
                    </div>
                </form>

                <form
                    v-else
                    class="legacy-bind-form"
                    @submit.prevent="handleBindEmailSubmit"
                >
                    <div class="bind-alert">
                        <MailCheck :size="18" />
                        <div>
                            <strong>{{ t('auth.bindEmailTitle') }}</strong>
                            <p>{{ t('auth.bindEmailDesc') }}</p>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="bindEmail">{{ t('auth.bindEmail') }}</label>
                        <div class="input-group">
                            <Mail
                                class="icon"
                                :size="14"
                            />
                            <input
                                id="bindEmail"
                                v-model="bindEmail"
                                type="email"
                                :placeholder="t('auth.emailPlaceholder')"
                                required
                            />
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="bindCode">{{ t('auth.emailCode') }}</label>
                        <div class="email-code-row">
                            <div class="input-group email-code-input">
                                <ShieldCheck
                                    class="icon"
                                    :size="14"
                                />
                                <input
                                    id="bindCode"
                                    v-model="bindCode"
                                    type="text"
                                    inputmode="numeric"
                                    pattern="[0-9]*"
                                    maxlength="6"
                                    :placeholder="t('auth.emailCodePlaceholder')"
                                />
                            </div>
                            <button
                                type="button"
                                class="send-code-btn"
                                :disabled="isBindingCodeSending || bindCodeCountdown > 0"
                                @click="handleBindSendCode"
                            >
                                <Loader2
                                    v-if="isBindingCodeSending"
                                    :size="14"
                                    class="spin"
                                />
                                <Send
                                    v-else
                                    :size="14"
                                />
                                {{ bindCodeCountdown > 0 ? t('auth.codeCountdown', { count: bindCodeCountdown }) : t('auth.sendCode') }}
                            </button>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="bindPassword">{{ t('auth.currentPassword') }}</label>
                        <div class="input-group">
                            <Lock
                                class="icon"
                                :size="14"
                            />
                            <input
                                id="bindPassword"
                                v-model="bindCurrentPassword"
                                type="password"
                                :placeholder="t('auth.currentPasswordPlaceholder')"
                                required
                            />
                        </div>
                    </div>

                    <div
                        v-if="formMessage"
                        :class="['validation-message', formStatus]"
                    >
                        {{ formMessage }}
                    </div>

                    <button
                        type="submit"
                        class="btn"
                        :disabled="isSubmitting"
                    >
                        {{ isSubmitting ? t('auth.binding') : t('auth.bindEmailAndEnter') }}
                    </button>

                    <div class="login-link">
                        <a
                            href="#"
                            @click.prevent="cancelBinding"
                        >{{ t('auth.backToLogin') }}</a>
                    </div>
                </form>
            </div>

            <!-- 密码重置弹窗 -->
            <div
                v-if="showResetPanel"
                class="reset-overlay"
            >
                <div class="reset-panel">
                    <div class="reset-header">
                        <h3><Unlock :size="16" /> {{ t('auth.resetPasswordTitle') }}</h3>
                        <button
                            type="button"
                            class="reset-close"
                            @click="closeResetPanel"
                        >
                            <X :size="16" />
                        </button>
                    </div>

                    <!-- Step 1: 输入邮箱 -->
                    <div
                        v-if="resetStep === 1"
                        class="reset-body"
                    >
                        <p class="reset-desc">{{ t('auth.resetStep1Desc') }}</p>
                        <div class="input-group">
                            <Mail
                                class="icon"
                                :size="14"
                            />
                            <input
                                v-model="resetEmail"
                                type="email"
                                :placeholder="t('auth.resetEmailPlaceholder')"
                            />
                        </div>
                        <button
                            type="button"
                            class="btn reset-btn"
                            :disabled="isResetSubmitting"
                            @click="handleResetSendCode"
                        >
                            <Loader2
                                v-if="isResetSubmitting"
                                :size="14"
                                class="spin"
                            />
                            <Send
                                v-else
                                :size="14"
                            />
                            {{ isResetSubmitting ? t('auth.sendingCode') : t('auth.sendCode') }}
                        </button>
                    </div>

                    <!-- Step 2: 输入验证码 + 新密码 -->
                    <div
                        v-if="resetStep === 2"
                        class="reset-body"
                    >
                        <p class="reset-desc">
                            {{ t('auth.resetCodeSentTo') }} <strong>{{ resetEmail }}</strong>
                        </p>
                        <div class="input-group">
                            <ShieldCheck
                                class="icon"
                                :size="14"
                            />
                            <input
                                v-model="resetCode"
                                type="text"
                                inputmode="numeric"
                                pattern="[0-9]*"
                                maxlength="6"
                                :placeholder="t('auth.emailCodePlaceholder')"
                            />
                        </div>
                        <div class="input-group">
                            <Lock
                                class="icon"
                                :size="14"
                            />
                            <input
                                v-model="resetNewPassword"
                                type="password"
                                :placeholder="t('auth.resetNewPasswordPlaceholder')"
                            />
                        </div>
                        <div class="input-group">
                            <CheckCircle2
                                class="icon"
                                :size="14"
                            />
                            <input
                                v-model="resetConfirmPassword"
                                type="password"
                                :placeholder="t('auth.resetConfirmPasswordPlaceholder')"
                            />
                        </div>
                        <button
                            type="button"
                            class="btn reset-btn"
                            :disabled="isResetSubmitting"
                            @click="handleResetSubmit"
                        >
                            <Loader2
                                v-if="isResetSubmitting"
                                :size="14"
                                class="spin"
                            />
                            <Check
                                v-else
                                :size="14"
                            />
                            {{ isResetSubmitting ? t('auth.submitting') : t('auth.resetPasswordAction') }}
                        </button>
                        <button
                            v-if="resetCodeSent && resetCodeCountdown <= 0"
                            type="button"
                            class="resend-btn"
                            @click="handleResetSendCode"
                        >
                            {{ t('auth.resendCode') }}
                        </button>
                        <span
                            v-if="resetCodeCountdown > 0"
                            class="countdown-text"
                        >
                            {{ t('auth.resetCountdownWait', { count: resetCodeCountdown }) }}
                        </span>
                    </div>
                </div>
            </div>

            <div class="form-footer">
                {{ t('auth.agreeToTerms') }} <router-link to="/terms">{{ t('auth.termsOfService') }}</router-link> {{ t('auth.and') }} <router-link to="/privacy">{{ t('auth.privacyPolicy') }}</router-link>
            </div>
        </div>
    </div>

</template>


<script lang="ts" src="./RegisterView.ts"></script>

<style scoped>
.register-container {
    position: relative;
    font-family: var(--font-base, 'PingFang SC', 'Microsoft YaHei', sans-serif);
    line-height: 1.6;
    color: var(--text-primary);
    background-color: var(--bg-secondary);
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100dvh;
    padding: clamp(10px, 2.6vw, 24px);
    width: 100%;
    /* 外层锁定不滚动：滚动完全交给卡片内部 .form-body */
    overflow: hidden;
}

/* 背景装饰层已抽为两个组件（app/components/）：
   AuthDecorBackground —— 经纬网 + 天光 + 双轨纹样 + 双光斑，与 Landing 同一套语言；
   AuthGlobeStage      —— 会自转的线框地球 + 倾斜轨道卫星 + 流星。
   本页不再持有装饰层样式，避免与组件重复维护。 */

.container {
    position: relative;
    z-index: 1;
    /* 形变目标：Landing 三个入口的按钮在点击时临时挂同名 `auth-card`，
       浏览器把按钮快照按位置/尺度插值到这张卡上（见 useViewTransitionNavigation） */
    view-transition-name: auth-card;
    /* 去描边（V3.6.42 视觉纪律）：原来的中性发丝描边由「白色外缘 + 接触阴影 + 大扩散」
       三层承担。白色外缘保留 —— 本页底色是经纬网/光斑装饰层，卡片需要一圈亮边把边缘
       从纹样里「切」出来；这是与背景的对比边界，不是装饰性描边（同 .ui-panel 的
       0 0 0 1px #fff 手法）。大扩散取负扩散值，只在静态留一层几乎不可见的「浮起」 */
    background: var(--bg-primary);
    border: 0;
    border-radius: var(--panel-radius, 12px);
    box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.9),
        0 1px 2px rgba(var(--shadow-rgb), 0.04),
        0 30px 60px -40px rgba(var(--shadow-rgb), 0.55);
    width: 100%;
    max-width: 440px;
    /* 扣除容器上下 padding（与 .register-container 同式），保证居中时头尾不被裁切 */
    max-height: calc(100dvh - 2 * clamp(10px, 2.6vw, 24px));
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

/* ─── 头部（紧凑单行） ─── */
.form-header {
    position: relative;
    background: linear-gradient(140deg, var(--brand-primary) 0%, var(--brand-primary-dark) 100%);
    color: #fff;
    padding: 14px 20px;
    overflow: hidden;
    /* 关键：注册模式表单变高时，禁止 flex 压缩头部卡片（否则头部被表单区遮挡/裁切） */
    flex-shrink: 0;
}

/* 经纬网格纹理，呼应 GIS 主题（与 LayerPropertiesDialog / 用户中心同 DNA：24px） */
.form-header::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.07) 1px, transparent 1px);
    background-size: 24px 24px;
    -webkit-mask-image: radial-gradient(ellipse 95% 120% at 50% 0%, #000 30%, transparent 100%);
    mask-image: radial-gradient(ellipse 95% 120% at 50% 0%, #000 30%, transparent 100%);
    pointer-events: none;
}

.form-header > * {
    position: relative;
}

.brand-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

/* 品牌区即返回首页入口：不额外占位，hover 轻微降透明度提示可点 */
.brand-link {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    text-decoration: none;
    color: inherit;
    transition: opacity 0.15s ease;
}

.brand-link:hover {
    opacity: 0.85;
}

.brand-link:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.95);
    outline-offset: 2px;
    border-radius: 10px;
}

.lang-toggle {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 999px;
    /* 去描边：胶囊形状 + 14% 白底已经在渐变头上界定出轮廓，
       再描一圈 28% 白边属重复强调（V3.6.42 视觉纪律 5「有形状者不再描边」） */
    background: rgba(255, 255, 255, 0.14);
    border: 0;
    flex-shrink: 0;
}

/* 返回首页图标按钮：位于语言切换器左侧，与切换器同风格，不占品牌区空间 */
.back-home-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.14);
    border: 0;
    color: rgba(255, 255, 255, 0.92);
    flex-shrink: 0;
    transition: background-color 0.15s ease, color 0.15s ease;
}

.back-home-icon:hover {
    background: rgba(255, 255, 255, 0.28);
    color: #fff;
}

.back-home-icon:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.95);
    outline-offset: 1px;
}

.lang-btn {
    appearance: none;
    border: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.82);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    padding: 6px 8px;
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s ease, color 0.15s ease;
}

.lang-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
}

.lang-btn.active {
    background: rgba(255, 255, 255, 0.92);
    color: var(--brand-primary-dark, #1f5d3a);
}

.lang-btn:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.95);
    outline-offset: 1px;
}

/* 无底衬：注册页头部本身即品牌绿渐变（.form-header），白 logo 原色直放即可成立，
   故既不加色块、也不做 mask 染色。同时去掉 padding：没有牌面就不需要内边距，
   复杂线稿直接吃满 40px，可见尺寸 28×22 → 40×32（+43%）。
   （历史 bug 备查：此处原写 var(--brand-primary-darker)，该令牌全仓未定义，
   导致 background 声明 invalid at computed-value time 被整体丢弃、徽牌透明。） */
.brand-badge {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    /* hover 效果与 TopBar `.logo-link:hover .logo-icon` 同一套手法：
       轻微倾斜 -10° + 放大 1.1，0.3s —— 不做整圈旋转（试过 360°/Y 轴翻转，
       对一个小徽牌都太闹） */
    transition: transform 0.3s;
}

/* will-change 只在交互期间挂上，避免常驻图层的开销 */
.brand-badge:hover {
    transform: rotate(-10deg) scale(1.1);
    will-change: transform;
}

/* 动效敏感用户：停用旋转，仅保留静态展示 */
@media (prefers-reduced-motion: reduce) {
    .brand-badge {
        transition: none;
    }

    .brand-badge:hover {
        transform: none;
        will-change: auto;
    }
}

.brand-badge img {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.brand-text {
    min-width: 0;
    text-align: left;
}

.form-title {
    font-weight: 700;
    font-size: 19px;
    margin: 0;
    letter-spacing: 0.4px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.app-purpose-title {
    margin: 2px 0 0;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.2px;
    opacity: 0.88;
    /* 完整显示副标题：允许换行（最多 2 行），不再截断省略 */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.45;
}

/* ─── 表单主体 ─── */
.form-body {
    padding: clamp(18px, 3.2vw, 28px);
    padding-top: 2%;
    background-color: var(--bg-primary);
    flex: 1;
    /* min-height: 0 解除 flex 子项最小内容高限制，确保空间不足时收缩并触发内部滚动 */
    min-height: 0;
    overflow-y: auto;
}

.form-body::-webkit-scrollbar {
    width: 6px;
}

.form-body::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.14);
    border-radius: 3px;
}

/* 分段控件：轨道去描边，改用淡品牌底与白卡拉开明度差 ——
   此处的描边既不是形状也不是状态，纯属「三件套」残留 */
.mode-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 4px;
    background: rgba(var(--brand-primary-rgb), 0.055);
    border: 0;
    border-radius: 12px;
    margin-bottom: 18px;
}

.mode-btn {
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    padding: 9px 12px;
    font-size: 14px;
    font-weight: 600;
    /* 同心圆角：轨道 12px − 内边距 4px + 1，滑块贴边时不露缝 */
    border-radius: 9px;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
}

.mode-btn:hover:not(.active) {
    color: var(--brand-primary-dark);
    background: rgba(var(--brand-primary-rgb), 0.08);
}

/* 当前态不再用品牌实心块：原来它与下方提交按钮同时发绿，视线不知道主操作在哪。
   改为「白色滑块 + 品牌深色文字 + 极轻投影」—— iOS 分段控件的经典手法，
   全页只保留提交按钮一处实心绿（V3.6.42 纪律 2「单一强调源」） */
.mode-btn.active {
    background: var(--brand-primary);
    color: #fff;
    box-shadow:
        0 1px 2px rgba(var(--shadow-rgb), 0.05),
        0 8px 18px -14px rgba(var(--shadow-rgb), 0.5);
}

.oauth-section {
    display: grid;
    gap: 10px;
    margin-bottom: 8px;
}

.oauth-btn {
    width: 100%;
    /* 去描边：白面 + 双层轻投影已足够「像个按钮」，
       与下方实心主按钮构成「浮 / 实」对比，而非「框 / 实」对比（V3.6.42 纪律 6） */
    border: 0;
    border-radius: 10px;
    padding: 11px 14px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    box-shadow:
        0 1px 2px rgba(var(--shadow-rgb), 0.05),
        0 10px 22px -18px rgba(var(--shadow-rgb), 0.55);
    transition: background-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.oauth-btn i {
    font-size: 16px;
}

.oauth-btn.google .g-logo {
    width: 16px;
    height: 16px;
}

.oauth-btn.github i {
    color: #24292f;
}

/* Hugging Face 品牌 logo：官方彩色 SVG（public/images/hf-logo.svg） */
.oauth-btn .hf-logo {
    width: 20px;
    height: 20px;
}

.oauth-btn:hover {
    /* 无描边可换：hover 全靠「底色微染 + 抬高 + 投影加深」三件事 */
    background: rgba(var(--brand-primary-rgb), 0.04);
    transform: translateY(-1px);
    box-shadow:
        0 1px 2px rgba(var(--shadow-rgb), 0.06),
        0 18px 30px -20px rgba(var(--shadow-rgb), 0.6);
}

.oauth-divider {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-muted);
    font-size: 12px;
    margin-top: 2px;
}

.oauth-divider::before,
.oauth-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border-light);
}

/* ─── 输入控件 ─── */
.form-group {
    margin-bottom: 16px;
    position: relative;
}

label {
    display: block;
    margin-bottom: 6px;
    font-weight: 600;
    font-size: 13.5px;
    color: var(--text-primary);
    letter-spacing: 0.2px;
    transition: color 0.2s ease;
}

.form-group:focus-within > label {
    color: var(--brand-primary-dark);
}

.input-group {
    position: relative;
}

.input-group .icon {
    position: absolute;
    left: 13px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    font-size: 14px;
    transition: color 0.2s ease;
    pointer-events: none;
}

.input-group:focus-within .icon {
    color: var(--brand-primary);
}

/* Lucide 加载态旋转（替代旧 fa-spin） */
.spin {
    animation: reg-spin 1s linear infinite;
}

@keyframes reg-spin {
    to {
        transform: rotate(360deg);
    }
}

input {
    width: 100%;
    padding: 11px 12px 11px 38px;
    border: 1px solid var(--border-light);
    border-radius: 10px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 14px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

input::placeholder {
    color: var(--text-muted);
    font-size: 13px;
}

input:hover:not(:focus):not(:disabled) {
    border-color: rgba(var(--brand-primary-rgb), 0.45);
}

input:focus {
    outline: none;
    border-color: var(--brand-primary);
    box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb), 0.14);
}

input:disabled {
    background: var(--bg-secondary);
    color: var(--text-muted);
    cursor: not-allowed;
}

.hint {
    display: flex;
    align-items: flex-start;
    margin-top: 5px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-muted);
}

.hint i {
    margin-right: 5px;
    margin-top: 2px;
    font-size: 12px;
    flex-shrink: 0;
}

.username-check {
    margin-top: 6px;
    font-weight: 500;
    font-size: 12.5px;
}

.username-check.success {
    color: var(--brand-primary-dark);
}

.username-check.error {
    color: var(--danger);
}

.username-check.loading {
    color: var(--text-secondary);
}

/* ─── 邮箱验证码行 ─── */
.email-code-row {
    display: flex;
    align-items: stretch;
    gap: 8px;
}

.email-code-input {
    flex: 1;
    min-width: 0;
}

.send-code-btn,
.verify-code-btn {
    white-space: nowrap;
    padding: 10px 14px;
    /* 去描边：品牌色淡底本身已界出色块，0.35 的描边属重复强调 */
    border: 0;
    border-radius: 10px;
    background: rgba(var(--brand-primary-rgb), 0.08);
    color: var(--brand-primary-dark);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease;
    display: flex;
    align-items: center;
    gap: 5px;
}

.send-code-btn:hover:not(:disabled),
.verify-code-btn:hover:not(:disabled) {
    /* 无边框可加深，改为底色提一档表达 hover */
    background: rgba(var(--brand-primary-rgb), 0.15);
}

.send-code-btn:disabled,
.verify-code-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.verified-badge {
    color: var(--brand-primary-dark);
    background: rgba(var(--brand-primary-rgb), 0.1);
    /* 淡品牌底已界定形状，去掉描边 */
    border: 0;
    border-radius: 10px;
    padding: 0 12px;
    font-weight: 600;
    font-size: 13px;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 5px;
}

/* ─── 头像选择 ─── */
.avatar-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
}

.avatar-item {
    /* 去描边：改用极淡中性底界定色块；未选中态不需要被「框」住 */
    border: 0;
    border-radius: 12px;
    background: rgba(var(--shadow-rgb), 0.04);
    color: var(--text-secondary);
    padding: 8px 4px;
    display: grid;
    justify-items: center;
    gap: 5px;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease,
        transform 0.2s ease;
}

.avatar-item:hover {
    transform: translateY(-1px);
    background: rgba(var(--brand-primary-rgb), 0.06);
}

/* 选中态：描边承载「已选择」这一语义，属规范明列的例外；
   但不再用 border（占布局宽度），改为外扩环状阴影，几何更稳 */
.avatar-item.active {
    background: rgba(var(--brand-primary-rgb), 0.08);
    color: var(--brand-primary-dark);
    box-shadow:
        0 0 0 1px var(--brand-primary),
        0 0 0 4px rgba(var(--brand-primary-rgb), 0.16);
}

.avatar-item img {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    object-fit: cover;
}

.avatar-item span {
    font-size: 11px;
    font-weight: 600;
}

/* ─── 校验提示与按钮 ─── */
.validation-message {
    display: none;
    margin-top: 12px;
    padding: 9px 12px;
    border-radius: 10px;
    font-size: 13px;
    line-height: 1.5;
}

.validation-message.error {
    display: block;
    color: var(--danger);
    background: rgba(var(--danger-rgb), 0.07);
    border: 1px solid rgba(var(--danger-rgb), 0.25);
}

.validation-message.success {
    display: block;
    color: var(--brand-primary-dark);
    background: rgba(var(--brand-primary-rgb), 0.08);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.28);
}

.quick-action-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 4px;
    margin-bottom: 14px;
}

.quick-btn {
    border-radius: 10px;
    padding: 12px 8px;
    font-size: 14px;
    cursor: pointer;
    font-weight: 600;
    transition: background-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
}

.quick-btn i {
    font-size: 14px;
}

.quick-btn.guest-login {
    /* 白面次级按钮：双层轻投影取代描边（V3.6.42 纪律 6） */
    background: var(--bg-primary);
    border: 0;
    color: var(--brand-primary-dark);
    box-shadow:
        0 1px 2px rgba(var(--shadow-rgb), 0.05),
        0 10px 22px -18px rgba(var(--shadow-rgb), 0.55);
}

.quick-btn.guest-login:hover:not(:disabled) {
    background: rgba(var(--brand-primary-rgb), 0.06);
    transform: translateY(-1px);
    box-shadow:
        0 1px 2px rgba(var(--shadow-rgb), 0.06),
        0 18px 30px -20px rgba(var(--shadow-rgb), 0.6);
}

.quick-btn.confirm-login {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    border: 1px solid transparent;
    color: #fff;
    box-shadow: 0 4px 12px rgba(var(--brand-primary-rgb), 0.3);
}

.quick-btn.confirm-login:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(var(--brand-primary-rgb), 0.38);
}

.quick-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
}

.btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    border: none;
    padding: 13px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.3px;
    transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
    margin-top: 18px;
    /* 双层品牌调投影：接触层定边界，负扩散层只做「微微抬起」 */
    box-shadow:
        0 1px 2px rgba(var(--brand-primary-rgb), 0.2),
        0 10px 22px -16px rgba(var(--brand-primary-rgb), 0.75);
}

.btn:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(var(--brand-primary-rgb), 0.4);
}

.btn:active:not(:disabled) {
    transform: translateY(0);
}

.btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
}

.forgot-password-row {
    text-align: right;
    margin-top: -6px;
    margin-bottom: 10px;
}

.forgot-link {
    color: var(--text-secondary);
    font-size: 13px;
    text-decoration: none;
    transition: color 0.2s;
}

.forgot-link:hover {
    color: var(--brand-primary);
    text-decoration: underline;
}

.forgot-link i {
    margin-right: 4px;
    font-size: 12px;
}

.login-link {
    text-align: center;
    margin-top: 16px;
    font-size: 13.5px;
    color: var(--text-secondary);
}

.login-link a {
    color: var(--brand-primary);
    text-decoration: none;
    font-weight: 600;
}

.login-link a:hover {
    text-decoration: underline;
}

/* ─── 旧账号绑定邮箱 ─── */
.legacy-bind-form {
    display: flex;
    flex-direction: column;
}

.bind-alert {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: flex-start;
    padding: 13px 14px;
    margin-bottom: 18px;
    /* 提示块：淡品牌底已界定范围，描边属重复强调（同 .verified-badge 处理） */
    border: 0;
    border-radius: 12px;
    background: rgba(var(--brand-primary-rgb), 0.07);
    color: var(--text-brand-dark);
}

.bind-alert i {
    margin-top: 2px;
    color: var(--brand-primary);
    font-size: 19px;
}

.bind-alert strong {
    display: block;
    font-size: 14px;
    margin-bottom: 3px;
}

.bind-alert p {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--text-secondary);
}

/* ─── 密码重置弹窗 ─── */
.reset-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 25, 18, 0.45);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: var(--z-panel);
    backdrop-filter: blur(4px);
}

.reset-panel {
    background: var(--bg-primary);
    border-radius: 16px;
    width: 90%;
    max-width: 400px;
    /* 弹层浮在 45% 深色遮罩上，接触层定边界、大扩散负责「悬浮」；
       中性黑改为品牌冷调，与全站阴影语汇统一 */
    box-shadow:
        0 1px 2px rgba(var(--shadow-rgb), 0.1),
        0 30px 60px -30px rgba(var(--shadow-rgb), 0.6);
    overflow: hidden;
    animation: fadeIn 0.3s ease;
}

.reset-header {
    background: linear-gradient(140deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    padding: 15px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.reset-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
}

.reset-header h3 i {
    margin-right: 7px;
}

.reset-close {
    background: rgba(255, 255, 255, 0.14);
    border: none;
    color: #fff;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.reset-close:hover {
    background: rgba(255, 255, 255, 0.26);
}

.reset-body {
    padding: 22px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.reset-desc {
    margin: 0;
    font-size: 13.5px;
    color: var(--text-secondary);
    line-height: 1.55;
}

.reset-btn {
    margin-top: 4px;
}

.resend-btn {
    display: block;
    width: 100%;
    background: none;
    /* 虚线描边保留：它表达「此处可重试」的动作语义，不是装饰层级
       （规范例外：语义态承载可用性信息，不受去描边约束） */
    border: 1px dashed var(--border-light);
    padding: 10px;
    border-radius: 10px;
    font-size: 13px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease;
}

.resend-btn:hover {
    border-color: var(--brand-primary);
    color: var(--brand-primary);
}

.countdown-text {
    text-align: center;
    font-size: 12.5px;
    color: var(--text-muted);
}

/* ─── 页脚与动画 ─── */
.form-footer {
    padding: 12px 24px;
    text-align: center;
    background-color: var(--bg-secondary);
    border-top: 1px solid var(--border-light);
    font-size: 12px;
    color: var(--text-muted);
    flex-shrink: 0;
}

.form-footer a {
    color: var(--brand-primary-dark);
    text-decoration: none;
    font-weight: 500;
}

.form-footer a:hover {
    text-decoration: underline;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(12px) scale(0.99);
    }

    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.fade-in {
    animation: fadeIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

/* ─── 移动端适配 ─── */
@media (max-width: 768px) {
    .register-container {
        align-items: stretch;
        padding: 0;
    }

    /* 装饰层在 ≤768px 整层关闭（卡片已全屏，见 AuthDecorBackground 注释），
       此处无需再为光斑/环做降级 */

    .container {
        max-width: 100%;
        border-radius: 0;
        border: none;
        max-height: 100dvh;
        min-height: 100dvh;
        box-shadow: none;
    }

    .form-body {
        padding: 18px 16px;
    }

    .form-header {
        padding: 12px 16px;
        padding-top: max(12px, env(safe-area-inset-top));
    }

    .brand-row {
        gap: 8px;
    }

    .brand-link {
        gap: 8px;
    }

    .lang-toggle {
        gap: 1px;
        padding: 1px;
    }

    .lang-btn {
        font-size: 10px;
        padding: 5px 7px;
    }

    .brand-badge {
        width: 36px;
        height: 36px;
        font-size: 17px;
    }

    .form-title {
        font-size: 16px;
    }

    .form-footer {
        padding: 12px 16px;
        padding-bottom: max(12px, env(safe-area-inset-bottom));
    }

    .avatar-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .email-code-row {
        flex-wrap: wrap;
    }

    .send-code-btn,
    .verify-code-btn {
        padding: 9px 12px;
        font-size: 12px;
    }

    .verified-badge {
        padding: 9px 12px;
    }

    .quick-action-row {
        grid-template-columns: 1fr;
    }

    .reset-panel {
        width: 94%;
        max-height: 90dvh;
        overflow-y: auto;
    }

    .reset-body {
        padding: 18px 16px;
    }
}
</style>

