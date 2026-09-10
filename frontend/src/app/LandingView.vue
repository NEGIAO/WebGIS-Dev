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
                        to="/home"
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
                            to="/home"
                            class="btn-large"
                        >
                            <Rocket :size="18" />
                            {{ t('landing.tryNow') }}
                        </router-link>
                        <a
                            :href="GITHUB_PAGE_URL"
                            target="_blank"
                            rel="noopener"
                            class="btn-outline"
                        >
                            <i class="fab fa-github"></i>
                            {{ t('landing.githubSource') }}
                        </a>
                    </div>

                    <!-- GitHub 实时认可：Stars / Forks 直读 GitHub API，失败时显示缓存/占位 -->
                    <div
                        class="github-live"
                        aria-live="polite"
                    >
                        <a
                            :href="GITHUB_PAGE_URL"
                            target="_blank"
                            rel="noopener"
                            class="github-pill"
                        >
                            <Star :size="15" />
                            <span class="github-pill-label">{{ t('landing.ossStars') }}</span>
                            <span class="github-pill-value">{{ formattedStars }}</span>
                            <span
                                class="live-dot"
                                :class="{ on: githubIsLive }"
                            ></span>
                            <span class="live-text">{{
                                githubIsLive ? t('landing.ossLive') : t('landing.ossCached')
                            }}</span>
                        </a>
                        <a
                            :href="`${GITHUB_PAGE_URL}/fork`"
                            target="_blank"
                            rel="noopener"
                            class="github-pill"
                        >
                            <GitFork :size="15" />
                            <span class="github-pill-label">{{ t('landing.ossForks') }}</span>
                            <span class="github-pill-value">{{ formattedForks }}</span>
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

            <!-- ============ 开源认可：实时 Stars/Forks + 每日更新的 Star History ============ -->
            <section class="oss-section">
                <div class="section-head">
                    <p class="section-eyebrow">{{ t('landing.ossEyebrow') }}</p>
                    <h3 class="section-title">{{ t('landing.ossTitle') }}</h3>
                    <p class="oss-origin">{{ ossOriginText }}</p>
                </div>

                <!-- 求 Star/Fork 引导：标题下独立条，不嵌卡片 -->
                <div class="oss-support">
                    <p class="oss-support-text">
                        <span>{{ t('landing.ossSupportText1') }}</span>
                        <span>{{ t('landing.ossSupportText2') }}</span>
                    </p>
                    <div class="oss-support-actions">
                        <a
                            :href="GITHUB_PAGE_URL"
                            target="_blank"
                            rel="noopener"
                            class="oss-support-btn oss-support-btn--star"
                        >
                            <Star :size="16" />
                            {{ t('landing.ossStarBtn') }}
                        </a>
                        <a
                            :href="`${GITHUB_PAGE_URL}/fork`"
                            target="_blank"
                            rel="noopener"
                            class="oss-support-btn oss-support-btn--fork"
                        >
                            <GitFork :size="16" />
                            {{ t('landing.ossForkBtn') }}
                        </a>
                    </div>
                </div>

                <div class="oss-stats">
                    <a
                        :href="GITHUB_PAGE_URL"
                        target="_blank"
                        rel="noopener"
                        class="oss-stat"
                    >
                        <span class="oss-stat-icon"><Star :size="18" /></span>
                        <span class="oss-stat-body">
                            <span class="oss-stat-value">{{ formattedStars }}</span>
                            <span class="oss-stat-label">{{ t('landing.ossStars') }}</span>
                        </span>
                    </a>
                    <div class="oss-stat-divider"></div>
                    <a
                        :href="`${GITHUB_PAGE_URL}/forks`"
                        target="_blank"
                        rel="noopener"
                        class="oss-stat"
                    >
                        <span class="oss-stat-icon"><GitFork :size="18" /></span>
                        <span class="oss-stat-body">
                            <span class="oss-stat-value">{{ formattedForks }}</span>
                            <span class="oss-stat-label">{{ t('landing.ossForks') }}</span>
                        </span>
                    </a>
                    <div class="oss-stat-divider"></div>
                    <a
                        :href="GITHUB_PAGE_URL"
                        target="_blank"
                        rel="noopener"
                        class="oss-repo-link"
                    >
                        <span
                            class="live-dot"
                            :class="{ on: githubIsLive }"
                        ></span>
                        {{ githubIsLive ? t('landing.ossLive') : t('landing.ossCached') }}
                        <span
                            v-if="githubUpdatedText"
                            class="oss-updated"
                            >· {{ githubUpdatedText }}</span
                        >
                        <ExternalLink :size="14" />
                        {{ t('landing.ossViewRepo') }}
                    </a>
                </div>

                <a
                    v-if="!chartDead"
                    :href="STAR_HISTORY_PAGE_URL"
                    target="_blank"
                    rel="noopener"
                    class="oss-chart-link"
                >
                    <img
                        :src="starChartSrc"
                        :alt="t('landing.ossChartAlt')"
                        loading="lazy"
                        referrerpolicy="no-referrer"
                        @error="onChartError"
                    />
                    <span class="oss-chart-caption">{{ t('landing.ossChartCaption') }}</span>
                </a>
                <p
                    v-else
                    class="oss-chart-unavailable"
                >
                    {{ t('landing.ossChartUnavailable') }}
                </p>
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
                        to="/home"
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
import { computed, onMounted, ref } from 'vue';
import { useLocale } from '@common/app/useLocale';
import { useUserPreferencesStore } from '../stores';
import { ASSET_BASE_URL, GITHUB_STATS_WORKER_URL } from '../config/publicRuntime';
import {
    Bot,
    ChartArea,
    Cloud,
    CloudSun,
    ExternalLink,
    FileUp,
    GitFork,
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
    Star,
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

// ============ GitHub 实时认可数据（Stars / Forks） ============
// 直调 GitHub 公开仓库 API（CORS 允许，无需后端代理）：
// https://api.github.com/repos/NEGIAO/WebGIS-Dev
// 未登录限流 60 次/小时/IP，落地页每次访问约 1 次，足够面试展示用。
// 策略：localStorage 缓存先行展示 → 后台 revalidate → 失败则保留缓存/占位，不阻塞首屏。
const GITHUB_REPO = 'NEGIAO/WebGIS-Dev';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}`;
const GITHUB_CACHE_KEY = 'webgis-github-stats-v1';
const GITHUB_CACHE_TTL_MS = 10 * 60 * 1000;
const GITHUB_PAGE_URL = `https://github.com/${GITHUB_REPO}`;
const STAR_HISTORY_PAGE_URL =
    'https://www.star-history.com/?repos=NEGIAO%2FWebGIS-Dev&type=timeline&legend=top-left';
// star-history 官方 sealed_token 图表：服务端每次访问时用仓库主人授权的
// fine-grained PAT 重新渲染，天然“每日更新”。URL 必须保持原样，勿拼接多余参数。
// 固定使用浅色（白色底）版本：深色系统下也不切换，保证面试展示时永远是白底。
const STAR_CHART_URL =
    'https://api.star-history.com/chart?repos=NEGIAO/WebGIS-Dev&type=timeline&legend=top-left&sealed_token=B5ReoH7FL9EMbjs7rJJ3APlIoYZwGKo3g2gC_4_0LxIrQ--e5uhUrYXR7UEBcnb3CU48BAX9--IyzI-TxTszy8HrMJ3oVSVvfowMjrMOxY8n477EUd4_Ip6F8EMaHsKX6H5b1JjudmBoRUn3HxJ1R6zxt3lO1CKGidFnlqFb2W_TXYy_sTk3AS3rn8v8';

// ============ Cloudflare Worker 边缘代理（国内直连 GitHub 不稳定时的首选链路） ============
// Worker（workers/github-stats/）在边缘抓 GitHub 并缓存 10 分钟，前端一次请求拿全量数据。
// 未配置（VITE_GITHUB_STATS_WORKER_URL 为空）则自动降级为直连 GitHub，有本地缓存兜底。
const WORKER_STATS_URL = GITHUB_STATS_WORKER_URL ? `${GITHUB_STATS_WORKER_URL}/api/stats` : '';
const WORKER_CHART_URL = GITHUB_STATS_WORKER_URL ? `${GITHUB_STATS_WORKER_URL}/api/chart` : '';
const WORKER_TIMEOUT_MS = 8000;

const githubStars = ref(null);
const githubForks = ref(null);
const githubUpdatedAt = ref('');
const githubIsLive = ref(false);

function formatCount(value) {
    if (value == null) return '—';
    try {
        return Number(value).toLocaleString(language.value === 'zh-CN' ? 'zh-CN' : 'en-US');
    } catch {
        return String(value);
    }
}

const formattedStars = computed(() => formatCount(githubStars.value));
const formattedForks = computed(() => formatCount(githubForks.value));
// 趋势图：配了 Worker 就走边缘代理（国内稳 + 边缘缓存），否则直连 star-history
const chartUseFallback = ref(false);
const chartDead = ref(false);
const starChartSrc = computed(() => {
    if (chartUseFallback.value) return STAR_CHART_URL;
    return WORKER_CHART_URL || STAR_CHART_URL;
});
// 图片加载失败兜底：Worker 图床不通 → 降级直连再试一次 → 仍失败则隐藏图片保版面
function onChartError() {
    if (!chartUseFallback.value && WORKER_CHART_URL) {
        chartUseFallback.value = true;
    } else {
        chartDead.value = true;
    }
}
const githubUpdatedText = computed(() => {
    if (!githubUpdatedAt.value) return '';
    let text = githubUpdatedAt.value;
    try {
        const date = new Date(githubUpdatedAt.value);
        if (!Number.isNaN(date.getTime())) {
            text = date.toLocaleDateString(language.value === 'zh-CN' ? 'zh-CN' : 'en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            });
        }
    } catch {
        /* 保持原始字符串 */
    }
    return t('landing.ossUpdatedAt', { time: text });
});

function readGithubCache() {
    try {
        const raw = localStorage.getItem(GITHUB_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (
            !parsed ||
            typeof parsed !== 'object' ||
            typeof parsed.stars !== 'number' ||
            typeof parsed.forks !== 'number'
        ) {
            return null;
        }
        if (Date.now() - Number(parsed.fetchedAt || 0) > GITHUB_CACHE_TTL_MS * 6) return null;
        return parsed;
    } catch {
        return null;
    }
}

async function fetchGithubStats() {
    const cached = readGithubCache();
    if (cached) {
        githubStars.value = cached.stars;
        githubForks.value = cached.forks;
        githubUpdatedAt.value = cached.updatedAt || '';
    }
    try {
        const response = await fetch(GITHUB_API_URL, {
            headers: { Accept: 'application/vnd.github+json' },
        });
        if (!response.ok) throw new Error(`GitHub API ${response.status}`);
        const data = await response.json();
        if (typeof data.stargazers_count === 'number') githubStars.value = data.stargazers_count;
        if (typeof data.forks_count === 'number') githubForks.value = data.forks_count;
        githubUpdatedAt.value = data.pushed_at || data.updated_at || '';
        githubIsLive.value = true;
        try {
            localStorage.setItem(
                GITHUB_CACHE_KEY,
                JSON.stringify({
                    stars: githubStars.value,
                    forks: githubForks.value,
                    updatedAt: githubUpdatedAt.value,
                    fetchedAt: Date.now(),
                }),
            );
        } catch {
            /* 隐私模式无存储也照常展示实时值 */
        }
    } catch (error) {
        console.warn('[Landing] GitHub stats fetch failed, keep cache/fallback:', error);
    }
}

// ============ 项目版本号：README 为唯一正式来源 ============
// 运行时抓取 main 分支 README 全文并解析版本号，README 一改、落地页自动跟进。
// 解析优先级：①“当前版本 V3.5.x”正式声明 → ②版本演进表首个 Vx.y.z → ③页脚 <sub>Vx.y.z</sub>。
// 缓存先行展示 → 后台 revalidate → 失败则保留缓存/无版本号兜底文案。
const README_URL = 'https://raw.githubusercontent.com/NEGIAO/WebGIS-Dev/main/README.md';
const VERSION_CACHE_KEY = 'webgis-app-version-v1';

const appVersion = ref('');

const ossOriginText = computed(() =>
    appVersion.value
        ? t('landing.ossOrigin', { version: appVersion.value })
        : t('landing.ossOriginFallback'),
);

function parseVersionFromReadme(markdown) {
    if (!markdown || typeof markdown !== 'string') return '';
    const declared = markdown.match(/当前版本\s*[Vv]?(\d+\.\d+(?:\.\d+)?)/);
    if (declared) return `V${declared[1]}`;
    // 版本演进表按最新在前排序，取首行（避免误命中正文里的历史版本号，如 Docker 镜像旧版本）
    const tableRow = markdown.match(/\|\s*\*\*V(\d+\.\d+\.\d+)\*\*\s*\|/);
    if (tableRow) return `V${tableRow[1]}`;
    const footer = markdown.match(/<sub>V(\d+\.\d+\.\d+)/);
    if (footer) return `V${footer[1]}`;
    return '';
}

async function fetchAppVersion() {
    try {
        const cached = localStorage.getItem(VERSION_CACHE_KEY);
        if (cached) appVersion.value = String(cached);
    } catch {
        /* 隐私模式无存储则直接走网络 */
    }
    try {
        const response = await fetch(README_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`README ${response.status}`);
        const version = parseVersionFromReadme(await response.text());
        if (version) {
            appVersion.value = version;
            try {
                localStorage.setItem(VERSION_CACHE_KEY, version);
            } catch {
                /* 隐私模式无存储也照常展示本次解析值 */
            }
        }
    } catch (error) {
        console.warn('[Landing] README version fetch failed, keep cache/fallback:', error);
    }
}

// ---- Worker 链路（含本地缓存秒开） ----
async function fetchJsonWithTimeout(url, timeoutMs = WORKER_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

/** 首屏同步展示本地缓存，不等待任何网络；真正的刷新由 Worker/直连在后台完成 */
function applyLocalCaches() {
    const cached = readGithubCache();
    if (cached) {
        githubStars.value = cached.stars;
        githubForks.value = cached.forks;
        githubUpdatedAt.value = cached.updatedAt || '';
    }
    try {
        const version = localStorage.getItem(VERSION_CACHE_KEY);
        if (version) appVersion.value = String(version);
    } catch {
        /* 隐私模式无存储则等待网络 */
    }
}

function persistLocalCaches() {
    try {
        localStorage.setItem(
            GITHUB_CACHE_KEY,
            JSON.stringify({
                stars: githubStars.value,
                forks: githubForks.value,
                updatedAt: githubUpdatedAt.value,
                fetchedAt: Date.now(),
            }),
        );
    } catch {
        /* 隐私模式无存储也照常展示本次值 */
    }
    try {
        if (appVersion.value) localStorage.setItem(VERSION_CACHE_KEY, appVersion.value);
    } catch {
        /* 同上 */
    }
}

/** Worker 优先：一次请求拿全 Stars / Forks / 版本号（边缘缓存 10 分钟） */
async function fetchViaWorker() {
    if (!WORKER_STATS_URL) return false;
    try {
        const data = await fetchJsonWithTimeout(WORKER_STATS_URL);
        if (!data || typeof data !== 'object') return false;
        let useful = false;
        if (typeof data.stars === 'number') {
            githubStars.value = data.stars;
            githubIsLive.value = true;
            useful = true;
        }
        if (typeof data.forks === 'number') {
            githubForks.value = data.forks;
            useful = true;
        }
        if (data.updatedAt) githubUpdatedAt.value = data.updatedAt;
        if (data.version) {
            appVersion.value = data.version;
            useful = true;
        }
        if (!useful) return false;
        persistLocalCaches();
        return true;
    } catch (error) {
        console.warn('[Landing] Worker stats failed, fallback to direct GitHub:', error);
        return false;
    }
}

onMounted(() => {
    applyLocalCaches(); // 本地缓存秒开，首屏不等待任何网络
    void (async () => {
        if (await fetchViaWorker()) return; // Worker 命中则不再打扰 GitHub
        void fetchGithubStats(); // 直连兜底（同样缓存先行）
        void fetchAppVersion();
    })();
});
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
    margin-bottom: 1.25rem;
}

/* GitHub 实时认可 pills：首屏即见，面试官一眼看到社区认可 */
.github-live {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 2.5rem;
}

.github-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0.45rem 1rem;
    border-radius: 999px;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    color: var(--text-primary);
    font-size: 0.85rem;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.2s ease;
}

.github-pill svg {
    color: var(--brand-primary-dark);
}

.github-pill:hover {
    border-color: rgba(var(--brand-primary-rgb), 0.45);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.07);
}

.github-pill-value {
    font-variant-numeric: tabular-nums;
}

.live-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #c9cdd3;
    flex-shrink: 0;
}

.live-dot.on {
    background: #22c55e;
    box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.18);
    animation: live-pulse 2s ease-in-out infinite;
}

@keyframes live-pulse {
    0%,
    100% {
        box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);
    }
    50% {
        box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.08);
    }
}

.live-text {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--text-muted);
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

/* ============ 开源认可（Star History） ============ */
.oss-section {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 2rem 4rem;
}

/* 本区头后直接跟引导条，全局 3rem 间距过大，单独收窄 */
.oss-section .section-head {
    margin-bottom: 1.5rem;
}

.oss-stats {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
}

.oss-stat {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
    color: inherit;
    padding: 0.4rem 0.6rem;
    border-radius: 12px;
    transition: background 0.2s ease;
}

.oss-stat:hover {
    background: rgba(var(--brand-primary-rgb), 0.07);
}

.oss-stat-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: rgba(var(--brand-primary-rgb), 0.1);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--brand-primary-dark);
    flex-shrink: 0;
}

.oss-stat-body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1.3;
}

.oss-stat-value {
    font-size: 1.4rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
}

.oss-stat-label {
    font-size: 0.8rem;
    color: var(--text-muted);
}

.oss-stat-divider {
    width: 1px;
    height: 40px;
    background: var(--border-light);
}

.oss-repo-link {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 999px;
    border: 1px solid var(--border-light);
    background: rgba(var(--brand-primary-rgb), 0.05);
    transition: all 0.2s ease;
}

.oss-repo-link:hover {
    color: var(--brand-primary-dark);
    border-color: rgba(var(--brand-primary-rgb), 0.45);
}

.oss-updated {
    font-weight: 400;
    color: var(--text-muted);
}

.oss-chart-link {
    display: block;
    width: 100%;
    max-width: 760px;
    margin: 0 auto;
    text-decoration: none;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid var(--border-light);
    background: #fff;
    transition: box-shadow 0.25s ease, transform 0.25s ease;
}

.oss-chart-link:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.1);
}

.oss-chart-link picture,
.oss-chart-link img {
    display: block;
    width: 100%;
    height: auto;
    background: #fff;
}

.oss-chart-caption {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0.8rem 1rem;
    font-size: 0.82rem;
    color: var(--text-muted);
    background: var(--bg-primary);
    border-top: 1px solid var(--border-light);
}

.oss-chart-link:hover .oss-chart-caption {
    color: var(--brand-primary-dark);
}

/* 趋势图双链路全断时的占位文案：保版面，不出现裂图图标 */
.oss-chart-unavailable {
    width: 100%;
    max-width: 760px;
    margin: 0 auto;
    padding: 2rem 1rem;
    text-align: center;
    font-size: 0.85rem;
    color: var(--text-muted);
    border: 1px dashed var(--border-light);
    border-radius: 14px;
    background: rgba(var(--brand-primary-rgb), 0.04);
}

/* 求 Star/Fork 引导：标题下独立无框条，与区块融为一体 */
.oss-support {
    width: 100%;
    max-width: 760px;
    margin: 0 auto 1.4rem;
    text-align: center;
}

.oss-support-text {
    margin: 0 auto 1.1rem;
    max-width: 600px;
    font-size: 0.92rem;
    line-height: 1.8;
    color: var(--text-primary);
    font-weight: 600;
    text-wrap: balance;
}

.oss-support-text span {
    display: block;
}

.oss-support-actions {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.8rem;
    flex-wrap: wrap;
}

.oss-support-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0.65rem 1.6rem;
    border-radius: 10px;
    font-weight: 600;
    font-size: 0.9rem;
    text-decoration: none;
    transition: all 0.2s ease;
}

.oss-support-btn--star {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    box-shadow: 0 4px 12px rgba(var(--brand-primary-rgb), 0.3);
}

.oss-support-btn--star:hover {
    filter: brightness(1.06);
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(var(--brand-primary-rgb), 0.4);
}

.oss-support-btn--fork {
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border-light);
}

.oss-support-btn--fork:hover {
    border-color: var(--brand-primary);
    color: var(--brand-primary-dark);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

/* 项目渊源说明：弱化处理，不抢图表风头 */
.oss-origin {
    margin: 0.6rem auto 0;
    max-width: 640px;
    font-size: 0.85rem;
    line-height: 1.7;
    color: var(--text-muted);
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

    .oss-section {
        padding: 1rem 1rem 3rem;
    }

    .oss-stat-divider {
        display: none;
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