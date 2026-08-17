<template>
    <div class="landing-container">
        <!-- ============ 顶部导航 ============ -->
        <header class="navbar">
            <div class="navbar-inner">
                <div class="brand">
                    <div class="brand-badge">
                        <img
                            :src="logoUrl"
                            alt="NEGIAO's WebGIS"
                            loading="eager"
                        />
                    </div>
                    <div class="brand-text">
                        <h1 class="brand-title">NEGIAO's WebGIS</h1>
                        <p class="brand-subtitle">{{ t('auth.appPurpose') }}</p>
                    </div>
                </div>
                <div class="nav-actions">
                    <div
                        class="lang-toggle"
                        role="group"
                        :aria-label="t('landing.langToggleAria')"
                    >
                        <button
                            v-for="option in LANGUAGE_OPTIONS"
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
                    <router-link
                        to="/register"
                        class="btn-primary"
                    >
                            <LogIn :size="16" />
                            {{ t('landing.navLogin') }}
                    </router-link>
                </div>
            </div>
        </header>

        <!-- ============ Hero 区域 ============ -->
        <main class="content">
            <section class="hero-section">
                <div
                    class="hero-bg"
                    aria-hidden="true"
                >
                    <div class="hero-bg__grid"></div>
                    <div class="hero-bg__blob hero-bg__blob--1"></div>
                    <div class="hero-bg__blob hero-bg__blob--2"></div>
                </div>

                <div class="hero-inner">
                    <p class="hero-eyebrow">
                        <MapPinned :size="16" />
                        {{ t('landing.heroEyebrow') }}
                    </p>
                    <h2 class="hero-title">
                        {{ t('landing.heroExplore') }}<br />
                        <span class="hero-title-accent">{{ t('landing.heroAccent') }}</span>
                    </h2>
                    <p class="hero-subtitle">
                        {{ t('landing.heroSubtitle') }}
                    </p>
                    <div class="hero-actions">
                        <router-link
                            to="/register"
                            class="btn-large"
                        >
                            <Rocket :size="18" />
                            {{ t('landing.tryNow') }}
                        </router-link>
                        <a
                            href="https://github.com/NEGIAO/WebGIS-Dev"
                            target="_blank"
                            rel="noopener"
                            class="btn-outline"
                        >
                            <i class="fab fa-github"></i>
                            {{ t('landing.githubSource') }}
                        </a>
                    </div>

                    <div class="hero-stats">
                        <template
                            v-for="(stat, index) in heroStats"
                            :key="stat.value"
                        >
                            <div
                                v-if="index > 0"
                                class="stat-divider"
                            ></div>
                            <div class="stat-item">
                                <span class="stat-value">{{ stat.value }}</span>
                                <span class="stat-label">{{ stat.label }}</span>
                            </div>
                        </template>
                    </div>
                </div>
            </section>

            <!-- ============ 核心功能 ============ -->
            <section class="features-section">
                <div class="section-head">
                    <p class="section-eyebrow">{{ t('landing.featuresEyebrow') }}</p>
                    <h3 class="section-title">{{ t('landing.featuresTitle') }}</h3>
                    <p class="section-desc">{{ t('landing.featuresDesc') }}</p>
                </div>

                <div class="features-grid">
                    <div
                        v-for="feature in features"
                        :key="feature.key"
                        class="feature-card"
                    >
                        <div class="feature-icon">
                            <component :is="feature.icon" :size="22" />
                        </div>
                        <h4>{{ feature.title }}</h4>
                        <p>{{ feature.desc }}</p>
                    </div>
                </div>
            </section>

            <!-- ============ 技术栈 ============ -->
            <section class="tech-section">
                <div class="section-head">
                    <p class="section-eyebrow">{{ t('landing.techEyebrow') }}</p>
                    <h3 class="section-title">{{ t('landing.techTitle') }}</h3>
                </div>
                <div class="tech-badges">
                    <span class="tech-badge">
                        <i class="fab fa-vuejs"></i>
                        Vue 3.5
                    </span>
                    <span class="tech-badge">
                        <Map :size="16" />
                        OpenLayers 10
                    </span>
                    <span class="tech-badge">
                        <Globe :size="16" />
                        Cesium 1.132
                    </span>
                    <span class="tech-badge">
                        <Zap :size="16" />
                        FastAPI
                    </span>
                    <span class="tech-badge">
                        <i class="fab fa-docker"></i>
                        Docker
                    </span>
                    <span class="tech-badge">
                        <i class="fab fa-github"></i>
                        GitHub Pages
                    </span>
                    <span class="tech-badge">
                        <Cloud :size="16" />
                        Hugging Face
                    </span>
                </div>
            </section>

            <!-- ============ CTA 区域 ============ -->
            <section class="cta-section">
                <div class="cta-card">
                    <div
                        class="cta-bg"
                        aria-hidden="true"
                    >
                        <div class="cta-bg__grid"></div>
                        <div class="cta-bg__blob cta-bg__blob--1"></div>
                        <div class="cta-bg__blob cta-bg__blob--2"></div>
                    </div>
                    <h3>{{ t('landing.ctaTitle') }}</h3>
                    <p>{{ t('landing.ctaDesc') }}</p>
                    <router-link
                        to="/register"
                        class="btn-cta"
                    >
                        <Send :size="16" />
                            {{ t('landing.getStarted') }}
                    </router-link>
                    <div class="cta-login-methods">
                        <span class="cta-methods-label">{{ t('landing.ctaMethods') }}</span>
                        <span class="cta-method"><svg class="cta-g-logo" viewBox="0 0 23.5 24" aria-hidden="true"><clipPath id="ctg-a"><path d="M12 10v4.5h6.47c-.5 2.7-3 4.74-6.47 4.74-3.9 0-7.1-3.3-7.1-7.25S8.1 4.75 12 4.75c1.8 0 3.35.6 4.6 1.8l3.4-3.4C18 1.2 15.24 0 12 0 5.4 0 0 5.4 0 12s5.4 12 12 12c7 0 11.5-4.9 11.5-11.7 0-.8-.1-1.54-.2-2.3z"/></clipPath><filter id="ctg-b"><feGaussianBlur stdDeviation="1"/></filter><g style="clip-path:url(#ctg-a)"><foreignObject style="filter:url(#ctg-b)" height="28" width="28" transform="translate(-2 -2)"><div xmlns="http://www.w3.org/1999/xhtml" style="height:100%;width:100%;background:conic-gradient(#FF4641,#FD5061 40deg,#FD5061 60deg,#3186FF 85deg,#3186FF 117deg,#00A5B7 142deg,#0EBC5F 167deg,#0EBC5F 200deg,#6CC500 226deg,#FC0 253deg,#FFD314 268deg,#FC0 292deg,#FF4641 327deg)"/></foreignObject><path fill="#3186FF" d="M11 8h16v8H11z"/></g></svg>Google</span>
                        <span class="cta-method"><i class="fab fa-github"></i>GitHub</span>
                        <span class="cta-method"><img
                            :src="hfLogoUrl"
                            class="cta-hf-logo"
                            alt=""
                        />Hugging Face</span>
                        <span class="cta-method"><Mail :size="14" />{{ t('landing.methodEmail') }}</span>
                        <span class="cta-method"><UserRound :size="14" />{{ t('landing.methodGuest') }}</span>
                    </div>
                </div>
            </section>
        </main>

        <!-- ============ 页脚 ============ -->
        <footer class="footer">
            <div class="footer-inner">
                <p class="footer-copyright">
                    {{ t('landing.copyright') }}
                </p>
                <div class="footer-links">
                    <router-link to="/privacy">{{ t('landing.privacy') }}</router-link>
                    <span class="divider">|</span>
                    <router-link to="/terms">{{ t('landing.terms') }}</router-link>
                    <span class="divider">|</span>
                    <a
                        href="https://github.com/NEGIAO/WebGIS-Dev"
                        target="_blank"
                        rel="noopener"
                    >
                        <i class="fab fa-github"></i>
                        GitHub
                    </a>
                    <span class="divider">|</span>
                    <a
                        href="https://www.negiao.cn"
                        target="_blank"
                        rel="noopener"
                    >
                        <IdCard :size="16" />
                        {{ t('landing.homepage') }}
                    </a>
                    <span class="divider">|</span>
                    <a
                        href="https://webgis.negiao.cn"
                        target="_blank"
                        rel="noopener"
                    >
                        <Globe :size="16" />
                        {{ t('landing.officialSite') }}
                    </a>
                </div>
            </div>
        </footer>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useLocale } from '@common/app/useLocale';
import { useUserPreferencesStore } from '../stores';
import { ASSET_BASE_URL } from '../config/publicRuntime';
import {
    Bot,
    ChartArea,
    Cloud,
    CloudSun,
    FileUp,
    Globe,
    IdCard,
    Layers,
    LogIn,
    Mail,
    Map,
    MapPinned,
    Rocket,
    Route,
    Send,
    ShieldCheck,
    UserRound,
    Wrench,
    Zap,
} from '@lucide/vue';

const { t, language } = useLocale();
const userPreferencesStore = useUserPreferencesStore();

// 语言切换器标签用固定文案（各自母语书写），不依赖懒加载 i18n chunk
const LANGUAGE_OPTIONS = Object.freeze([
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'EN' },
]);

/** 与账号中心偏好同一全局开关：本机 SSOT + 登录后回写远端 */
function switchLanguage(nextLanguage) {
    if (!nextLanguage || nextLanguage === language.value) return;
    void userPreferencesStore.setLanguagePreference(nextLanguage);
}

const normalizedBase = ASSET_BASE_URL.endsWith('/') ? ASSET_BASE_URL : `${ASSET_BASE_URL}/`;
// 品牌 logo（icon.webp），与 TopBar / favicon 同一资源
const logoUrl = `${normalizedBase}images/icon.webp`;
// Hugging Face 官方 logo（public/images/hf-logo.svg，品牌资产彩色版）
const hfLogoUrl = `${normalizedBase}images/hf-logo.svg`;

// 核心功能卡片：图标 + i18n key，避免 9 段近似模板重复
const FEATURES = Object.freeze([
    { key: 'feature1', icon: Globe },
    { key: 'feature2', icon: Layers },
    { key: 'feature3', icon: FileUp },
    { key: 'feature4', icon: ChartArea },
    { key: 'feature5', icon: CloudSun },
    { key: 'feature6', icon: Route },
    { key: 'feature7', icon: Bot },
    { key: 'feature8', icon: ShieldCheck },
    { key: 'feature9', icon: Wrench },
]);

const features = computed(() =>
    FEATURES.map((feature) => ({
        ...feature,
        title: t(`landing.${feature.key}Title`),
        desc: t(`landing.${feature.key}Desc`),
    })),
);

// Hero 统计条：数值静态、标签走 i18n
const HERO_STATS = Object.freeze([
    { value: '2D/3D', labelKey: 'landing.statDualEngine' },
    { value: '70+', labelKey: 'landing.statBasemaps' },
    { value: '8', labelKey: 'landing.statAnalysis' },
    { value: 'AI', labelKey: 'landing.statAi' },
]);

const heroStats = computed(() =>
    HERO_STATS.map((stat) => ({
        ...stat,
        label: t(stat.labelKey),
    })),
);
</script>

<style scoped>
*,
*::before,
*::after {
    box-sizing: border-box;
}

/* 全局 html/body 为 overflow:hidden 的全屏地图布局（App.vue），
   本页必须自持滚动容器：固定视口高度 + 内部纵向滚动 */
.landing-container {
    height: 100dvh;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    font-family: var(--font-base, 'PingFang SC', 'Microsoft YaHei', sans-serif);
    color: var(--text-primary);
    background-color: var(--bg-secondary);
    background-image:
        radial-gradient(ellipse 70% 55% at 10% -5%, rgba(var(--brand-primary-rgb), 0.08), transparent 60%),
        radial-gradient(ellipse 55% 45% at 105% 105%, rgba(var(--brand-primary-rgb), 0.06), transparent 60%);
    scroll-behavior: smooth;
}

/* ============ 顶部导航 ============ */
.navbar {
    position: sticky;
    top: 0;
    z-index: var(--z-float, 100);
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border-light);
}

.navbar-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0.9rem 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
}

.brand {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
}

.brand-badge {
    width: 42px;
    height: 42px;
    flex-shrink: 0;
    border-radius: 12px;
    /* 浅色导航上白色 logo 需要深色衬托：品牌绿渐变与注册页绿色头部同色系 */
    background: linear-gradient(140deg, var(--brand-primary) 0%, var(--brand-primary-dark) 100%);
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 14px rgba(var(--brand-primary-rgb), 0.3);
}

.brand-badge img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 8px;
}

.brand-text {
    min-width: 0;
}

.brand-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: 0.3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.brand-subtitle {
    margin: 2px 0 0;
    font-size: 0.75rem;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.nav-actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 12px;
}

/* 语言切换器（浅色导航适配版，注册页为深绿头版） */
.lang-toggle {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    flex-shrink: 0;
}

.lang-btn {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    padding: 6px 9px;
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s ease, color 0.15s ease;
}

.lang-btn:hover {
    background: rgba(var(--brand-primary-rgb), 0.1);
    color: var(--brand-primary-dark);
}

.lang-btn.active {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    box-shadow: 0 2px 6px rgba(var(--brand-primary-rgb), 0.3);
}

.lang-btn:focus-visible {
    outline: 2px solid rgba(var(--brand-primary-rgb), 0.5);
    outline-offset: 1px;
}

.btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    padding: 0.6rem 1.4rem;
    border-radius: 10px;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.9rem;
    box-shadow: 0 4px 12px rgba(var(--brand-primary-rgb), 0.3);
    transition: all 0.2s ease;
}

.btn-primary:hover {
    filter: brightness(1.06);
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(var(--brand-primary-rgb), 0.38);
}

/* ============ 内容区 ============ */
/* 全宽容器：Hero 首屏拉满全屏；下方区块各自限宽居中 */
.content {
    flex: 1;
    width: 100%;
    padding: 0;
}

/* ============ Hero 区域（全宽全屏首屏） ============ */
.hero-section {
    position: relative;
    text-align: center;
    padding: 5rem 0 4rem;
    overflow: hidden;
    min-height: calc(100dvh - 80px);
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.hero-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
}

.hero-bg__grid {
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(rgba(var(--brand-primary-rgb), 0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(var(--brand-primary-rgb), 0.06) 1px, transparent 1px);
    background-size: 42px 42px;
    -webkit-mask-image: radial-gradient(ellipse 80% 70% at 50% 30%, #000 20%, transparent 100%);
    mask-image: radial-gradient(ellipse 80% 70% at 50% 30%, #000 20%, transparent 100%);
}

.hero-bg__blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.35;
}

.hero-bg__blob--1 {
    width: 420px;
    height: 420px;
    top: -120px;
    left: -100px;
    background: rgba(var(--brand-primary-rgb), 0.25);
}

.hero-bg__blob--2 {
    width: 380px;
    height: 380px;
    bottom: -80px;
    right: -80px;
    background: rgba(var(--brand-accent-rgb, 87, 184, 97), 0.2);
}

.hero-inner {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
}

.hero-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 1.5rem;
    padding: 0.45rem 1.1rem;
    border-radius: 999px;
    background: rgba(var(--brand-primary-rgb), 0.1);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.25);
    color: var(--brand-primary-dark);
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.5px;
}

.hero-title {
    margin: 0 0 1.5rem;
    font-size: clamp(2rem, 5vw, 3.2rem);
    font-weight: 800;
    line-height: 1.25;
    color: var(--text-primary);
    letter-spacing: 0.5px;
}

.hero-title-accent {
    background: linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-dark) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
}

.hero-subtitle {
    max-width: 720px;
    margin: 0 auto 2.5rem;
    font-size: 1.05rem;
    line-height: 1.8;
    color: var(--text-secondary);
}

.hero-actions {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 3.5rem;
}

.btn-large,
.btn-outline {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0.85rem 2rem;
    border-radius: 10px;
    text-decoration: none;
    font-weight: 600;
    font-size: 1rem;
    transition: all 0.2s ease;
}

.btn-large {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    box-shadow: 0 4px 16px rgba(var(--brand-primary-rgb), 0.35);
}

.btn-large:hover {
    filter: brightness(1.06);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(var(--brand-primary-rgb), 0.45);
}

.btn-outline {
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border-light);
}

.btn-outline:hover {
    border-color: var(--brand-primary);
    color: var(--brand-primary-dark);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.hero-stats {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 2rem;
    flex-wrap: wrap;
    padding: 1.5rem 2rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 16px;
    box-shadow: var(--shadow-md, 0 4px 16px rgba(0, 0, 0, 0.12));
    max-width: 760px;
    margin: 0 auto;
}

.stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 90px;
}

.stat-value {
    font-size: 1.5rem;
    font-weight: 800;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
}

.stat-label {
    font-size: 0.8rem;
    color: var(--text-muted);
}

.stat-divider {
    width: 1px;
    height: 36px;
    background: var(--border-light);
}

/* ============ 通用区块头 ============ */
.section-head {
    text-align: center;
    margin-bottom: 3rem;
}

.section-eyebrow {
    margin: 0 0 0.5rem;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--brand-primary);
}

.section-title {
    margin: 0 0 0.75rem;
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
}

.section-desc {
    margin: 0;
    font-size: 0.95rem;
    color: var(--text-secondary);
}

/* ============ 核心功能 ============ */
.features-section {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 4rem 2rem;
}

.features-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.5rem;
}

.feature-card {
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 16px;
    padding: 1.8rem 1.6rem;
    transition: all 0.25s ease;
    position: relative;
    overflow: hidden;
}

.feature-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--brand-primary), var(--brand-primary-light));
    opacity: 0;
    transition: opacity 0.25s ease;
}

.feature-card:hover {
    transform: translateY(-4px);
    border-color: rgba(var(--brand-primary-rgb), 0.35);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.feature-card:hover::before {
    opacity: 1;
}

.feature-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: rgba(var(--brand-primary-rgb), 0.1);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    color: var(--brand-primary-dark);
    margin-bottom: 1rem;
    transition: all 0.25s ease;
}

.feature-card:hover .feature-icon {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    border-color: transparent;
    box-shadow: 0 4px 12px rgba(var(--brand-primary-rgb), 0.3);
}

.feature-card h4 {
    margin: 0 0 0.6rem;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-primary);
}

.feature-card p {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.7;
    color: var(--text-secondary);
}

/* ============ 技术栈 ============ */
.tech-section {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 2rem 4rem;
}

.tech-badges {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.8rem;
    flex-wrap: wrap;
}

.tech-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0.55rem 1.2rem;
    border-radius: 999px;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    color: var(--text-secondary);
    font-size: 0.85rem;
    font-weight: 600;
    transition: all 0.2s ease;
}

.tech-badge svg,
.tech-badge i {
    color: var(--brand-primary);
}

.tech-badge:hover {
    border-color: rgba(var(--brand-primary-rgb), 0.4);
    color: var(--brand-primary-dark);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

/* ============ CTA 区域 ============ */
.cta-section {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem 2rem 4rem;
}

.cta-card {
    position: relative;
    text-align: center;
    padding: 3.5rem 2rem;
    border-radius: 20px;
    /* 轻盈版：浅色基底 + 顶部品牌光晕，替代厚重的实心绿块 */
    background:
        radial-gradient(ellipse 60% 90% at 50% -10%, rgba(var(--brand-primary-rgb), 0.14), transparent 65%),
        var(--bg-primary);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    color: var(--text-primary);
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(20, 45, 25, 0.08);
}

.cta-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
}

.cta-bg__grid {
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(rgba(var(--brand-primary-rgb), 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(var(--brand-primary-rgb), 0.05) 1px, transparent 1px);
    background-size: 28px 28px;
    -webkit-mask-image: radial-gradient(ellipse 90% 100% at 50% 0%, #000 30%, transparent 100%);
    mask-image: radial-gradient(ellipse 90% 100% at 50% 0%, #000 30%, transparent 100%);
}

/* 柔光晕：呼应 Hero 的视觉语言 */
.cta-bg__blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(70px);
    opacity: 0.25;
}

.cta-bg__blob--1 {
    width: 320px;
    height: 320px;
    top: -140px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(var(--brand-primary-rgb), 0.3);
}

.cta-bg__blob--2 {
    width: 280px;
    height: 280px;
    bottom: -120px;
    right: -60px;
    background: rgba(var(--brand-accent-rgb, 87, 184, 97), 0.25);
}

.cta-card h3 {
    position: relative;
    margin: 0 0 0.75rem;
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--text-primary);
}

.cta-card p {
    position: relative;
    margin: 0 auto 1.8rem;
    max-width: 520px;
    font-size: 0.95rem;
    line-height: 1.7;
    color: var(--text-secondary);
}

.btn-cta {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    padding: 0.85rem 2.2rem;
    border-radius: 10px;
    text-decoration: none;
    font-weight: 700;
    font-size: 1rem;
    box-shadow: 0 4px 16px rgba(var(--brand-primary-rgb), 0.35);
    transition: all 0.2s ease;
}

.btn-cta:hover {
    filter: brightness(1.06);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(var(--brand-primary-rgb), 0.45);
}

/* 登录方式罗列：按钮下方四个 pill 标签 */
.cta-login-methods {
    position: relative;
    margin: 1.6rem auto 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    font-size: 0.85rem;
    color: var(--text-secondary);
}

.cta-methods-label {
    margin-right: 0.2rem;
}

.cta-method {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0.35rem 0.85rem;
    border-radius: 999px;
    border: 1px solid var(--border-light);
    background: rgba(var(--brand-primary-rgb), 0.05);
    color: var(--text-primary);
    white-space: nowrap;
}

.cta-method i,
.cta-method svg {
    color: var(--brand-primary);
}

/* 商标图标用品牌色（与 RegisterView OAuth 按钮一致） */
/* Google 官方四色 G（2015 起标准版，FA 6.4.0 仅旧版单色字形） */
.cta-method .cta-g-logo {
    width: 14px;
    height: 14px;
}

.cta-method i.fa-github {
    color: #24292f;
}

/* Hugging Face 品牌 logo：官方彩色 SVG（public/images/hf-logo.svg） */
.cta-method .cta-hf-logo {
    width: 14px;
    height: 14px;
}

/* ============ 页脚 ============ */
.footer {
    background: var(--bg-primary);
    border-top: 1px solid var(--border-light);
    padding: 1.5rem 2rem;
}

.footer-inner {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
}

.footer-copyright {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
}

.footer-links {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
}

.footer-links a {
    color: var(--text-secondary);
    text-decoration: none;
    transition: color 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 5px;
}

.footer-links a:hover {
    color: var(--brand-primary);
}

.divider {
    color: var(--border-light);
}

/* ============ 响应式适配 ============ */
@media (max-width: 1024px) {
    .features-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 768px) {
    .navbar-inner {
        padding: 0.75rem 1rem;
    }

    .brand-subtitle {
        display: none;
    }

    .nav-actions {
        gap: 8px;
    }

    .lang-btn {
        padding: 5px 7px;
        font-size: 10px;
    }

    .hero-section {
        padding: 3rem 1rem 2.5rem;
    }

    .hero-title {
        font-size: 1.8rem;
    }

    .hero-subtitle {
        font-size: 0.95rem;
    }

    .hero-actions {
        flex-direction: column;
        width: 100%;
    }

    .btn-large,
    .btn-outline {
        width: 100%;
        justify-content: center;
    }

    .hero-stats {
        gap: 1rem;
        padding: 1.2rem 1rem;
    }

    .stat-item {
        min-width: 70px;
    }

    .stat-value {
        font-size: 1.2rem;
    }

    .features-grid {
        grid-template-columns: 1fr;
        gap: 1rem;
    }

    .features-section {
        padding: 3rem 1rem;
    }

    .tech-section {
        padding: 2rem 1rem 4rem;
    }

    .cta-section {
        padding: 1rem 1rem 4rem;
    }

    .section-title {
        font-size: 1.6rem;
    }

    .cta-card {
        padding: 2.5rem 1.5rem;
    }

    .cta-card h3 {
        font-size: 1.3rem;
    }

    .footer-inner {
        flex-direction: column;
        text-align: center;
        gap: 0.75rem;
    }
}

@media (max-width: 480px) {
    .btn-primary {
        padding: 0.55rem 1rem;
        font-size: 0.82rem;
    }

    .hero-stats {
        flex-wrap: wrap;
    }

    .stat-divider {
        display: none;
    }

    .stat-item {
        flex: 1 1 40%;
    }
}
</style>