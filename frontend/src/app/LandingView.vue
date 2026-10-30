<template>
    <div
        ref="landingEl"
        class="landing-container"
    >
        <!-- ============ 顶部导航 ============ -->
        <header class="navbar">
            <div class="navbar-inner">
                <div class="brand">
                    <!-- 方案A「无底牌单色 logo」：不做色块底衬。
                         CSS mask 取 logo 自身 alpha 作遮罩，把纯白线稿染成品牌深绿，
                         直接落在浅色玻璃导航上 —— 无色块即无"突兀"来源。
                         遮罩 url 与资源同源，经内联 CSS 变量传入 -->
                    <div
                        class="brand-badge"
                        :style="brandBadgeStyle"
                        aria-hidden="true"
                    ></div>
                    <div class="brand-text">
                        <h1 class="brand-title">NEGIAO's WebGIS</h1>
                        <p class="brand-subtitle">{{ t('auth.appPurpose') }}</p>
                    </div>
                </div>
                <!-- 中部锚点导航：填补品牌区与操作区之间的空白。
                     hash 路由下原生 href="#id" 会被 router 解析为路径跳转，
                     故页内定位一律用 button + scrollIntoView，active 态由 scroll spy 驱动 -->
                <nav
                    class="nav-links"
                    :aria-label="t('landing.navAria')"
                >
                    <button
                        v-for="item in navAnchors"
                        :key="item.id"
                        type="button"
                        class="nav-link"
                        :class="{ active: activeAnchor === item.id }"
                        :aria-current="activeAnchor === item.id ? 'true' : undefined"
                        @click="scrollToSection(item.id)"
                    >
                        {{ t(item.labelKey) }}
                    </button>
                </nav>
                <div class="nav-actions">
                    <!-- 移动端全屏菜单触发钮（≤1024px 显示；桌面锚点组隐藏后由此承接导航）。
                         aria-label 跟着展开状态切换，与 aria-expanded 保持一致 ——
                         原来这里错用了覆层的 menuAria（"站点导航"），
                         按钮会被读成"站点导航，按钮，已展开"，语义是反的 -->
                    <button
                        type="button"
                        class="nav-burger"
                        :class="{ active: menuOpen }"
                        :aria-expanded="menuOpen ? 'true' : 'false'"
                        :aria-label="menuOpen ? t('landing.menuCloseAria') : t('landing.menuOpenAria')"
                        @click="toggleMenu"
                    >
                        <span></span>
                        <span></span>
                        <span></span>
                    </button>
                    <!-- GitHub Star 快捷入口：落地页最醒目的社交证明前置到导航层 -->
                    <a
                        :href="GITHUB_PAGE_URL"
                        target="_blank"
                        rel="noopener"
                        class="nav-github"
                        :aria-label="t('landing.navGithubAria', { count: formattedStars })"
                    >
                        <svg
                            class="icon-github"
                            width="15"
                            height="15"
                            viewBox="0 0 16 16"
                            aria-hidden="true"
                        >
                            <path
                                :d="GITHUB_MARK_PATH"
                            />
                        </svg>
                        <span class="nav-github-count">{{ formattedStars }}</span>
                    </a>
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
                    <!-- aria-label 兜底：≤480px 时 .btn-primary-label 被隐藏、
                         按钮只剩 LogIn 图标，读屏仍能拿到完整文案
                         （与 .nav-github 隐藏 .nav-github-count 同一套处理） -->
                    <router-link
                        to="/register"
                        class="btn-primary"
                        :aria-label="t('landing.navLogin')"
                    >
                        <LogIn :size="16" />
                        <span class="btn-primary-label">{{ t('landing.navLogin') }}</span>
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
                    <!-- 右上角超大半透明光晕（借鉴南师大 .ind1-sunlight1：
                         width 44.95vw; top -3.125vw 的巨型低透明装饰）。
                         给首屏右上角加纵深，纯装饰、不可交互 -->
                    <div class="hero-bg__sun"></div>
                    <!-- 同心轨道环：WebGIS 产品的"地球 / 经纬"意象，
                         同时补上方框版式最缺的圆形语汇。三环不同尺寸、
                         不同方向、不同周期，避免看起来像同一个圆复制三份 -->
                    <div class="hero-bg__rings">
                        <div class="hero-bg__ring hero-bg__ring--outer"></div>
                        <div class="hero-bg__ring hero-bg__ring--mid"></div>
                        <div class="hero-bg__ring hero-bg__ring--inner"></div>
                    </div>
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
                        {{ t('landing.heroSubtitleLead') }}<br />
                        {{ t('landing.heroSubtitleTail') }}
                    </p>

                    <!-- 统计条：四枚圆形数据卡（原型取自南师大 .d-numDUl-1 的
                         圆形托底 + 中间大数字 + 下方说明），错落排布。
                         原先是一条白色长卡 + 竖分隔线，属纯方框语言。
                         位置：副标题正下方、按钮之前 —— "社会证明"先于
                         "行动号召"，首屏不会第一眼落在出口上。
                         ref 供「数字滚动」的 IntersectionObserver 锚定 -->
                    <div
                        ref="heroStatsEl"
                        class="hero-stats"
                    >
                        <div
                            v-for="(stat, index) in heroStats"
                            :key="stat.labelKey"
                            class="stat-item"
                        >
                            <span class="stat-face">
                                <span class="stat-value">{{
                                    stat.num != null ? `${statDisplay[index]}${stat.suffix}` : stat.value
                                }}</span>
                            </span>
                            <span class="stat-label">{{ stat.label }}</span>
                        </div>
                    </div>

                    <div class="hero-actions">
                        <router-link
                            to="/register"
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
                            <svg
                                class="icon-github"
                                width="15"
                                height="15"
                                viewBox="0 0 16 16"
                                aria-hidden="true"
                            >
                                <path
                                    :d="GITHUB_MARK_PATH"
                                />
                            </svg>
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
                </div>
            </section>

            <!-- ============ 核心功能 ============ -->
            <section
                id="features"
                class="features-section"
            >
                <!-- 背景与内容解耦层（借鉴南师大 ind*-bg1）：绝对定位光斑 + 网格，
                    内容浮其上；换肤/换主题只动此层，参考 hero-bg 手法 -->
                <div
                    class="section-bg"
                    aria-hidden="true"
                ></div>
                <SectionTitle
                    :eyebrow="t('landing.featuresEyebrow')"
                    :title="t('landing.featuresTitle')"
                    :desc="t('landing.featuresDesc')"
                />

                <!-- ref 供「三栏分左右对称入场」的 IntersectionObserver 锚定：
                     进入视口时各卡从两侧往中间合（借鉴南师大 .d-news1） -->
                <div
                    ref="featuresGridEl"
                    class="features-grid"
                >
                    <div
                        v-for="feature in features"
                        :id="`feature-${feature.no}`"
                        :key="feature.key"
                        class="feature-card"
                        :class="{
                            'feature-card--hero': feature.hero,
                            'feature-card--wide': feature.wide,
                        }"
                    >
                        <!-- 序号章：装饰性，读屏器跳过 -->
                        <span
                            class="feature-no"
                            aria-hidden="true"
                        >{{ feature.no }}</span>
                        <div class="feature-icon">
                            <component :is="feature.icon" :size="22" />
                        </div>
                        <h4>{{ feature.title }}</h4>
                        <p>{{ feature.desc }}</p>
                        <div
                            v-if="feature.hero"
                            class="feature-hero-preview"
                        >
                            <img
                                :src="previewUrl"
                                :alt="feature.title"
                                class="feature-hero-preview__img"
                                loading="lazy"
                                decoding="async"
                                draggable="false"
                            />
                        </div>
                    </div>
                </div>
            </section>

            <!-- ============ 技术栈 ============
                 外层 section 承接定位；内容由 .tech-inner 收进 1200px 版心 -->
            <section
                id="tech"
                class="tech-section"
            >
                <div
                    class="section-bg"
                    aria-hidden="true"
                ></div>
                <div class="tech-inner">
                <SectionTitle
                    :eyebrow="t('landing.techEyebrow')"
                    :title="t('landing.techTitle')"
                    :desc="t('landing.techDesc')"
                />

                <!-- 三层架构：渲染 → 服务 → 交付。
                     每层一张卡，卡内逐项说明该技术在本项目里"负责哪一段"，
                     让技术栈读起来是一条链路，而不是一排徽章 -->
                <div class="tech-layers">
                    <article
                        v-for="layer in techLayers"
                        :id="`tech-layer-${layer.no}`"
                        :key="layer.no"
                        class="tech-layer"
                    >
                        <header class="tech-layer__head">
                            <span
                                class="tech-layer__no"
                                aria-hidden="true"
                            >{{ layer.no }}</span>
                            <div class="tech-layer__titles">
                                <h4 class="tech-layer__name">{{ layer.name }}</h4>
                                <p
                                    class="tech-layer__en"
                                    aria-hidden="true"
                                >{{ layer.en }}</p>
                            </div>
                        </header>

                        <p class="tech-layer__role">{{ layer.role }}</p>

                        <ul class="tech-layer__items">
                            <li
                                v-for="item in layer.items"
                                :key="item.label"
                                class="tech-layer__item"
                            >
                                <span class="tech-layer__icon">
                                    <i
                                        v-if="item.fa"
                                        :class="item.fa"
                                    ></i>
                                    <component
                                        :is="item.icon"
                                        v-else
                                        :size="14"
                                    />
                                </span>
                                <div class="tech-layer__body">
                                    <p class="tech-layer__label">{{ item.label }}</p>
                                    <p class="tech-layer__duty">{{ item.duty }}</p>
                                </div>
                            </li>
                        </ul>

                        <p class="tech-layer__tags">{{ layer.tags }}</p>
                    </article>
                </div>

                <!-- 完整依赖清单：与上方卡片同源（TECH_STACK 由 TECH_LAYERS 拍平而来） -->
                <p class="tech-stack-caption">{{ t('landing.techStackCaption') }}</p>
                <div class="tech-badges">
                    <span
                        v-for="tech in TECH_STACK"
                        :key="tech.label"
                        class="tech-badge"
                    >
                        <i
                            v-if="tech.fa"
                            :class="tech.fa"
                        ></i>
                        <component
                            :is="tech.icon"
                            v-else
                            :size="16"
                        />
                        {{ tech.label }}
                    </span>
                </div>
                </div>
            </section>

            <!-- ============ 开源认可：实时 Stars/Forks + 每日更新的 Star History ============ -->
            <section
                id="oss"
                class="oss-section"
            >
                <div
                    class="section-bg"
                    aria-hidden="true"
                ></div>
                <SectionTitle
                    :eyebrow="t('landing.ossEyebrow')"
                    :title="t('landing.ossTitle')"
                    compact
                >
                    <p class="oss-origin">{{ ossOriginText }}</p>
                </SectionTitle>

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
                            <span class="oss-support-btn-value">{{ formattedStars }}</span>
                        </a>
                        <a
                            :href="`${GITHUB_PAGE_URL}/fork`"
                            target="_blank"
                            rel="noopener"
                            class="oss-support-btn oss-support-btn--fork"
                        >
                            <GitFork :size="16" />
                            {{ t('landing.ossForkBtn') }}
                            <span class="oss-support-btn-value">{{ formattedForks }}</span>
                        </a>
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
                            <!-- 两级日期徽章（借鉴南师大 .time .t1 日 + .t2 年月）：
                                 大日数字 + 小字「年.月」，比一长串 "数据更新于 …"
                                 更有"刻度"感；解析失败时不渲染，胶囊保持原样 -->
                            <span
                                v-if="githubUpdatedParts"
                                class="oss-date"
                                :aria-label="t('landing.ossUpdatedAt', {
                                    time: `${githubUpdatedParts.ym}.${githubUpdatedParts.day}`,
                                })"
                            >
                                <b
                                    class="oss-date__day"
                                    aria-hidden="true"
                                >{{ githubUpdatedParts.day }}</b>
                                <span
                                    class="oss-date__ym"
                                    aria-hidden="true"
                                >{{ githubUpdatedParts.ym }}</span>
                            </span>
                            <ExternalLink :size="14" />
                            {{ t('landing.ossViewRepo') }}
                        </a>
                    </div>
                </div>

                <a
                    v-if="!chartDead && starChartSrc"
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
                    <!-- 收尾节复用同一套同心圆语汇，与首屏前后呼应 -->
                    <div class="cta-bg__rings">
                        <div class="cta-bg__ring cta-bg__ring--outer"></div>
                        <div class="cta-bg__ring cta-bg__ring--inner"></div>
                    </div>
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
                        <span class="cta-method"><svg
                        class="icon-github"
                        width="15"
                        height="15"
                        viewBox="0 0 16 16"
                        aria-hidden="true"
                    >
                        <path
                            :d="GITHUB_MARK_PATH"
                        />
                    </svg>GitHub</span>
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
        <!-- 三层结构（借鉴南师 .box-footer1）：
             1. footer-quick  快捷入口圆钮 —— 几个真正的常去入口；
             2. footer-rule   发丝分隔线（两端虚化渐变）；
             3. footer-meta   法务行 —— 版权 + 隐私/服务条款 -->
        <footer class="footer">
            <div class="footer-inner">
                <ul class="footer-quick">
                    <li>
                        <span class="footer-link-pop">
                            <a
                                :href="GITHUB_PAGE_URL"
                                target="_blank"
                                rel="noopener"
                                class="footer-entry"
                                :aria-label="t('landing.githubSource')"
                            >
                                <svg
                                    class="icon-github"
                                    width="15"
                                    height="15"
                                    viewBox="0 0 16 16"
                                    aria-hidden="true"
                                >
                                    <path
                                        :d="GITHUB_MARK_PATH"
                                    />
                                </svg>
                            </a>
                            <span
                                class="footer-pop"
                                role="tooltip"
                                >github.com/NEGIAO/WebGIS-Dev</span
                            >
                        </span>
                    </li>
                    <li>
                        <span class="footer-link-pop">
                            <a
                                href="https://www.negiao.cn"
                                target="_blank"
                                rel="noopener"
                                class="footer-entry"
                                :aria-label="t('landing.homepage')"
                            >
                                <IdCard
                                    :size="17"
                                    aria-hidden="true"
                                />
                            </a>
                            <span
                                class="footer-pop"
                                role="tooltip"
                                >negiao.cn</span
                            >
                        </span>
                    </li>
                    <li>
                        <span class="footer-link-pop">
                            <a
                                href="https://webgis.negiao.cn"
                                target="_blank"
                                rel="noopener"
                                class="footer-entry"
                                :aria-label="t('landing.officialSite')"
                            >
                                <Globe
                                    :size="17"
                                    aria-hidden="true"
                                />
                            </a>
                            <span
                                class="footer-pop"
                                role="tooltip"
                                >webgis.negiao.cn</span
                            >
                        </span>
                    </li>
                </ul>
                <!-- 51.la 访客数据：取数在 fetchVisitorStats()，这里只负责渲染。
                     不让第三方脚本往 DOM 插节点 —— 该元素在 vnode 里无子节点，
                     Vue 重渲染时会把它不认识的子节点整体清空（详见 script 段注释） -->
                <div
                    v-if="visitorStats.length"
                    class="footer-visitor"
                >
                    <span class="footer-visitor__title">{{ t('landing.visitorTitle') }}</span>
                    <span
                        v-for="row in visitorStats"
                        :key="row.label"
                        class="footer-visitor__item"
                    >
                        <span class="footer-visitor__label">{{ row.label }}</span>
                        <b class="footer-visitor__value">{{ row.text }}</b>
                    </span>
                    <span
                        v-if="visitorUpdatedAt"
                        class="footer-visitor__stamp"
                        >{{ t('landing.visitorUpdatedAt', { time: visitorUpdatedAt }) }}</span
                    >
                </div>
                <div
                    class="footer-rule"
                    aria-hidden="true"
                ></div>
                <div class="footer-meta">
                    <p class="footer-copyright">
                        {{ t('landing.copyright') }}
                    </p>
                    <div class="footer-links">
                        <router-link to="/privacy">
                            <span class="cjk-break">{{ cjkBreak(t('landing.privacy')) }}</span>
                        </router-link>
                        <span
                            class="divider"
                            aria-hidden="true"
                        >|</span>
                        <router-link to="/terms">
                            <span class="cjk-break">{{ cjkBreak(t('landing.terms')) }}</span>
                        </router-link>
                    </div>
                </div>
            </div>
        </footer>

        <!-- 右侧轨道式区块导航（P1#7）：Hero 轨道环语汇在导航处的收束，
             三枚轨道点对应三大节，选中态拉长成胶囊（复用 scroll spy 的 activeAnchor） -->
        <nav
            class="section-orbit"
            :aria-label="t('landing.orbitAria')"
        >
            <button
                v-for="item in navAnchors"
                :key="item.id"
                type="button"
                class="orbit-dot"
                :class="{ active: activeAnchor === item.id }"
                :aria-label="t(item.labelKey)"
                :aria-current="activeAnchor === item.id ? 'true' : undefined"
                @click="scrollToSection(item.id)"
            ></button>
        </nav>

        <!-- 移动端全屏菜单覆层（P2#10）：浅色"纸面"，与整页同一套语汇 ——
             顶部品牌渐变封边 + 细网格 + 双色柔光（与 .section-bg 同源），
             左侧衬线大字配金序号、虚线分隔，底部渐变 CTA + 个人主页。
             translateY(-100%→0) 0.35s 滑入；打开时锁定 .landing-container 滚动 -->
        <transition name="menu-fade">
            <div
                v-if="menuOpen"
                class="mobile-menu"
                role="dialog"
                aria-modal="true"
                :aria-label="t('landing.menuAria')"
            >
                <!-- 顶栏与导航条等高，覆层盖上来时品牌落点不跳 -->
                <div class="mobile-menu__bar">
                    <span class="mobile-menu__brand">
                        <span
                            class="brand-badge"
                            :style="brandBadgeStyle"
                            aria-hidden="true"
                        ></span>
                        <span class="mobile-menu__wordmark">NEGIAO's WebGIS</span>
                    </span>
                    <button
                        type="button"
                        class="mobile-menu__close"
                        :aria-label="t('landing.menuCloseAria')"
                        @click="closeMenu"
                    >×</button>
                </div>

                <!-- 两级索引，结构照搬南师大 header-con：
                     栏目（h2.title）→ 子项（dl > dd）。左对齐 + 发丝线 + 右箭头；
                     子项单列紧凑排布，靠内容密度把一屏填满 -->
                <nav class="mobile-menu__nav">
                    <ul class="mobile-menu__list">
                        <li
                            v-for="(group, index) in MOBILE_MENU"
                            :key="group.id"
                        >
                            <button
                                type="button"
                                class="mobile-menu__head"
                                @click="closeMenu(); scrollToSection(group.id)"
                            >
                                <span
                                    class="mobile-menu__no"
                                    aria-hidden="true"
                                >{{ String(index + 1).padStart(2, '0') }}</span>
                                <span class="mobile-menu__label">{{ group.label }}</span>
                                <ChevronRight
                                    class="mobile-menu__arrow"
                                    :size="16"
                                    aria-hidden="true"
                                />
                            </button>

                            <ul
                                v-if="group.children.length"
                                class="mobile-menu__sub"
                            >
                                <li
                                    v-for="child in group.children"
                                    :key="child.id"
                                >
                                    <button
                                        type="button"
                                        class="mobile-menu__sub-link"
                                        @click="closeMenu(); scrollToSection(child.id)"
                                    >{{ child.label }}</button>
                                </li>
                            </ul>
                        </li>

                        <li>
                            <a
                                :href="GITHUB_PAGE_URL"
                                target="_blank"
                                rel="noopener"
                                class="mobile-menu__head mobile-menu__head--ext"
                                @click="closeMenu"
                            >
                                <span
                                    class="mobile-menu__no"
                                    aria-hidden="true"
                                >
                                    <svg
                                        class="icon-github"
                                        width="15"
                                        height="15"
                                        viewBox="0 0 16 16"
                                        aria-hidden="true"
                                    >
                                        <path
                                            :d="GITHUB_MARK_PATH"
                                        />
                                    </svg>
                                </span>
                                <span class="mobile-menu__label">GitHub</span>
                                <ExternalLink
                                    class="mobile-menu__arrow"
                                    :size="15"
                                    aria-hidden="true"
                                />
                            </a>
                        </li>
                    </ul>
                </nav>

                <router-link
                    to="/register"
                    class="mobile-menu__cta"
                    @click="closeMenu"
                >{{ t('landing.navLogin') }}</router-link>

                <a
                    href="https://www.negiao.cn"
                    target="_blank"
                    rel="noopener"
                    class="mobile-menu__contact"
                ><IdCard :size="15" /> {{ t('landing.homepage') }}</a>
            </div>
        </transition>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useLocale } from '@common/app/useLocale';
import { useUserPreferencesStore } from '../stores';
import { useRingPatternStyle } from './composables/useRingPatternStyle';
import { fetchVisitorStats, formatVisitorNumber, formatUpdatedAt } from '@common/app/visitorStats';
import { ASSET_BASE_URL, GITHUB_STATS_WORKER_URL } from '../config/publicRuntime';
import {
    Bot,
    Building2,
    ChartArea,
    ChevronRight,
    Cloud,
    CloudSun,
    Crosshair,
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
import SectionTitle from './components/SectionTitle.vue';

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

// 全部保持 ASSET_BASE_URL 拼接的相对路径（'./' 或 '/子路径/' 形态），
// 兼容根域名 / GitHub Pages 子路径多处部署
// 品牌 logo（icon.webp），与 TopBar / favicon 同一资源
const logoUrl = `${normalizedBase}images/icon.webp`;
// 产品预览图（public/images/preview.webp），仅主卡（feature1）右侧引用；与 logoUrl 同源派生
const previewUrl = `${normalizedBase}images/preview.webp`;
// Hugging Face 官方 logo（public/images/hf-logo.svg，品牌资产彩色版）
const hfLogoUrl = `${normalizedBase}images/hf-logo.svg`;
// 轨道环纹样图源与注入逻辑统一由 composables/useRingPatternStyle 管理
// （Landing / 认证页共用一份，图源路径不在本文件重复维护）

// 相对 url() 的解析基准是「写下它的那份样式表」，不是组件本身：
//   · 经 CSS 自定义属性传 URL（--brand-logo、<style> 内 v-bind 注入）时，var() 用在
//     打包产物 /assets/index-*.css 里，'./' 会被拼成 /assets/images/... 直接 404
//     （V3.6.20 线上实测：icon.webp 实际请求了 /assets/images/icon.webp）；
//   · v-bind 注入的值是「原样替换」进自定义属性，裸路径不带 url() 时
//     mask-image: var(--x) 计算值非法、整条声明被丢弃 —— 轨道环退化成整块金色圆面；
//   · 而行内 style 属性与文档内嵌 <style> 里的相对 url() 按文档 base 解析，
//     与 <img src> 行为一致，根域名 / 子路径部署都正确。
// 因此 URL 不进自定义属性：品牌徽牌的 mask-image 走行内样式（brandBadgeStyle）；
// 轨道环纹样在 ::before 伪元素上、挂不了行内样式，走运行时注入的文档级 <style>
// （见 composables/useRingPatternStyle）。两条通道都不经自定义属性传 URL。
const brandBadgeStyle = {
    '-webkit-mask-image': `url('${logoUrl}')`,
    'mask-image': `url('${logoUrl}')`,
};

// 轨道环纹样：注入实现与认证页共用 composables/useRingPatternStyle。
// styleId 与选择器保持历史原值（类名翻倍抬到 (0,3,1)、断点 768），
// 注入结果与改造前逐字符一致，线上纹样不受影响
useRingPatternStyle({
    styleId: 'landing-ring-pattern-style',
    scope: '.hero-bg__rings',
    ringClass: 'hero-bg__ring',
});

// ============ 51.la 访客数据展示 ============
// Worker 已把上游脚本解析成 JSON，这里直接消费，不再包一层 store：
// fetchVisitorStats() 只管取数（含超时与失败静默），本组件持有 ref、决定顺序与渲染。
// 顺序由 VISITOR_LABEL_KEYS 的字面量顺序决定，不依赖 JSON 键序 —— 键序在 JS 里不是契约。
// 标签必须走 t()，否则切换语言时页脚仍是中文。
// 历史教训：曾让第三方脚本直接往容器插 DOM，但该容器在 vnode 里无子节点，
// Vue 3 patch 时会执行 hostSetElementText(el, '') 把它不认识的子节点整体清空，
// 表现为"脚本加载成功但页面什么都没有"。故渲染权必须留在组件内。
const VISITOR_LABEL_KEYS = {
    activeRecent: 'visitorActiveRecent',
    todayUsers: 'visitorTodayUsers',
    todayPv: 'visitorTodayPv',
    yesterdayUsers: 'visitorYesterdayUsers',
    yesterdayPv: 'visitorYesterdayPv',
    monthPv: 'visitorMonthPv',
    totalPv: 'visitorTotalPv',
};
/** 一次取数的完整结果（metrics + updatedAt）；null 表示未取到或失败 */
const visitorSnapshot = ref(null);
const visitorStats = computed(() => {
    const metrics = visitorSnapshot.value?.metrics;
    if (!metrics) return [];
    return Object.keys(VISITOR_LABEL_KEYS)
        .filter((key) => Number.isFinite(metrics[key]))
        .map((key) => ({
            key,
            label: t(`landing.${VISITOR_LABEL_KEYS[key]}`),
            text: formatVisitorNumber(metrics[key]),
        }));
});
// 数据新鲜度：接口时间是北京时间，按访客本地时区渲染；不可解析时为空串 → 整段不渲染
const visitorUpdatedAt = computed(() => formatUpdatedAt(visitorSnapshot.value?.updatedAt));

onMounted(async () => {
    visitorSnapshot.value = await fetchVisitorStats();
});

// 核心功能卡片：图标 + i18n key，避免 10 段近似模板重复
const FEATURES = Object.freeze([
    // hero = 桌面 3 列网格里的主卡：跨 2 列 2 行，
    // 让原本 10 张等宽卡出现主次（借鉴门户"一张主卡 + 一圈小卡"）
    { key: 'feature1', icon: Globe, hero: true },
    { key: 'feature2', icon: Layers },
    { key: 'feature3', icon: FileUp },
    { key: 'feature4', icon: ChartArea },
    { key: 'feature5', icon: CloudSun },
    { key: 'feature6', icon: Route },
    { key: 'feature7', icon: Bot },
    { key: 'feature8', icon: ShieldCheck },
    { key: 'feature9', icon: Wrench },
    // 末尾两张卡各跨满整行，呈横向汇总卡：
    // 3 列下 4（主卡 2×2）+ 8 + 3 + 3 = 18 格 = 6 行；2 列下主卡整行 + 10 小卡 = 5 行，
    // 两种断点都恰好铺满，不留孤卡
    { key: 'feature10', icon: Building2, wide: true },
    { key: 'feature11', icon: Crosshair, wide: true },
]);

const features = computed(() =>
    FEATURES.map((feature, index) => ({
        ...feature,
        // 序号章：两位补零，Impact 压缩体显示（借鉴门户 tab 的序号章）。
        // 纯装饰性序号，语义上不承载信息，模板上配 aria-hidden
        no: String(index + 1).padStart(2, '0'),
        title: t(`landing.${feature.key}Title`),
        desc: t(`landing.${feature.key}Desc`),
    })),
);

// Hero 统计条：数值静态、标签走 i18n。
// 借鉴南师大首页 .d-numDUl-1 的「数字滚动」：可量化的两项（70+、8）在
// 进入视口时从 0 滚到目标值；不可量化的两项（2D/3D、AI）保持静态文案。
// 用 num/suffix 拆出数值与后缀，num 为 null 的卡走静态渲染分支。
const HERO_STATS = Object.freeze([
    { value: '2D/3D', labelKey: 'landing.statDualEngine' },
    { num: 80, suffix: '+', labelKey: 'landing.statBasemaps' },
    { num: 8, suffix: '', labelKey: 'landing.statAnalysis' },
    { value: 'AI', labelKey: 'landing.statAi' },
]);

// 技术栈：按"三层"组织 —— 渲染画面 → 提供服务 → 交付上线。
// 原实现只有一行徽章，看不出这些技术各自负责哪一段，故改为分层卡片：
// 每层一张卡，卡内逐项写清该技术在本项目里承担的职责（文案走 i18n）。
// 徽章行由 TECH_LAYERS 拍平而来（单一数据源，升级版本只改这一处）；
// 图标分两类 —— FontAwesome 用 fa 字符串、Lucide 用 icon 组件
const TECH_LAYERS = Object.freeze([
    {
        no: '01',
        en: 'Map Rendering',
        nameKey: 'landing.techLayerRender',
        roleKey: 'landing.techLayerRenderRole',
        tagsKey: 'landing.techLayerRenderTags',
        items: Object.freeze([
            { fa: 'fab fa-vuejs', label: 'Vue 3.5', dutyKey: 'landing.techVue' },
            { icon: Map, label: 'OpenLayers 10', dutyKey: 'landing.techOpenLayers' },
            { icon: Globe, label: 'Cesium 1.132', dutyKey: 'landing.techCesium' },
        ]),
    },
    {
        no: '02',
        en: 'Geospatial Service',
        nameKey: 'landing.techLayerService',
        roleKey: 'landing.techLayerServiceRole',
        tagsKey: 'landing.techLayerServiceTags',
        items: Object.freeze([
            { icon: Zap, label: 'FastAPI', dutyKey: 'landing.techFastapi' },
            { icon: Cloud, label: 'Hugging Face', dutyKey: 'landing.techHuggingFace' },
        ]),
    },
    {
        no: '03',
        en: 'Build & Delivery',
        nameKey: 'landing.techLayerShip',
        roleKey: 'landing.techLayerShipRole',
        tagsKey: 'landing.techLayerShipTags',
        items: Object.freeze([
            { fa: 'fab fa-docker', label: 'Docker', dutyKey: 'landing.techDocker' },
            { fa: 'fab fa-github', label: 'GitHub Pages', dutyKey: 'landing.techGithubPages' },
        ]),
    },
]);

// 徽章行：拍平三层，顺序与上方卡片一致（读作卡片的"完整清单"）
const TECH_STACK = computed(() => TECH_LAYERS.flatMap((layer) => layer.items));

// 卡片渲染数据：把 i18n key 解成文案（en 是层名的英文小字，直接写死，属装饰）
const techLayers = computed(() =>
    TECH_LAYERS.map((layer) => ({
        no: layer.no,
        en: layer.en,
        name: t(layer.nameKey),
        role: t(layer.roleKey),
        tags: t(layer.tagsKey),
        items: layer.items.map((item) => ({ ...item, duty: t(item.dutyKey) })),
    })),
);

const heroStats = computed(() =>
    HERO_STATS.map((stat) => ({
        ...stat,
        label: t(stat.labelKey),
    })),
);

// 移动端菜单：两级索引，结构照搬南师大 header-con 的 `h2.title` → `dl > dd`。
// 关键点是"子项不是凑数的"—— 核心功能下挂 11 张真实功能卡、技术栈下挂 3 层卡片，
// 每一条都滚到页面上真实存在的落点（卡片各自带 id）。
// 这样 4 个栏目也能把一屏填满，靠的是内容密度，而不是把行高拉到 128px 硬撑。
const MOBILE_MENU = computed(() => [
    {
        id: 'features',
        label: t('landing.navFeatures'),
        children: features.value.map((f) => ({ id: `feature-${f.no}`, label: f.title })),
    },
    {
        id: 'tech',
        label: t('landing.navTech'),
        children: techLayers.value.map((layer) => ({
            id: `tech-layer-${layer.no}`,
            label: layer.name,
        })),
    },
    // 开源支持是叶子：它内部只有一条求 Star/Fork 的引导条，没有可再分的锚点
    { id: 'oss', label: t('landing.navOss'), children: [] },
]);

// ============ Hero 统计条 · 数字滚动（借鉴南师大 js-numScroll） ============
// 可量化的卡（num != null）在首次进入视口时从 0 滚到目标值，
// 不可量化的卡走静态文案分支、不参与。
// 初始化即终值：reduced-motion / 无 IntersectionObserver 的用户直接看到正确数字，
// 不闪烁；允许动效时 observeStats 在挂载后（首帧绘制前）归零再滚动，也无可见闪烁。
// 滚动仅作增强，不参与数据正确性的表达。
const statDisplay = ref(heroStats.value.map((stat) => (stat.num != null ? stat.num : 0)));
const heroStatsEl = ref(null);
let statObserver = null;
let statRafId = 0;

function rollStatsToFinal() {
    const targets = heroStats.value.map((stat) => (stat.num != null ? stat.num : null));
    const duration = 1100;
    const startTime = performance.now();
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
        const progress = Math.min(1, (now - startTime) / duration);
        const eased = easeOutCubic(progress);
        statDisplay.value = targets.map((target) => (target == null ? 0 : Math.round(target * eased)));
        if (progress < 1) {
            statRafId = requestAnimationFrame(tick);
        }
    };
    statRafId = requestAnimationFrame(tick);
}

function observeStats() {
    const prefersReduced =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canObserve = typeof IntersectionObserver === 'function';
    // 无动效偏好 或 环境不支持：维持终值，不滚动
    if (prefersReduced || !canObserve || !heroStatsEl.value) return;
    // 允许动效：先归零（首帧绘制前完成），进入视口再滚到终值
    statDisplay.value = heroStats.value.map(() => 0);
    statObserver = new IntersectionObserver(
        (entries, observer) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                rollStatsToFinal();
                observer.disconnect();
                statObserver = null;
            }
        },
        { threshold: 0.4 },
    );
    statObserver.observe(heroStatsEl.value);
}

function disconnectStats() {
    if (statObserver) {
        statObserver.disconnect();
        statObserver = null;
    }
    if (statRafId) {
        cancelAnimationFrame(statRafId);
        statRafId = 0;
    }
}

// ============ 核心功能 · 三栏分左右对称入场（借鉴南师大 .d-news1） ============
// 进入视口时左列/中列从左滑入、右列从右滑入，呈"从两侧往中间合"的展开叙事。
// 仅给 .features-grid 加 .features-reveal 时才隐藏初始态；reduced-motion / 无
// IntersectionObserver 时不加该类，卡片保持常显，杜绝"永远隐形"退化。
const featuresGridEl = ref(null);
let featureObserver = null;

function observeFeatures() {
    const prefersReduced =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = featuresGridEl.value;
    if (prefersReduced || typeof IntersectionObserver !== 'function' || !el) return;
    el.classList.add('features-reveal');
    featureObserver = new IntersectionObserver(
        (entries, observer) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                const cards = el.querySelectorAll('.feature-card');
                cards.forEach((card, i) => {
                    // 错峰：列向 0/0.06/0.12s + 行向每排 +0.08s，呈对角线展开
                    const col = i % 3;
                    const row = Math.floor(i / 3);
                    card.style.transitionDelay = `${col * 0.06 + row * 0.08}s`;
                });
                el.classList.add('in-view');
                observer.disconnect();
                featureObserver = null;
            }
        },
        { threshold: 0.12 },
    );
    featureObserver.observe(el);
}

function disconnectFeatures() {
    if (featureObserver) {
        featureObserver.disconnect();
        featureObserver = null;
    }
}

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
// GitHub 官方 mark 路径（16×16 viewBox，currentColor 上色）。原 <i class="fab fa-github">
// 依赖 bootcdn 的 Font Awesome 全量 CSS，国内移动网络下该 CDN 不可用时图标整片
// 消失 —— 导航 Star、登录胶囊、页脚、移动菜单四处门面位置全部空掉。改内联 SVG 后
// 与 Lucide 组件一样走本地 bundle，任何网络环境都能渲染。五处复用同一份 path，
// 提成常量：官方 mark 换版时只改这里一处
const GITHUB_MARK_PATH =
    'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z';
const STAR_HISTORY_PAGE_URL =
    'https://www.star-history.com/?repos=NEGIAO%2FWebGIS-Dev&type=timeline&legend=top-left';
// star-history 官方 sealed_token 图表：服务端每次访问时用仓库主人授权的
// fine-grained PAT 重新渲染，天然“每日更新”。URL 必须保持原样，勿拼接多余参数。
// 固定使用浅色（白色底）版本：深色系统下也不切换，保证面试展示时永远是白底。
// 安全：sealed_token 等于把“重渲染图表”的能力委托给持有人，一旦进入
// 前端 bundle任何人都能取用并消耗渲染额度；已配置 Worker 时不将
// token 下发到客户端，直连兜底整体退化为“图表不可用”提示。
const STAR_CHART_URL = GITHUB_STATS_WORKER_URL
    ? ''
    : 'https://api.star-history.com/chart?repos=NEGIAO/WebGIS-Dev&type=timeline&legend=top-left&sealed_token=B5ReoH7FL9EMbjs7rJJ3APlIoYZwGKo3g2gC_4_0LxIrQ--e5uhUrYXR7UEBcnb3CU48BAX9--IyzI-TxTszy8HrMJ3oVSVvfowMjrMOxY8n477EUd4_Ip6F8EMaHsKX6H5b1JjudmBoRUn3HxJ1R6zxt3lO1CKGidFnlqFb2W_TXYy_sTk3AS3rn8v8';

// ============ Cloudflare Worker 边缘代理（国内直连 GitHub 不稳定时的首选链路） ============
// Worker（源码见 NEGIAO.github.io 仓库 workers/github-stats/）在边缘抓 GitHub 并缓存 10 分钟，前端一次请求拿全量数据。
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

// 窄屏判定：与 .footer-links 的 flex-wrap 断点（max-width: 768px）保持一致。
// 初值同步读取（而非留 false 等挂载后补），保证首帧渲染就带正确断行，
// 不出现"单行 → 挂载后折两行"的一帧跳动。
const isNarrowViewport = ref(
    typeof window.matchMedia === 'function' &&
        window.matchMedia('(max-width: 768px)').matches
);
let viewportMediaQuery = null;

function onViewportQueryChange(event) {
    isNarrowViewport.value = event.matches;
}

/** 注册视口断点监听：跨断点时 ref 变化触发重渲染，断行自动增删 */
function observeViewportQuery() {
    if (typeof window.matchMedia !== 'function') return;
    viewportMediaQuery = window.matchMedia('(max-width: 768px)');
    isNarrowViewport.value = viewportMediaQuery.matches;
    viewportMediaQuery.addEventListener('change', onViewportQueryChange);
}

function disconnectViewportQuery() {
    if (viewportMediaQuery) {
        viewportMediaQuery.removeEventListener('change', onViewportQueryChange);
        viewportMediaQuery = null;
    }
}

// 页脚中文短语按两字插入换行符（隐私政策 → 隐私\n政策）：
// 窄屏下四字中文被 flex 子项挤压会折成"3+1"（如"隐私政/策"），改由文案自身
// 在每两字后插 \n 断行（white-space: pre-line 渲染），断点不依赖盒宽测算，
// 分隔符与图标全部原样保留。
// 宽屏没有宽度压力：twoLine 为 false 时直接返回原文案 —— 文本里连 \n 都
// 不出现，桌面端保持单行，pre-line 对无换行文本是纯 no-op，无 CSS 兜底成本。
// 仅对纯 CJK 且 ≥3 字的文本生效；英文短语（Privacy Policy）含空格、
// 按词自然折行，原样返回。纯插值渲染，不走 v-html（XSS 面归零）。
function cjkBreak(text, twoLine = isNarrowViewport.value) {
    if (!twoLine) return text;
    if (typeof text !== 'string' || !/^[\u4e00-\u9fa5]{3,}$/.test(text)) return text;
    return text.replace(/(.{2})(?=.)/g, '$1\n');
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
// 图片加载失败兜底：Worker 图床不通 → 降级直连再试一次 → 仍失败（或客户端本就
// 未持有直连 URL）则隐藏图片保版面
function onChartError() {
    if (!chartUseFallback.value && WORKER_CHART_URL) {
        chartUseFallback.value = true;
    } else {
        chartDead.value = true;
    }
}
/** OSS 仓库最近推送时间 → 两级日期徽章数据（借鉴南师大 .time .t1 日+.t2 年月）。
    day = 两位补零的「日」，ym = 「年.月」。解析失败 / 缓存里没有时间则返回 null，
    模板退化为不渲染徽章（胶囊其余部分不受影响） */
const githubUpdatedParts = computed(() => {
    if (!githubUpdatedAt.value) return null;
    try {
        const date = new Date(githubUpdatedAt.value);
        if (Number.isNaN(date.getTime())) return null;
        const pad = (value) => String(value).padStart(2, '0');
        return {
            day: pad(date.getDate()),
            ym: `${date.getFullYear()}.${pad(date.getMonth() + 1)}`,
        };
    } catch {
        return null;
    }
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
    // 缓存首屏已由 applyLocalCaches 同步填充，这里只做后台 revalidate
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

// ============ 导航栏锚点（核心功能 / 技术栈 / 开源认可） ============
// 路由为 createWebHashHistory：原生 href="#features" 会被解析为路径跳转，
// 页内定位一律 button + scrollIntoView；CSS 的 scroll-behavior:smooth 承接丝滑滚动。
const NAV_ANCHORS = Object.freeze([
    { id: 'features', labelKey: 'landing.navFeatures' },
    { id: 'tech', labelKey: 'landing.navTech' },
    { id: 'oss', labelKey: 'landing.navOss' },
]);
const navAnchors = NAV_ANCHORS;
const activeAnchor = ref('');
/** 与 CSS scroll-margin-top 派生值保持一致：导航栏定高 + 12px 呼吸位 */
const NAV_SCROLL_OFFSET = 84;

function scrollToSection(id) {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 滚动容器 ref：供移动端菜单锁定滚动、以及锚点定位使用
const landingEl = ref(null);

// ============ 移动端全屏菜单（P2#10） ============
const menuOpen = ref(false);

function toggleMenu() {
    menuOpen.value = !menuOpen.value;
    syncMenuScrollLock();
}

function closeMenu() {
    if (!menuOpen.value) return;
    menuOpen.value = false;
    syncMenuScrollLock();
}

// 打开菜单时锁定滚动容器，避免背景穿透滚动
function syncMenuScrollLock() {
    const el = landingEl.value;
    if (!el) return;
    el.style.overflowY = menuOpen.value ? 'hidden' : '';
}

function onMenuKeydown(e) {
    if (e.key === 'Escape' && menuOpen.value) closeMenu();
}

// ============ 统一入场动效（P2#12：fadeInUp once） ============
// 不引 WOW.js：IntersectionObserver 轻量替代，进入视口加 .reveal-in 后解除观察，
// 全页只触发一次；reduced-motion / 无 IO 环境直接常显不退化
let revealObserver = null;

function observeReveal() {
    const prefersReduced =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || typeof IntersectionObserver !== 'function') return;
    const targets = document.querySelectorAll(
        '.section-head, .tech-badges, .oss-support, .cta-card, .footer-quick, .footer-rule, .footer-meta',
    );
    if (!targets.length) return;
    // 先挂 .reveal-pending 隐藏初始态（onMounted 首帧绘制前完成），IO 再补 .reveal-in
    targets.forEach((target) => target.classList.add('reveal-pending'));
    revealObserver = new IntersectionObserver(
        (entries, observer) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('reveal-in');
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.12 },
    );
    targets.forEach((target) => revealObserver.observe(target));
}

function disconnectReveal() {
    if (revealObserver) {
        revealObserver.disconnect();
        revealObserver = null;
    }
}

let anchorObserver = null;
function observeAnchors() {
    if (typeof IntersectionObserver !== 'function') return; // 老浏览器/测试环境降级：无高亮但锚点仍可用
    const sections = NAV_ANCHORS.map((anchor) => document.getElementById(anchor.id)).filter(Boolean);
    if (!sections.length) return;
    // 以视口为 root：观察各 section 进入「导航栏下沿之下 → 视口 45% 高度处」的带状区，
    // 占住带状区比例最大者高亮（rootMargin 上负值把区顶推到 sticky 导航栏之下）。
    // IntersectionObserver 观察的是与视口的相交，与滚动容器是哪个元素无关。
    anchorObserver = new IntersectionObserver(
        (entries) => {
            const visible = entries
                .filter((entry) => entry.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
            if (visible.length > 0) {
                activeAnchor.value = visible[0].target.id;
            }
        },
        { rootMargin: `-${NAV_SCROLL_OFFSET}px 0px -55% 0px` },
    );
    sections.forEach((section) => anchorObserver.observe(section));
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
    observeAnchors(); // 导航锚点 scroll spy（IntersectionObserver）
    observeStats(); // Hero 统计条数字滚动（进入视口触发）
    observeFeatures(); // 核心功能卡：三栏分左右对称入场
    observeReveal(); // 统一入场动效（节标题 / 技术栈 / CTA，once）
    observeViewportQuery(); // 页脚两字断行的窄屏判定（跨断点自动重渲染）
    window.addEventListener('keydown', onMenuKeydown);
    void (async () => {
        if (await fetchViaWorker()) return; // Worker 命中则不再打扰 GitHub
        void fetchGithubStats(); // 直连兜底（同样缓存先行）
        void fetchAppVersion();
    })();
});

onBeforeUnmount(() => {
    if (anchorObserver) {
        anchorObserver.disconnect();
        anchorObserver = null;
    }
    disconnectStats(); // 取消数字滚动的观察器与 rAF
    disconnectFeatures(); // 取消核心功能入场观察器
    disconnectReveal(); // 取消统一入场观察器
    window.removeEventListener('keydown', onMenuKeydown);
    disconnectViewportQuery(); // 取消页脚断行的视口断点监听
    if (landingEl.value) landingEl.value.style.overflowY = '';
});
</script>

<style scoped>
/* 键盘可及性：落地页全部链接/按钮统一 focus-visible 轮廓
   （原仅 .lang-btn 单独定义；outline 自动跟随元素自身圆角） */
a:focus-visible,
button:focus-visible {
    outline: 2px solid rgba(var(--brand-primary-rgb), 0.55);
    outline-offset: 2px;
}

/* 全局 html/body 为 overflow:hidden 的全屏地图布局（App.vue），
   本页必须自持滚动容器：固定视口高度 + 内部纵向滚动 */
.landing-container {
    /* 导航真实定高，Hero 的 100dvh 偏移由此派生，避免魔数不同步 */
    --landing-navbar-h: 72px;
    /* 旧版 iOS（<16.4）不识别 dvh，先给 vh 兜底再覆盖；
       否则内部滚动容器高度失效，整页退化成无滚动 */
    height: 100vh;
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

/* ============ 自定义滚动条（替代浏览器默认） ============
   双通道：Chromium/WebKit 走 ::-webkit-scrollbar* 伪元素（内缩 + hover 提亮）；
   Firefox 不认伪元素，需走标准 scrollbar-width / scrollbar-color 单独兜底。
   滑块内缩技法（与 AttributeTable .pro-scroll-area 同源）：
   「border: 4px solid transparent + background-clip: content-box」令可见 Pill
   比滚动槽窄 8px，视觉上离窗口右缘留出呼吸位、不与内容边缘齐平。
   色彩全部派生自 theme.css 品牌令牌，绿/蓝主题自动联动。 */
.landing-container {
    /* Firefox：细槽 + 品牌色拇指 */
    scrollbar-width: thin;
    scrollbar-color: rgba(var(--brand-primary-rgb), 0.42) transparent;
}

.landing-container::-webkit-scrollbar {
    width: 14px;
}

/* 去掉 Windows Chromium 默认在轨道两端渲染的箭头按钮 */
.landing-container::-webkit-scrollbar-button {
    display: none;
}

.landing-container::-webkit-scrollbar-track {
    background: transparent;
}

.landing-container::-webkit-scrollbar-thumb {
    border-radius: 999px;
    border: 4px solid transparent;
    background-clip: content-box;
    /* 静默态：贴近不可见的品牌色薄纱，不打扰首屏阅读 */
    background-color: rgba(var(--brand-primary-rgb), 0.16);
    transition: background-color 0.25s ease;
}

/* 页面 hover 即提亮一档 —— 不滚动时低调、一碰就醒（近似 macOS 覆盖式观感） */
.landing-container:hover::-webkit-scrollbar-thumb {
    background-color: rgba(var(--brand-primary-rgb), 0.4);
}

/* 悬停滑块本体 / 拖拽中：逐级加深到品牌深色 */
.landing-container::-webkit-scrollbar-thumb:hover {
    background-color: rgba(var(--brand-primary-rgb), 0.62);
}

.landing-container::-webkit-scrollbar-thumb:active {
    background-color: var(--brand-primary-dark);
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
    box-shadow: 0 2px 10px rgba(20, 45, 25, 0.04);
}

/* 顶部品牌渐变封边线（P1#5）：呼应南师大 header 顶部橙黄渐变线，
   并与本页 .nav-link.active 的金下划线同源。品牌绿 → 暖金，绿/蓝主题自动联动 */
.navbar::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--brand-primary), var(--brand-gold));
    pointer-events: none;
}

.navbar-inner {
    max-width: 1200px;
    margin: 0 auto;
    height: var(--landing-navbar-h);
    padding: 0 2rem;
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
    /* 与 .nav-actions 对半分配剩余空间：中部锚点组随之精确居中
       （space-between 在两侧宽度不等的实际内容下会偏心） */
    flex: 1;
}

/* 品牌徽牌：纯白复杂线稿（icon.webp，RGBA / 65.7% 透明 / 512×409 横版）的承托底。
   原实现为单层 #4caf50→#2e7d32 平涂，白线稿对比度仅 2.8~5.1:1（WCAG 实测），
   细线糊成灰绿一团，即"纯绿很突兀"的根因。 */
/* ============ 品牌徽牌：无底牌单色 logo（方案A） ============
   两种底衬都试过、都不讨好：亮绿平涂让白线稿对比度仅 2.8~5.1:1（细线发糊），
   深墨三层叠色又把品牌绿搅成脏灰（用户评"白不白、黑不黑"）。
   方案A 彻底不做色块：CSS mask 取 logo 自身的 alpha 通道作遮罩，把纯白线稿
   "染"成品牌深绿，直接放在浅色玻璃导航上 —— 没有色块，就没有突兀源。
   遮罩资源即 public/images/icon.webp（经行内 style 注入 mask-image，与 img 同源同缓存；
   不能走 --brand-logo 自定义属性 —— 相对 url() 会按本外部样式表 /assets/*.css 的
   目录解析成 /assets/images/... 而 404，线上实测），
   Safari 需 -webkit- 前缀，标准 mask 置后覆盖；绿/蓝主题随令牌联动。 */
.brand-badge {
    width: 42px;
    height: 42px;
    flex-shrink: 0;
    background-color: var(--brand-primary-dark);
    /* mask-image 由行内样式 brandBadgeStyle 注入（见 script 注释），此处只配定位/重复/尺寸 */
    -webkit-mask-position: center;
    mask-position: center;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-size: contain;
    mask-size: contain;
    /* hover 效果与 TopBar `.logo-link:hover .logo-icon` 同一套手法：
       轻微倾斜 -10° + 放大 1.1，0.3s —— 不做整圈旋转（试过 360°/Y 轴翻转，
       对一个小徽牌都太闹） */
    transition: transform 0.3s;
}

/* will-change 只在交互期间挂上，避免常驻图层的开销 */
.brand-badge:active {
    transform: rotate(-10deg) scale(1.1);
}

/* 悬停高亮只授给真正支持悬停的设备：触屏上点一下徽牌，:hover 会粘住
   （logo 一直保持倾斜放大态，像卡在了交互中），按压反馈交给 :active */
@media (hover: hover) and (pointer: fine) {
    .brand-badge:hover {
        transform: rotate(-10deg) scale(1.1);
        will-change: transform;
    }
}

.brand-text {
    min-width: 0;
}

.brand-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    /* 与徽牌（mask 染成的品牌深绿单色 logo）同色呼应，品牌区形成一条绿色主线；
       20px/700 属 WCAG 大字号，--brand-primary-dark 在白/近白导航上约 4.9:1，
       满足大文本 AA（3:1）且余量充足 */
    color: var(--brand-primary-dark);
    letter-spacing: 0.3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.brand-subtitle {
    margin: 2px 0 0;
    font-size: 0.75rem;
    /* 原 --text-muted(#999) 在 12px 下仅 2.8:1，不达 WCAG AA(4.5:1)；
       提一档到 --text-secondary(#666) ≈ 5.7:1，可读性达标且仍是次要层级 */
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* 中部锚点导航：填补品牌区与操作区之间的中部空白 */
.nav-links {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
}

.nav-link {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1;
    padding: 0.55rem 0.85rem;
    border-radius: 8px;
    cursor: pointer;
    white-space: nowrap;
    /* 供 .nav-link.active::after 的金色下划线做定位基准、
       以及激活态 scale「长大」变换 */
    position: relative;
    transform-origin: center;
    transition: background 0.15s ease, color 0.15s ease, transform 0.18s ease;
}

@media (hover: hover) and (pointer: fine) {
    .nav-link:hover {
        background: rgba(var(--brand-primary-rgb), 0.08);
        color: var(--brand-primary-dark);
    }
}

/* 激活态「长大」而非「变色」（借鉴门户 tab 选中项是长出来的）：
   在保留底色胶囊 + 金下划线的基础上，再叠加 scale 放大，让当前节
   在扫视时以"尺寸"被先读到，而不只靠颜色。scale 用 transform 不触发回流 */
.nav-link.active {
    background: rgba(var(--brand-primary-rgb), 0.12);
    color: var(--brand-primary-dark);
    font-weight: 600;
    transform: scale(1.08);
}

/* 激活态补一道暖金下划线：借鉴门户"选中项是长出来的，不是变色的"。
   底色胶囊保留（信息量不减），下划线做金色呼吸点，
   让"当前在哪一节"在扫视时先于读字被捕捉到 */
.nav-link.active::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 2px;
    width: 18px;
    height: 2px;
    border-radius: 1px;
    background: var(--brand-gold);
    transform: translateX(-50%);
}

.nav-actions {
    flex: 1;
    justify-content: flex-end;
    display: flex;
    align-items: center;
    gap: 12px;
}

/* 移动端汉堡（P2#10 触发钮）：移动优先——默认即显示，仅 >1024px 桌面隐藏。
   （早先写法是顶层 display:none + ≤1024px 响应式块 inline-flex。那种写法下，
   响应式块一旦失效（HMR 丢块 / 构建产物缺规则 / 级联被意外覆盖），窄屏上
   burger 会直接消失且无从排查。反转后顶层没有任何规则能隐藏它，
   只有明确的桌面断点可以——手机上必然可见。）
   激活时三条横线交叉成 ×，与全屏菜单覆层同步 */
.nav-burger {
    display: inline-flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    width: 38px;
    height: 34px;
    padding: 0 8px;
    border: 1px solid var(--border-light);
    border-radius: 9px;
    background: var(--bg-secondary);
    cursor: pointer;
    flex-shrink: 0;
}

/* 桌面端才隐藏：与下方 ≤1024 块的锚点组让位互补（1025 起不重叠、无缝隙） */
@media (min-width: 1025px) {
    .nav-burger {
        display: none;
    }
}

/* 按压反馈：触屏上没有真 hover，且 :hover 点完会粘住，所以悬停高亮只授给
   真正支持悬停的设备（见下方媒体查询），触屏用 :active 给出按下即应的反馈 */
.nav-burger:active {
    border-color: rgba(var(--brand-primary-rgb), 0.35);
    background: rgba(var(--brand-primary-rgb), 0.08);
}

@media (hover: hover) and (pointer: fine) {
    .nav-burger:hover {
        border-color: rgba(var(--brand-primary-rgb), 0.35);
        background: rgba(var(--brand-primary-rgb), 0.06);
    }
}

.nav-burger span {
    display: block;
    height: 2px;
    border-radius: 1px;
    background: var(--text-secondary);
    transition: transform 0.25s ease, opacity 0.2s ease;
}

.nav-burger.active span:nth-child(1) {
    transform: translateY(6px) rotate(45deg);
}

.nav-burger.active span:nth-child(2) {
    opacity: 0;
}

.nav-burger.active span:nth-child(3) {
    transform: translateY(-6px) rotate(-45deg);
}

/* GitHub Star 快捷入口：紧凑胶囊，置于语言切换器之前 */
.nav-github {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 34px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--border-light);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.nav-github:active {
    border-color: rgba(var(--brand-primary-rgb), 0.45);
    background: rgba(var(--brand-primary-rgb), 0.06);
    color: var(--brand-primary-dark);
}

/* 悬停高亮只授给真正支持悬停的设备：触屏上点开 Star 链接后 :hover 会粘住
   （从新标签页返回时按钮仍保持高亮态），按压反馈交给 :active */
@media (hover: hover) and (pointer: fine) {
    .nav-github:hover {
        border-color: rgba(var(--brand-primary-rgb), 0.45);
        background: rgba(var(--brand-primary-rgb), 0.06);
        color: var(--brand-primary-dark);
    }
}

/* GitHub 品牌图标：内联 SVG，官方 mark 见 script GITHUB_MARK_PATH
   （本地 bundle，不依赖 Font Awesome CDN），颜色随上下文 currentColor 继承。
   尺寸默认 15px，登录胶囊 / 页脚圆钮处按 13px / 17px 局部覆写 */
.icon-github {
    width: 15px;
    height: 15px;
    fill: currentColor;
    flex-shrink: 0;
}

/* iOS Safari：内联 SVG 作为 flex 子项时默认 flex-shrink: 1，窄屏挤压会被压成
   0 宽 —— 表现为导航 / 页脚 / CTA 的图标「塌陷」（桌面 Chrome 有更宽的视口，
   往往先不触发）。图标一律不参与收缩；固有尺寸另由各处的 width/height 属性兜底，
   避免 Safari 在拿不到 CSS 尺寸时按 viewBox 比例算出 0。 */
.navbar svg,
.footer svg,
.cta-method svg {
    flex: none;
}

.nav-github-count {
    font-variant-numeric: tabular-nums;
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

.lang-btn:active {
    background: rgba(var(--brand-primary-rgb), 0.1);
    color: var(--brand-primary-dark);
}

/* 悬停高亮只授给真正支持悬停的设备：触屏上点完语言钮，:hover 会粘在刚点的
   钮上，与 .active 的渐变态并存、看着像"两个都选中"；按压反馈交给 :active */
@media (hover: hover) and (pointer: fine) {
    .lang-btn:hover {
        background: rgba(var(--brand-primary-rgb), 0.1);
        color: var(--brand-primary-dark);
    }
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
    /* 窄屏上 .nav-actions 是 flex、按钮又是唯一可压缩项：不锁 nowrap +
       shrink:0，它会被压到 min-content，"登录 / 注册" 在按钮里折成两三行，
       比 64px 的导航条还高 —— 这是移动端"按钮没适配"的直接原因 */
    white-space: nowrap;
    flex-shrink: 0;
}

/* 文案独立成 span：≤480px 只留图标时用它整段隐藏 */
.btn-primary-label {
    display: inline-block;
}

.btn-primary:active {
    filter: brightness(0.97);
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(var(--brand-primary-rgb), 0.3);
}

/* 悬停高亮只授给真正支持悬停的设备：触屏上点完登录钮 :hover 会粘住
   （按钮一直保持上浮态），按压反馈交给 :active */
@media (hover: hover) and (pointer: fine) {
    .btn-primary:hover {
        filter: brightness(1.06);
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(var(--brand-primary-rgb), 0.38);
    }
}

/* ============ 内容区 ============ */
/* 全宽容器：Hero 首屏拉满全屏；下方区块各自限宽居中 */
.content {
    flex: 1;
    width: 100%;
    padding: 0;
    /* 纵向 flex：让 hero-section 用 flex:1 精确填充导航栏之下的剩余视口，
       避免 min-height 与导航栏实际高度的魔法数漂移 */
    display: flex;
    flex-direction: column;
}

/* 锚点滚动落点：为 sticky 导航栏留出定高 + 呼吸位（与 script
   NAV_SCROLL_OFFSET、scroll spy 的 rootMargin 同源派生，勿三处漂移）。
   功能卡与技术层也带 id（移动端菜单的子项直接跳到具体卡片），
   落点规则必须一致，否则从菜单点进去卡片会被导航条压住 */
.content > section,
.content .feature-card,
.content .tech-layer {
    scroll-margin-top: calc(var(--landing-navbar-h) + 12px);
}

/* ============ Hero 区域（全宽全屏首屏） ============ */
.hero-section {
    position: relative;
    text-align: center;
    /* 侧向 2rem 解决 768~1200px 宽度下标题贴边；底部 0，
       区块间距统一由后续各节的顶部 padding 提供 */
    padding: 4rem 2rem 0;
    overflow: hidden;
    /* 精确占满首屏剩余空间（landing-container 为 100dvh 纵向 flex） */
    flex: 1;
    /* 兜底：flex 环境异常时仍接近满屏，偏移量与导航真实定高绑定 */
    min-height: calc(100vh - var(--landing-navbar-h));
    min-height: calc(100dvh - var(--landing-navbar-h));
    display: flex;
    flex-direction: column;
    /* 不用 justify-content:center：内容高于容器时它把顶部溢出，
       配合 overflow:hidden（裁光斑必须保留）会直接裁掉标题。
       垂直安全居中改由 .hero-inner 的 auto margin 实现（溢出时 margin 归零、
       从顶部开始排，不裁剪） */
}

.hero-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
}

/* 首屏 Ken Burns 缓推（P0#3）：本页 hero 背景为纯 CSS（无 Cesium 白底闪烁），
   故不铺静态兜底图，改为整层一次性 1.06→1 的缓收，给首屏一个"落定"的呼吸感。
   单次播放、fill 后为 identity，不影响子层各自的旋转/漂移动画 */
@media (prefers-reduced-motion: no-preference) {
    .hero-bg {
        animation: hero-kenburns 9s ease-out 1 both;
        transform-origin: 50% 40%;
    }
}

@keyframes hero-kenburns {
    from {
        transform: scale(1.06);
    }

    to {
        transform: scale(1);
    }
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

/* 右上角超大半透明光晕（借鉴南师大 .ind1-sunlight1，约 45vw 见方、探出顶边）。
   以暖金径向核 + 品牌色细光芒（repeating-conic-gradient）叠成"阳光"，
   径向 mask 把外缘柔化掉避免硬边；低透明度，纯做纵深、不抢文案。
   overflow:hidden 的 hero-section 会把探出顶边的部分裁成弧顶，读作"天光" */
.hero-bg__sun {
    position: absolute;
    top: -14vw;
    right: -12vw;
    width: 46vw;
    height: 46vw;
    pointer-events: none;
    background:
        radial-gradient(circle at 50% 50%, rgba(var(--brand-gold-rgb), 0.16), rgba(var(--brand-gold-rgb), 0) 58%),
        repeating-conic-gradient(
            from 0deg at 50% 50%,
            rgba(var(--brand-primary-rgb), 0.06) 0deg 5deg,
            rgba(var(--brand-primary-rgb), 0) 5deg 11deg
        );
    -webkit-mask-image: radial-gradient(circle at 50% 50%, #000 0%, transparent 64%);
    mask-image: radial-gradient(circle at 50% 50%, #000 0%, transparent 64%);
    opacity: 0.85;
}

/* 光晕极缓自转：光芒如日轮般扫过，强化"天光"的纵深感。
   30s 起、周期不同步于其它装饰，避免整体像同一个动画 */
@media (prefers-reduced-motion: no-preference) {
    .hero-bg__sun {
        animation: sun-spin 96s linear infinite;
    }
}

@keyframes sun-spin {
    to {
        transform: rotate(360deg);
    }
}

/* 经纬网极慢漂移：42px 一个网格步长，60s 走完一格再无缝循环。
   慢到"看不清在动"但盯一会儿能感知到位移 —— 这是高校门户那种
   "页面是活的"手感的来源，比加动图便宜得多 */
@media (prefers-reduced-motion: no-preference) {
    .hero-bg__grid {
        animation: hero-grid-drift 10s linear infinite;
    }
}

@keyframes hero-grid-drift {
    from {
        background-position: 0 0, 0 0;
    }

    to {
        background-position: 42px 42px, 42px 42px;
    }
}

.hero-bg__blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.35;
}

/* 光斑呼吸：scale 只做 1 → 1.08 的微幅起伏，18s 一周期。
   两枚错开 1/2 相位，避免同涨同落显得"机械同步" */
@media (prefers-reduced-motion: no-preference) {
    .hero-bg__blob--1 {
        animation: hero-blob-breathe 18s ease-in-out infinite alternate;
    }

    .hero-bg__blob--2 {
        animation: hero-blob-breathe 18s ease-in-out -9s infinite alternate;
    }
}

@keyframes hero-blob-breathe {
    from {
        transform: scale(1);
    }

    to {
        transform: scale(1.08);
    }
}

/* ============ 同心轨道环（Hero） ============
   三环承载南师大「媒体南师」那圈旋转纹样
   （public/images/njnu-media/d-bg2_1.png，1060×1060 RGBA）。
   原图只有两段结构，先测过再排版：
     · r≈0.78 藤蔓卷草花边，alpha 峰值 0.50，覆盖率仅 10~17%（断续的）
     · r≈0.99 细线圆，alpha 恒为 0.078，覆盖率 86%（一根近乎连续的发丝线）
   原图是极淡的暖金（不透明像素均值 RGB 231,176,111）且 alpha 封顶 50%。
   纹样以 background-image 直接上图（不用 mask —— 旋转 + mask 在 iOS Safari
   上会整块栅格化成黑色，详见下方纹样层块注释）；PNG 自身即淡金色，
   直接上图就是设计稿里的观感。

   background-size 决定"取原图的哪一圈"，这是三环不像复制品的关键（半径为实测值）：
     · outer 960px  → 124%：花边落在 r=451~476，贴着虚线边框内侧
     · mid   680px  →  96%：花边 r=248~260（发丝线 r=323 但淡到看不见）
     · inner 420px  →  90%：花边 r=143~190
   花边一圈比一圈收紧，读作"层层加密的纹样"而非同一张图复制三份。

   缩放会按面积平均 alpha，越缩峰值越低（0.557 → 0.325 → 0.208），
   所以三环的 opacity 是 0.85 / 0.7 / 0.55 这种"反着来"的配比，
   目的是让三者叠在 #f9f9f9 上的有效不透明度排成 0.47 / 0.23 / 0.11 的梯度。

   旋转仍挂在环本体上（伪元素是子节点，跟着一起转），不需要第二套动画。
   注：本层只做"环心不渐隐"——同心圆半径由内向外，任何以环心为中心的
   径向 mask 都会先把最大的环抹掉（实测 58%/56% + 30%→76% 停靠点下，
   1080px 外环在 1440×996 首屏上基本不可见）。圆环本身低透明度，
   靠 overflow:hidden 裁切读作"延伸到视野外"即可。

   三环差异化：outer 虚线 130s 顺时针 + **空心**轨道点；mid 实线 70s
   逆时针 + **实心**金点；inner 实线最淡 140s 顺时针、无点。
   一实一空 + 反向 + 异速，才读得出是两套独立轨道。

   两个点还与各自的环**差速**：点自己再转一层，叠加后的净周期是
   outer 45s / mid 33s（环本身 130s / 70s），相对环的滑动周期 69s / 62s。
   细节见 prefers-reduced-motion 段里的"差速公转"。 */
.hero-bg__rings {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
}

.hero-bg__ring {
    /* position 提到这里：inner 也要挂纹样伪元素 */
    position: relative;
    grid-area: 1 / 1;
    border-radius: 50%;
}

/* 纹样层：两套旋转纹样 PNG 以 background-image 直接上图（不用 mask）。
   为什么不用 mask：iOS Safari 合成缺陷 —— 被遮罩图层若处于持续 transform
   旋转的父元素内（.hero-bg__ring 跑 ring-spin 无限动画），遮罩层会整块
   栅格化成黑色，旋转环在 iOS 上呈现为黑环。background-image 无此问题，
   各平台渲染一致；PNG 取不到时该层什么都不画，不存在"纯色圆面"兜底。
   图源 url() 由运行时注入的文档级 <style> 提供（见 composables/
   useRingPatternStyle）：相对路径按文档 base 解析，兼容根域名 /
   子路径部署；本块只配定位/重复/尺寸。 */
.hero-bg__ring::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background-repeat: no-repeat;
    background-position: center;
}

.hero-bg__ring--outer {
    width: min(960px, 86vw);
    height: min(960px, 86vw);
    border: 1px dashed rgba(var(--brand-primary-rgb), 0.5);
}

/* 放大到 124%：花边顶到 r=451~476（虚线在 480 内侧），发丝线被推到
   589 裁出 border-box。alpha 峰值 0.557 × 0.85 = 有效 0.473，
   叠在 #f9f9f9 上最深 RGB(230,211,153)—— 一圈看得清又不抢标题的淡金 */
.hero-bg__ring--outer::before {
    background-size: 124% 124%;
    opacity: 0.85;
}

/* outer 环上的空心公转点：与 mid 的实心金点形成"实心 / 空心"配对。

   载体不是一枚小圆，而是**铺满整环的透明层**，点用 radial-gradient 画在
   12 点方向 —— 这样"点绕环公转"就退化成"整层绕自身圆心旋转"，旋转原点
   天然是环心。若把小圆用 top/left 摆到环上再旋转，transform-origin 必须
   精确落到环心，而环尺寸是 min(960px, 86vw) 随视口变、断点里还要改一次，
   那个原点会跟着漂；用整层就没这个问题。
   inset 取负值是为了让 12 点处的点**正压在环线上**（内缩 0 会让点整体
   偏进环内 7px）。空心 = 一段 1.5px 宽的环带：r 5.5→7 上色，其余透明。 */
.hero-bg__ring--outer::after {
    content: '';
    position: absolute;
    inset: -7px;
    border-radius: 50%;
    background: radial-gradient(
        circle 7px at 50% 7px,
        transparent 5.5px,
        var(--brand-gold) 5.5px 7px,
        transparent 7px
    );
}

/* 中环同样改虚线：正圆的实线边框旋转在视觉上等于静止（圆周完全对称），
   本环虽有 mid 的公转金点作运动线索，但环线本身不动仍会被读成"死环"。
   虚线墨量约为实线一半，故 alpha 相对原实线值上调补足视觉重量；
   具体取值见下方 border，层次保持 外 > 中 > 内 递减 */
.hero-bg__ring--mid {
    width: min(680px, 60vw);
    height: min(680px, 60vw);
    border: 1px dashed rgba(var(--brand-primary-rgb), 0.34);
}

/* 收到 96%：花边落到 r=248~260，发丝线落到 r=323（边框 340 内侧）。
   注意缩放会稀释 alpha——这一档花边峰值只剩 0.325，故 opacity 提到 0.7，
   有效 0.228 → RGB(243,234,206)；发丝线 0.078 无论怎么提都只有 0.05，
   实测等于看不见，中环的圆仍由 border 提供，纹样只出花边那一段 */
.hero-bg__ring--mid::before {
    background-size: 96% 96%;
    opacity: 0.7;
}

/* mid 环上的实心公转点：同样是整层 + radial-gradient，只是实心（r 4px 全上色）。
   与 outer 的空心点配对，且两者转速不同 —— 见下方 prefers-reduced-motion 段 */
.hero-bg__ring--mid::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    background: radial-gradient(
        circle 4px at 50% 4px,
        var(--brand-gold) 4px,
        transparent 4px
    );
}

/* 核心环是最需要改的一环：它没有公转点，实线边框叠加低 alpha
   等于"整圈完全静止"，140s 的旋转没有任何可感知的痕迹。
   改虚线后虚线段沿圆周滑动即可读出慢转；alpha 同步上调以抵消虚线的墨量损失 */
.hero-bg__ring--inner {
    width: min(420px, 40vw);
    height: min(420px, 40vw);
    border: 1px dashed rgba(var(--brand-primary-rgb), 0.28);
}

/* 收到 90% 且给 0.55：花边落在 r=143~190，叠在标题后面只当质感底纹。
   这一档花边峰值被稀释到 0.208，0.55 乘下来 0.114 → RGB(249,244,230)，
   是有意压到"能看出有纹样、但读不出图案"的临界值 */
.hero-bg__ring--inner::before {
    background-size: 90% 90%;
    opacity: 0.55;
}

@media (prefers-reduced-motion: no-preference) {
    .hero-bg__ring--outer {
        animation: ring-spin 130s linear infinite;
    }

    .hero-bg__ring--mid {
        animation: ring-spin-rev 70s linear infinite;
    }

    .hero-bg__ring--inner {
        animation: ring-spin 140s linear infinite;
    }

    /* ===== 差速公转 =====
       两个点不再钉在环上跟着环走，而是各自再转一层。因为 ::after 是环的
       子节点，实际角速度 = 环角速度 + 点自身角速度（同向相加、反向相减）：

         outer：130s 顺时针 ⊕ 自身 69s 顺时针 → 净周期 45s 顺时针
         mid  ： 70s 逆时针 ⊕ 自身 62s 逆时针 → 净周期 33s 逆时针

       即"点在环上的相对滑动"周期为 69s / 62s —— 盯两秒就能看出点在跑，
       而不是被环钉住。两者净速度不同（45s vs 33s），一快一慢，
       再加上空心/实心的差别，两个点不会被读成"同一个动画的两份"。 */
    .hero-bg__ring--outer::after {
        animation: ring-spin 69s linear infinite;
    }

    .hero-bg__ring--mid::after {
        animation: ring-spin-rev 62s linear infinite;
    }
}

@keyframes ring-spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

@keyframes ring-spin-rev {
    from {
        transform: rotate(360deg);
    }

    to {
        transform: rotate(0deg);
    }
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

/* ============ 移动端：首屏背景降级 ============
   桌面那套三环纹样直接缩到手机上会出三个问题，逐个处理：

   1. 可见度 —— 这条最致命。mask 按设备像素栅格化，1060 的细花边在手机上
      被缩到 400px（1x 屏）时 alpha 峰值 0.502 → 0.220，等于遮罩自己就被
      平均没了，opacity 提到 1 也只有一层灰雾。
      → 换 alpha 加强版 d-bg2_1-mobile.png（见下方 @media 内注释），
        再配合 0.75/0.65/0.4 的透明度；三条边框同步加深。
   2. 构图 —— 375px 下三环是 322/225/150px，内环那个 150px 的圆正好框住
      标题（花边落在 r=48~64，横穿字面），所以内环纹样只给 0.4，
      读作极淡的质感层而不是第二层图案。
   3. 尺寸 —— 只用 vw 时横屏（812×375）外环算到 698px，整圈被 overflow
      裁成几段弧。补 70vh 上限：竖屏 812 高时 70vh=568 远大于 86vw=322，
      取值不变；横屏自动收到 262px，三环都能完整成圆。
      中/内环按 0.698 / 0.465 的等比跟着收，保持同心比例不歪。

   另外三项是首屏的既有开销，都在 .hero-bg 内部、不动结构：
   · 经纬网停掉 background-position 漂移 —— background-position 不可合成，
     等于每帧重绘整个首屏，是移动端最贵的一项；而 4.2px/s 的位移
     本来就"看不清在动"，手机上更看不出，停掉纯赚。
   · 双光斑 blur 80px→48px、直径缩三成 —— blur 半径对移动 GPU 是平方级成本。
   · 天光去掉 repeating-conic 光芒层并停转 —— 46vw≈172px 时那道光芒
     已经落在亚像素上，只剩径向核有意义，conic 白栅格化一遍。 */
@media (max-width: 768px) {
    /* 纹样换加强版（d-bg2_1-mobile.png：尺寸与 RGB 不动，只把 alpha
       ×2 后截顶）。原因：mask 是按**设备像素**栅格化的，1060 的细花边缩到
       400px 时峰值从 0.502 掉到 0.220 —— 靠调 opacity 补不回来，因为遮罩
       本身已经被平均没了。加强后在同样位置峰值回到 0.44（1x）/ 0.77（2x），
       才有"提透明度"的空间。
       background-image 不在此声明：由 useRingPatternStyle 注入的同断点
       @media (max-width: 768px) 规则提供（相对 url() 必须由文档级样式表解析，
       原因见桌面纹样层块注释）。 */

    /* 三条边框同步加深：小屏上 1px 细线本来就吃亏，
       桌面档的绿在 #f9f9f9 上几乎读不出"这里有三个环" */
    .hero-bg__ring--outer {
        width: min(86vw, 70vh);
        height: min(86vw, 70vh);
        border-color: rgba(var(--brand-primary-rgb), 0.45);
    }

    .hero-bg__ring--mid {
        width: min(60vw, 48.9vh);
        height: min(60vw, 48.9vh);
        border-color: rgba(var(--brand-primary-rgb), 0.35);
    }

    .hero-bg__ring--inner {
        width: min(40vw, 32.6vh);
        height: min(40vw, 32.6vh);
        border-color: rgba(var(--brand-primary-rgb), 0.28);
    }

    .hero-bg__ring--outer::before {
        opacity: 0.75;
    }

    .hero-bg__ring--mid::before {
        opacity: 0.65;
    }

    .hero-bg__ring--inner::before {
        opacity: 0.4;
    }

    /* 公转点跟着环一起缩小，否则 14px 的视觉直径在 322px 的环上占 4.3%
       （桌面上只占 1.5%），会读成"一个大圆点"而不是"轨道上的质点"。
       点改由渐变绘制后，缩尺寸 = 改渐变半径 + 同步改 inset（点始终压环线） */
    .hero-bg__ring--outer::after {
        inset: -5.5px;
        background: radial-gradient(
            circle 5.5px at 50% 5.5px,
            transparent 4px,
            var(--brand-gold) 4px 5.5px,
            transparent 5.5px
        );
    }

    .hero-bg__ring--mid::after {
        inset: -3px;
        background: radial-gradient(
            circle 3px at 50% 3px,
            var(--brand-gold) 3px,
            transparent 3px
        );
    }

    .hero-bg__grid {
        animation: none;
    }

    .hero-bg__blob {
        filter: blur(48px);
    }

    .hero-bg__blob--1 {
        width: 300px;
        height: 300px;
    }

    .hero-bg__blob--2 {
        width: 260px;
        height: 260px;
    }

    .hero-bg__sun {
        background: radial-gradient(
            circle at 50% 50%,
            rgba(var(--brand-gold-rgb), 0.16),
            rgba(var(--brand-gold-rgb), 0) 58%
        );
        opacity: 0.7;
        animation: none;
    }
}

.hero-inner {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 1200px;
    /* auto margin 垂直居中：内容超高时 margin 归零从顶部排布，不会被裁 */
    margin: auto;
}

/* 首屏渐次入场：NJNU 用 WOW.js + .fadeInUp 做这件事，这里不引库，
   直接对 .hero-inner 的直接子级排队。.hero-inner 恰好 6 个子元素，
   **DOM 顺序即视觉顺序**：eyebrow / title / subtitle / hero-stats /
   actions / github-live（数据条已经排在副标题正下方，不再靠 order 挪）。
   延迟序列沿用门户的"两端慢、中间快"节奏，避免齐刷刷像幻灯片。

   位移统一 16px + opacity，不动字号/色彩，保证不抢内容的注意力。

   第 4 项 .hero-stats 用 :not() 显式排除：它内部是 4 枚圆币各自错峰入场
   （见下方统计条段），容器再整块动一次就成了双重动画。
   用 :not() 而不是在后面写 .hero-inner > .hero-stats { animation: none }
   覆盖 —— 后者靠源顺序取胜，两个规则块一旦被挪动位置就会失效。

   注意 fill-mode 用 backwards 而非 both：both 会在动画结束后继续把
   transform/opacity 钉在终值上，而动画声明在层叠中压过普通声明 ——
   这六个元素今后若加 :hover transform 会被静默覆盖。backwards
   只在 delay 期间应用首帧，结束后交还自然状态，观感完全一致。

   第 5/6 项（按钮、认可条）的延迟特意排在圆币之后（圆币 0.30/0.22 结束于
   1.00/0.92s，按钮 0.42、认可条 0.50）：入场顺序必须读作
   "标题 → 数据 → 出口"，否则数据条会晚于它下方的按钮浮现，看着像补丁。 */
@media (prefers-reduced-motion: no-preference) {
    .hero-inner > :not(.hero-stats) {
        animation: hero-rise 0.7s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;
    }

    .hero-inner > :nth-child(1) {
        animation-delay: 0.05s;
    }

    .hero-inner > :nth-child(2) {
        animation-delay: 0.16s;
    }

    .hero-inner > :nth-child(3) {
        animation-delay: 0.24s;
    }

    /* 第 4 项是 .hero-stats（已排除），延迟由 .stat-item 各自持有 */
    .hero-inner > :nth-child(5) {
        animation-delay: 0.42s;
    }

    .hero-inner > :nth-child(6) {
        animation-delay: 0.5s;
    }
}

@keyframes hero-rise {
    from {
        opacity: 0;
        transform: translateY(16px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
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
    margin: 0 0 1.1rem;
    font-size: clamp(2rem, 5vw, 3.2rem);
    font-weight: 800;
    line-height: 1.25;
    color: var(--text-primary);
    letter-spacing: 0.5px;
    /* 字体双轨：主英雄标题也用衬线（与节标题、强调短语同款），
       形成"衬线标题 + 无衬线正文"的编辑感对比，完成南师大宋体标题借鉴 */
    font-family: var(--font-serif);
    /* 去掉硬 <br/> 后交给浏览器平衡断行：窄屏自动折行、宽屏尽量一行，
       不再因固定换行在中等屏出现单字孤行 */
    text-wrap: balance;
}

/* 标题衬线：南师大 .tit-bg 用一张书法笔触背景图托住标题。
   这里用纯 CSS 等价实现 —— 中间实、两端虚的一道细线，
   只"托"不"框"，是全场唯一一处大面积暖金，克制才显贵。 */
.hero-title::after {
    content: '';
    display: block;
    width: 72px;
    height: 2px;
    margin: 0.85rem auto 0;
    border-radius: 1px;
    background: linear-gradient(
        90deg,
        transparent 0%,
        var(--brand-gold) 20%,
        var(--brand-gold) 80%,
        transparent 100%
    );
}

.hero-title-accent {
    background: linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-dark) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
    /* 双轨字体：强调短语用衬线（与节标题同款），与主标题无衬线形成对比，
       是南师大"宋体标题"手法在 hero 上的轻量落地 */
    font-family: var(--font-serif);
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
    background: var(--success);
    box-shadow: 0 0 0 4px rgba(var(--success-rgb), 0.18);
    animation: live-pulse 2s ease-in-out infinite;
}

@keyframes live-pulse {
    0%,
    100% {
        box-shadow: 0 0 0 3px rgba(var(--success-rgb), 0.18);
    }
    50% {
        box-shadow: 0 0 0 6px rgba(var(--success-rgb), 0.08);
    }
}

/* 减弱动态偏好：停用唯一的无限循环动画（live-dot 脉冲）+ 平滑滚动 */
@media (prefers-reduced-motion: reduce) {
    .landing-container {
        scroll-behavior: auto;
    }

    .live-dot.on {
        animation: none;
    }

    /* 滚动条滑块的 0.25s 提亮过渡一并停用（颜色仍随 hover 即时切换） */
    .landing-container::-webkit-scrollbar-thumb {
        transition: none;
    }

    /* 徽牌 hover 旋转停用（mask 单色静态显示不受影响） */
    .brand-badge {
        transition: none;
    }

    .brand-badge:hover {
        transform: none;
        will-change: auto;
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

/* ============ Hero 统计条 · 四枚圆形数据卡 ============
   原型取自南师大 .d-numDUl-1：圆形托底 + 中间大数字 + 下方说明，
   且四卡用 left/top 百分比错落排布，不是一字平铺。
   原版是一条白色长卡 + 竖分隔线，属纯方框语言；改成"圆币"后与
   Hero 三环、feature 圆形图标井、节区印章形成同一套语汇。

   容器不再自带底色/描边/投影——四枚圆币各自带这些，
   再套一层外壳会回到"方框套圆"的老问题。 */
.hero-stats {
    display: flex;
    justify-content: center;
    /* flex-start 而非 center：错落靠 margin-top 实现，
       align-items:center 会把下沉项重新拉平 */
    align-items: flex-start;
    gap: 0.5rem 2rem;
    flex-wrap: wrap;
    max-width: 860px;
    /* 上边距交给 .hero-subtitle 的 2.5rem（相邻兄弟 margin 取大值）；
       下边距 2.5rem 与"副标题→数据条"同宽，数据条夹在文字与 CTA 之间
       才有呼吸。移动端它会被 .hero-actions 的 3.5rem 盖过（同样取大值），
       所以不必再单独写一条窄屏值 */
    margin: 0 auto 2.5rem;
}

/* 容器不整块入场（由上方 :not(.hero-stats) 排除），
   改由 4 枚圆币各自错峰浮现，否则会出现
   "整块先出现、内部再动一次"的双重动画 */

.stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.7rem;
    width: 104px;
}

/* 错落：偶数项下沉，读作"一波"而不是"一列" */
.stat-item:nth-child(even) {
    margin-top: 18px;
}

/* 圆币：白底 + 细边 + 轻投影。这是统计条唯一保留"卡片"质感的地方 */
.stat-face {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 92px;
    height: 92px;
    border-radius: 50%;
    background: var(--bg-primary);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.16);
    box-shadow: 0 4px 14px rgba(20, 45, 25, 0.07);
    transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

/* 内圈虚线：同心圆语汇的第三处复用（Hero 外环 / 节区印章 / 此处） */
.stat-face::after {
    content: '';
    position: absolute;
    inset: 7px;
    border-radius: 50%;
    border: 1px dashed rgba(var(--brand-primary-rgb), 0.22);
    transition: border-color 0.25s ease;
}

.stat-item:hover .stat-face {
    border-color: rgba(var(--brand-gold-rgb), 0.5);
    box-shadow: 0 6px 18px rgba(20, 45, 25, 0.1);
}

.stat-item:hover .stat-face::after {
    border-color: rgba(var(--brand-gold-rgb), 0.45);
}

.stat-value {
    font-family: var(--font-num);
    font-size: 2rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.5px;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
}

.stat-label {
    font-size: 0.78rem;
    color: var(--text-muted);
    transition: color 0.25s ease;
}

.stat-item:hover .stat-label {
    color: var(--text-secondary);
}

/* ============ 移动端首屏：数据行与桌面同序，只是尺寸收小 ============
   视觉顺序（DOM 顺序，桌面端也一样）：
     eyebrow → title → subtitle → 数据行 → 按钮 → GitHub 认可
   数据行站在按钮**之前** —— "社会证明"先于"行动号召"，首屏不会第一眼
   落在出口上。桌面端已把 stats 挪到副标题正下方，这里不需要任何重排：
   容器保持普通块流，子项按文档顺序自上而下排，DOM 一行都不用改。

   数据行沿用桌面的"一行交错"（偶数项下沉），只是尺寸收到 66/56：
   375px 下内容宽 343，4×66 + 3×5 = 279，留 64px 余量一行放下；
   320px 小屏（内容宽 288）也还够，不会跳成两行。 */
@media (max-width: 768px) {
    .hero-inner {
        /* 与下方 .hero-actions 的 margin-top 取同一个值 —— 见那里的说明 */
        padding-top: 3.5rem;
    }

    /* 按钮 + 认可条整体下沉。
       不能只加这一条 margin —— .hero-inner 是整块居中，多出来的高度会被
       对半分到上下两侧，结果是文字块上移一半、下方只下移一半。
       所以 .hero-inner 补了**等量**的 padding-top：令 P = M，则文字块中心
       恒在 (首屏 padding-top + P − 下方内容高)/2 这个位置（与 M 无关），
       也就是始终落在环心上；M 变大只会把下方两条往下推。 */
    .hero-actions {
        margin-top: 3.5rem;
    }

    /* 一行四枚、紧贴排布。全部加 .hero-stats 前缀提高特异性 ——
       文件后半段的 768/480 断点里还有 .hero-stats{gap:...}、
       .stat-item{width:88px}、.stat-item{flex:1 1 40%}、.stat-face{76px}、
       .stat-value{1.35rem} 和 :nth-child(even){margin-top:12px}，
       它们在本块之后，同特异度会赢。
       flex-wrap 保留继承来的 wrap：320px 及以下万一装不下，
       退化成 2×2 也比 nowrap 直接溢出被 overflow:hidden 裁掉好。 */
    .hero-inner .hero-stats {
        gap: 0.5rem 5px;
    }

    .hero-stats .stat-item {
        /* 480 断点给了 flex: 1 1 40%，会把四枚拉成 2×2 的棋盘，这里收回 */
        flex: 0 0 auto;
        width: 66px;
    }

    /* 交错幅度同步收小：桌面的 18px 放到 56px 的圆币上显得散 */
    .hero-stats .stat-item:nth-child(even) {
        margin-top: 14px;
    }

    .hero-stats .stat-face {
        width: 56px;
        height: 56px;
    }

    .hero-stats .stat-value {
        font-size: 1rem;
    }

    .hero-stats .stat-label {
        font-size: 0.65rem;
    }

    /* 环心对齐：文字块中心与首屏中心的差值可解析地算出来 ——
         offset = (首屏 padding-top + .hero-inner 的 padding-top − 下方内容高) / 2
       因为 .hero-inner 整块在「内容盒」里居中，而 .hero-bg 是 inset:0、
       参照的是「内边距盒」，两者差着一个 3rem 的 padding-top。

       逐项（≤768 断点）：副标题下边距 40 + 数据行 96
       + 数据行→按钮间距 56（数据行下边距 40 与按钮上边距 56 **合并取大值**，
         不是相加）+ 两枚按钮 46 + 48 + 间距 16 = 110 + 按钮下边距 20
       + 认可条 33 + 认可条下边距 40 = 395；首屏 padding-top 48、
       .hero-inner padding-top 56。
       → (48 + 56 − 395) / 2 ≈ −145.5。

       注意这里是**普通块流**，相邻兄弟的上下 margin 会合并取大值；
       上一版为了重排把 .hero-inner 变成 flex 列，那 16px 下边距就不再合并、
       要额外加上，偏移也从 −146 变成 −155。以后谁再动 display 都得重算。

       其中数据行/按钮/认可条的高度都取决于 font 的 line-height: normal
       （全站没指定行高），实测会有 ±4px 浮动，所以取 −146 就近居中。
       真机上若觉得环心偏高或偏低一两像素，只调这一个数就行。

       视口高度不参与（推导里会约掉），文字块自身高度也不参与
       （B 被消掉）—— 所以副标题加一行 <br> 不会影响这个值。
       唯一例外：.hero-actions 的 margin-top 与 .hero-inner 的 padding-top
       取同一个值（都是 3.5rem），在公式里一正一负抵消，所以那两处
       一起改时这个数不用动。 */
    .hero-bg__rings {
        transform: translateY(-146px);
    }
}

/* 错峰入场：门户的"中间快、两端慢"（nth-child 1/4 = 0.30s，2/3 = 0.22s）。
   数据条现在排在副标题正下方，圆币必须在按钮（0.42s）之前落位，
   所以整组提前到 0.22/0.30 —— 全部结束于 1.00s，与按钮的 1.12s 接得上。
   数字不跟随 hover 染金：门户的金色数字长在深色区块上，
   这里底色是白的，#c9a227 对白底仅约 2.6:1，会直接违反 WCAG；
   故 hover 的金只落在装饰性的圆环上，文字仍走品牌绿（对比度充足） */
@media (prefers-reduced-motion: no-preference) {
    .stat-item {
        animation: hero-rise 0.7s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;
    }

    .stat-item:nth-child(1) {
        animation-delay: 0.3s;
    }

    .stat-item:nth-child(2) {
        animation-delay: 0.22s;
    }

    .stat-item:nth-child(3) {
        animation-delay: 0.22s;
    }

    .stat-item:nth-child(4) {
        animation-delay: 0.3s;
    }
}

/* ============ 统一入场动效（P2#12：IntersectionObserver 加 .reveal-in，once） ============
   安全降级：由 JS 先给目标加 .reveal-pending 才隐藏初始态，IO 再补 .reveal-in。
   JS 未执行 / reduced-motion / 无 IO 时无 .reveal-pending，内容保持常显，
   杜绝"永远隐形"退化（与 features-reveal 同一套安全模式） */
@media (prefers-reduced-motion: no-preference) {
    .reveal-pending {
        opacity: 0;
        transform: translateY(18px);
        transition: opacity 0.7s ease, transform 0.7s cubic-bezier(0.22, 0.61, 0.36, 1);
    }

    .reveal-pending.reveal-in {
        opacity: 1;
        transform: none;
    }
}

/* ============ 通用区块头 ============ */
/* 节头样式已抽到 src/app/components/SectionTitle.vue（印章 + 标题 + 水印三件套）。
   本页通过 <SectionTitle> 复用，样式随组件 scoped 生效，故此处不再重复定义。
   OSS 区的紧凑留白由组件 compact 属性控制，移动端标题字号亦在组件内声明。 */

/* ============ 各节背景解耦层（P1#8，借鉴南师大 ind*-bg1） ============
   section 自身 isolation:isolate 建立层叠上下文，令 z-index:-1 的
   .section-bg 只在本节内垫底（不会穿到页面底色之下），内容自然浮其上。
   换肤/换主题只动此层，与内容结构完全解耦 */
.features-section,
.tech-section,
.oss-section {
    position: relative;
    isolation: isolate;
}

.section-bg {
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background:
        radial-gradient(ellipse 60% 50% at 15% 0%, rgba(var(--brand-primary-rgb), 0.06), transparent 60%),
        radial-gradient(ellipse 55% 45% at 90% 100%, rgba(var(--brand-gold-rgb), 0.05), transparent 62%),
        linear-gradient(rgba(var(--brand-primary-rgb), 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(var(--brand-primary-rgb), 0.03) 1px, transparent 1px);
    background-size: auto, auto, 36px 36px, 36px 36px;
    -webkit-mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, #000 40%, transparent 100%);
    mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, #000 40%, transparent 100%);
}

/* ============ 核心功能 ============ */
.features-section {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    /* 区块节奏统一：每节自身顶部 padding 提供与上一节的 4rem 间隔，底部归零 */
    padding: 4rem 2rem 0;
}

.features-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.5rem;
}

/* 三栏分左右对称入场（借鉴南师大 .d-news1）：仅当 JS 加了 .features-reveal
   才隐藏初始态，确保无动效/无 IO 环境卡片常显不退化。
   左列(col 0)与中列(col 1)从左滑入、右列(col 2)从右滑入；
   错峰 delay 由 JS 按 列/行 写入 transition-delay，这里只声明起止态。 */
@media (prefers-reduced-motion: no-preference) {
    .features-reveal .feature-card {
        opacity: 0;
        will-change: transform, opacity;
    }

    .features-reveal .feature-card:nth-child(3n + 1),
    .features-reveal .feature-card:nth-child(3n + 2) {
        transform: translateX(-30px);
    }

    .features-reveal .feature-card:nth-child(3n) {
        transform: translateX(30px);
    }

    .features-reveal.in-view .feature-card {
        opacity: 1;
        transform: none;
        transition: opacity 0.6s ease, transform 0.6s ease;
    }

    /* reveal 归位后 hover 抬升仍需生效：in-view 的 transform:none 特异度高于
       .feature-card:hover，故此处以更高特异度补回上浮 */
    .features-reveal.in-view .feature-card:hover {
        transform: translateY(-4px);
    }
}

/* 桌面 3 列下按等宽排布会在末行留孤卡，故末尾若干张卡跨满整行、
   转为「图标 + 文案」横向汇总卡：11 卡 = 主卡 2×2（4 格）+ 8 格 + 宽卡 3 格 ×2
   = 18 格 = 6 行，恰好铺满。跨列仅在 3 列布局（>1024px）生效；
   2 列下宽卡退化为普通卡，主卡整行 + 10 张普通卡 = 5 行，合计 6 行同样铺满；单列无需处理 */
.feature-card--wide {
    display: flex;
    flex-direction: column;
}

@media (min-width: 1025px) {
    .feature-card--wide {
        grid-column: 1 / -1;
        flex-direction: row;
        align-items: flex-start;
        gap: 1.4rem;
        padding: 1.6rem 1.8rem;
    }

    .feature-card--wide .feature-icon {
        margin-bottom: 0;
        flex-shrink: 0;
    }

    .feature-card--wide h4 {
        margin-bottom: 0.45rem;
    }
}

/* 主卡（feature1）：桌面 3 列网格里跨 2 列 2 行，制造"一张主卡 + 一圈小卡"
   的次主关系，借鉴门户"重点一块 + 环绕若干块"的版面。
   底色做品牌淡染 + 顶部强调条常驻，不靠放大字号抢戏；
   图标井常驻填充态（与 hover 态同款），读作"推荐入口 / 当前重点"。
   跨格与放大仅在 3 列（>1024px）生效；窄屏退回常规尺寸。 */
.feature-card--hero {
    background: linear-gradient(
        135deg,
        rgba(var(--brand-primary-rgb), 0.07),
        rgba(var(--brand-primary-rgb), 0.02)
    );
    border-color: rgba(var(--brand-primary-rgb), 0.28);
}

/* 主卡顶部强调条常驻（普通卡仅 hover 出现），
   让"这是重点卡"在扫视时即被读出 */
.feature-card--hero::before {
    opacity: 1;
}

@media (min-width: 1025px) {
    .feature-card--hero {
        grid-column: span 2;
        grid-row: span 2;
        padding: 2.2rem 2rem;
    }

    /* 主卡图标井常驻填充 + 虚线光环，区别于小卡的描边态 */
    .feature-card--hero .feature-icon {
        width: 64px;
        height: 64px;
        margin-bottom: 1.2rem;
        background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
        color: #fff;
        border-color: transparent;
        box-shadow: 0 6px 16px rgba(var(--brand-primary-rgb), 0.32);
    }

    .feature-card--hero .feature-icon::after {
        opacity: 1;
        transform: scale(1);
    }

    .feature-card--hero h4 {
        font-size: 1.3rem;
    }

    .feature-card--hero p {
        font-size: 0.92rem;
        max-width: 42ch;
    }

    /* 主卡预览图：不分栏，文案保持原纵向流；裸图包一层容器后嵌入右下角，
       容器 absolute 定位于卡片右下（right:0/bottom:0，压住内边距），按原比放大。
       容器用 ::after 在图片左缘叠一道白色渐变，消除硬边。其它卡无此节点，零影响 */
    .feature-card--hero {
        min-height: 400px;
    }

    .feature-card--hero p {
        /* 文案收窄 + 底部留出图位：右下大图不压字 */
        max-width: 34ch;
        margin-bottom: 13rem;
    }

    /* 预览图容器：承载左缘硬边的白色渐变叠加层（<img> 为替换元素，
       其 ::before/::after 不渲染，故用容器承载）。overflow:hidden 裁住渐变溢出 */
    .feature-hero-preview {
        position: absolute;
        right: 0;
        bottom: 0;
        width: min(68%, 540px);
        height: auto;
        overflow: hidden;
        /* 装饰性配图：不可选中、不可拖拽、不抢指针（点击穿透到卡片） */
        user-select: none;
        -webkit-user-select: none;
        -webkit-user-drag: none;
        pointer-events: none;
    }

    .feature-hero-preview__img {
        display: block;
        width: 100%;
        height: auto;
        object-fit: contain;
        /* 嵌入式裸图：无背景、无边框、无圆角、无阴影，直接落在卡面上 */
        background: none;
        border: 0;
        border-radius: 0;
        box-shadow: none;
        /* 南师大 .banner 图的 Ken Burns 手法：hover 时以超长 transition
           缓推近（6s），移出时同速退回 —— 图"自己会呼吸"，不用无限循环 */
        transition: transform 6s cubic-bezier(0.25, 0.1, 0.25, 1);
    }

    /* Ken Burns hover 推近：只放大 1.05，配容器 overflow:hidden 裁边；
       reduced-motion 环境下取消推近与过渡，图保持静止 */
    .feature-card--hero:hover .feature-hero-preview__img {
        transform: scale(1.05);
    }

    @media (prefers-reduced-motion: reduce) {
        .feature-hero-preview__img {
            transition: none;
        }

        .feature-card--hero:hover .feature-hero-preview__img {
            transform: none;
        }
    }

    /* 预览图四周白色渐变过渡：以图片中心为圆心画一道圆形径向渐变——
       圆心完全透明（保留图片主体清晰），越往外侧越白，到边缘/四角融进卡片，
       从四周同时柔化矩形硬边界，而非只做单边。起点取 --bg-primary(= #fff)
       与卡片底色同源，绿/蓝主题均无缝 */
    .feature-hero-preview::after {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: radial-gradient(
            circle at center,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0) 28%,
            var(--bg-primary) 88%
        );
    }
}

/* 主卡虚线光环常驻旋转（与 Hero 外环同源语汇），
   仅在用户允许动效时启用 */
@media (prefers-reduced-motion: no-preference) {
    .feature-card--hero .feature-icon::after {
        animation: ring-spin 24s linear infinite;
    }
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

/* 序号章：借鉴门户 tab 的序号体系（.d-tabsTit2 .num，宋体数字 + 印章底）。
   这里不做整枚印章——10 张卡各挂一枚会密不透风，只取"编号"这一件事：
   Impact 压缩体 + 深金，钉在卡片右上角。
   用 --brand-gold-dark 而非 --brand-gold：金色在白底上只有约 2.6:1，
   做文字会瞎；深金约 4.9:1，过 WCAG AA。 */
.feature-no {
    position: absolute;
    top: 1.15rem;
    right: 1.3rem;
    font-family: var(--font-num);
    font-size: 0.95rem;
    font-weight: 800;
    line-height: 1;
    letter-spacing: 0.06em;
    color: var(--brand-gold-dark);
    /* 字号随 hover 伸缩过渡（锚点在 right/top，伸大时向内左侧生长，
       不会顶出卡缘） */
    transition: font-size 0.25s ease;
}

/* 南师列表 hover 时圆点编号 20→32px 的 Impact 伸缩：角标 hover 放大一档，
   让"先看编号"的扫视顺序更有戏剧感 */
.feature-card:hover .feature-no {
    font-size: 1.25rem;
}

/* 序号左侧引出一段金线，把"编号"和卡片内容连起来，
   否则角标容易显得是贴上去的补丁 */
.feature-no::before {
    content: '';
    position: absolute;
    top: 50%;
    right: calc(100% + 8px);
    width: 14px;
    height: 1px;
    background: rgba(var(--brand-gold-dark-rgb), 0.4);
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

/* 卡片 hover 抬升（P1#6，借鉴南师大卡片 hover 上浮）：
   注：此处按用户"全量 P0–P2"选择，撤销了此前"不加可点击暗示、只换 border-color"
   的清理，恢复 lift + 投影（卡片本身无跳转目标，属纯视觉反馈）。
   本页特性卡无逐卡配图，故不做南师式图片 scale(1.08)，仅保留卡片上浮。 */
.feature-card:hover {
    border-color: rgba(var(--brand-primary-rgb), 0.3);
    transform: translateY(-4px);
    box-shadow: 0 12px 28px rgba(20, 45, 25, 0.1);
}

.feature-card:hover::before {
    opacity: 1;
}

/* 图标井由方圆改圆：全页 10 枚，是"圆"这一语汇在内容层的主要载体。
   hover 时外围绽开一圈虚线光环 —— 与 Hero 的外圈虚线环同源，
   让装饰语言在背景层和内容层说的是同一种话 */
.feature-icon {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(var(--brand-primary-rgb), 0.1);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    color: var(--brand-primary-dark);
    margin-bottom: 1rem;
    transition: background 0.25s ease, color 0.25s ease, border-color 0.25s ease,
        box-shadow 0.25s ease;
}

.feature-icon::after {
    content: '';
    position: absolute;
    inset: -7px;
    border-radius: 50%;
    border: 1px dashed rgba(var(--brand-primary-rgb), 0.42);
    opacity: 0;
    transform: scale(0.8);
    transition: opacity 0.3s ease, transform 0.3s ease;
}

@media (prefers-reduced-motion: no-preference) {
    .feature-card:hover .feature-icon::after {
        opacity: 1;
        transform: scale(1);
        animation: ring-spin 24s linear infinite;
    }
}

@media (prefers-reduced-motion: reduce) {
    .feature-card:hover .feature-icon::after {
        opacity: 1;
        transform: scale(1);
    }
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

/* ============ 技术栈 ============
   外层 section 通宽（承接 scroll-margin 与 scroll spy 定位），
   内容由 .tech-inner 收进 1200px 版心；背景恢复整页浅色，不做深色带 */
.tech-section {
    width: 100%;
    margin: 0 auto;
    padding: 4rem 0 0;
}

.tech-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 2rem;
}

/* 三层卡片：01 渲染 / 02 服务 / 03 交付。
   align-items: stretch（默认）让三张卡等高 —— 条目数 3/2/2 不等，
   靠卡内 .tech-layer__tags 的 margin-top: auto 把底边压齐 */
.tech-layers {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.25rem;
}

/* 注：这三张卡**不要**加进 observeReveal 的 .reveal-pending 名单。
   那条规则靠 transition 做淡入，而卡片自身已声明 border/shadow/transform
   过渡，同特异度下后声明的 .tech-layer 会把它整条覆盖掉（opacity 不在
   过渡列表里 → 淡入退化成硬闪）。节头 .section-head 仍会整体淡入，够了 */
.tech-layer {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 1.75rem 1.5rem 1.4rem;
    border-radius: 16px;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    overflow: hidden;
    transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
}

/* 顶部渐显细线 + hover 抬升：与 .feature-card 同一套交互语言，
   保证同一页里"卡片"这个语汇只有一种表现 */
.tech-layer::before {
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

/* hover 擦除（借鉴南师 ul-listnews/notice 的 width 0→100% 填充）：
    卡上从左到右扫过一道品牌 7% + 金 7% 的低透水洗 —— 不用图片素材，
    与"金只做呼吸点"的规则一致，扫过即回。锚 scaleX + origin left，
    避免动 width 造成逐帧垃圾布局；卡片自带 overflow:hidden，
    inset 0 + border-radius: inherit 的伪元素不会溢出卡圆角 */
.tech-layer::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(
        100deg,
        rgba(var(--brand-primary-rgb), 0.07),
        rgba(var(--brand-gold-rgb), 0.07) 55%,
        transparent 100%
    );
    transform: scaleX(0);
    transform-origin: left center;
    transition: transform 0.8s cubic-bezier(0.22, 0.61, 0.36, 1);
    pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
    .tech-layer::after {
        transition: none;
    }
}

.tech-layer:hover {
    border-color: rgba(var(--brand-primary-rgb), 0.3);
    transform: translateY(-4px);
    box-shadow: 0 12px 28px rgba(20, 45, 25, 0.1);
}

.tech-layer:hover::before {
    opacity: 1;
}

.tech-layer:hover::after {
    transform: scaleX(1);
}

.tech-layer__head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 1rem;
}

/* 层号：外圈虚线的圆形印章，是节头印章 / Hero 三环的又一次微缩复用。
   数字用深金而非亮金 —— #c9a227 在白底仅约 2.6:1，做文字会瞎 */
.tech-layer__no {
    flex: none;
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    border: 1px dashed rgba(var(--brand-primary-rgb), 0.3);
    background: radial-gradient(
        circle closest-side,
        rgba(var(--brand-gold-rgb), 0.12),
        transparent
    );
    font-family: var(--font-num);
    font-size: 1rem;
    font-weight: 800;
    line-height: 1;
    color: var(--brand-gold-dark);
}

.tech-layer__titles {
    min-width: 0;
}

.tech-layer__name {
    margin: 0;
    font-family: var(--font-serif);
    font-size: 1.1rem;
    font-weight: 700;
    line-height: 1.3;
    color: var(--text-primary);
}

/* 层名英文小字：纯装饰（中文层名已承载语义），故 aria-hidden + --text-muted。
   本文件别处已写明 #999 在 12px 下仅 2.8:1、不达 WCAG AA —— 所以凡是
   **承载信息**的小字一律用 --text-secondary(#666, 5.7:1)，只有装饰才用 muted */
.tech-layer__en {
    margin: 3px 0 0;
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: var(--text-muted);
}

/* 层职责：一句话交代这一层在整条链路里干什么 */
.tech-layer__role {
    margin: 0 0 1.2rem;
    font-size: 0.84rem;
    line-height: 1.7;
    color: var(--text-secondary);
}

.tech-layer__items {
    list-style: none;
    margin: 0 0 1.1rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
}

.tech-layer__item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
}

.tech-layer__icon {
    flex: none;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(var(--brand-primary-rgb), 0.08);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.16);
    color: var(--brand-primary-dark);
    font-size: 13px;
    /* 与右侧两行文字的基线对齐（首行文字约 1.2em） */
    margin-top: 1px;
}

.tech-layer__body {
    min-width: 0;
}

.tech-layer__label {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 700;
    line-height: 1.4;
    color: var(--text-primary);
}

/* 单项职责：正文里最次要的一级，0.78rem / --text-secondary（#666，白底 5.7:1） */
.tech-layer__duty {
    margin: 3px 0 0;
    font-size: 0.78rem;
    line-height: 1.65;
    color: var(--text-secondary);
}

/* 该层产出：虚线分隔 + 推到卡底，三张卡的这条线因此齐平。
   承载信息 → 用 --text-secondary 而非 muted（#999 在 11.5px 下只有 2.8:1） */
.tech-layer__tags {
    margin: auto 0 0;
    padding-top: 0.9rem;
    border-top: 1px dashed var(--border-light);
    font-size: 0.72rem;
    letter-spacing: 0.2px;
    line-height: 1.6;
    color: var(--text-secondary);
}

.tech-layer__tags::before {
    content: '';
    display: inline-block;
    width: 5px;
    height: 5px;
    margin-right: 7px;
    border-radius: 50%;
    background: var(--brand-gold);
    vertical-align: 2px;
}

/* 徽章行上方的小标：说明这一排是"完整清单"，不是又一遍同样的内容。
   0.7rem 下 #999 不达标，这里同样用 --text-secondary */
.tech-stack-caption {
    margin: 2.5rem 0 0.9rem;
    text-align: center;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 2px;
    color: var(--text-secondary);
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

/* 南师 hover 换金色手法：徽标 hover 时图标转为深金，
   成为绿底之外的第二处"金色呼吸点"（文字仍走深绿保证对比度） */
.tech-badge:hover svg,
.tech-badge:hover i {
    color: var(--brand-gold-dark);
}

/* ============ 开源认可（Star History） ============ */
.oss-section {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 4rem 2rem 0;
}

/* OSS 区头紧凑留白改由 <SectionTitle compact> 控制（样式在组件内） */

/* 统计数值已并入 support 按钮（oss-support-btn-value），
   原独立统计行与 Hero pills 重复展示，已下线 */
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

/* 南师 .ani_right 的精神：外链图标 hover 向右轻推 2px，
   暗示"链接会带你去别处"；reduced-motion 下不位移 */
.oss-repo-link svg {
    transition: transform 0.25s ease;
}

.oss-repo-link:hover svg {
    transform: translateX(2px);
}

@media (prefers-reduced-motion: reduce) {
    .oss-repo-link svg {
        transition: none;
    }

    .oss-repo-link:hover svg {
        transform: none;
    }
}

/* 两级日期徽章（借鉴南师大 .time .t1 日 + .t2 年月）：
   大日数字用 Impact 体系 --font-num，下缀小字「年.月」；纵向两行
   站在胶囊里靠 flex-column 收住行高。金色文字用深金 —— 亮金 #c9a227
   对白底仅约 2.6:1，本文件别处已有结论，凡文字一律走 gold-dark */
.oss-date {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.05;
    margin: 0 2px;
}

.oss-date__day {
    font-family: var(--font-num);
    font-size: 1.05rem;
    font-weight: 500;
    color: var(--brand-gold-dark);
}

.oss-date__ym {
    font-size: 0.62rem;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
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

/* 数值小徽章：绿色实心按钮内用半透明白，描边按钮内用浅灰底 */
.oss-support-btn-value {
    display: inline-flex;
    align-items: center;
    margin-left: 2px;
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
}

.oss-support-btn--star .oss-support-btn-value {
    background: rgba(255, 255, 255, 0.22);
    color: #fff;
}

.oss-support-btn--fork .oss-support-btn-value {
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    color: var(--text-secondary);
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
    /* 末节：顶部 4rem 与上节拉开，底部 4rem 收边至页脚 */
    padding: 4rem 2rem 4rem;
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

/* 收尾节同心环：与 Hero 同构但更小、更淡，只做"页面闭合"的呼应感，
   不抢 CTA 文案的注意力。两环反向、周期不同步。
   同样不加 mask —— 理由同 Hero：以环心为中心的径向渐隐会把最大的环
   先抹掉；圆环半径大于卡片半高，被卡片 overflow:hidden 裁成上下两段
   弧线，读作"拱卫文案"而非"没画完" */
.cta-bg__rings {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
}

.cta-bg__ring {
    grid-area: 1 / 1;
    border-radius: 50%;
}

.cta-bg__ring--outer {
    width: min(560px, 88%);
    height: min(560px, 88%);
    border: 1px dashed rgba(var(--brand-primary-rgb), 0.2);
}

.cta-bg__ring--inner {
    width: min(360px, 58%);
    height: min(360px, 58%);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.14);
}

@media (prefers-reduced-motion: no-preference) {
    .cta-bg__ring--outer {
        animation: ring-spin 170s linear infinite;
    }

    .cta-bg__ring--inner {
        animation: ring-spin-rev 96s linear infinite;
    }
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

.cta-method .icon-github {
    width: 13px;
    height: 13px;
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

/* ============ 页脚 · 三层结构（借鉴南师 .box-footer1） ============
   层次：1) footer-quick 快捷圆钮  2) footer-rule 发丝线  3) footer-meta 法务行。
   背景恢复整页浅色；顶部过渡沿用原来的"白渐隐"晕边（不用硬 1px 线）。
   仍不能用 overflow:hidden —— hover 弹层（.footer-pop）向上弹出 */
.footer {
    position: relative;
    padding: 2.6rem 2rem 2rem;
    background: var(--bg-primary);
}

/* 顶部白色线性渐变：页脚与上一区块的交界由白→透明的渐变"晕"开，
   伪元素绝对定位盒顶铺满宽度；不设 z-index 压过 footer 背景但低于
   .footer-inner（z-index:1）；pointer-events:none 不影响交互 */
.footer::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 72px;
    background: linear-gradient(
        to bottom,
        rgba(255, 255, 255, 1),
        rgba(255, 255, 255, 0) 100%
    );
    pointer-events: none;
}

.footer-inner {
    position: relative;
    z-index: 1;
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.35rem;
}

/* 第一层 · 快捷入口圆钮（借鉴南师 ul.d-ftNavUl-1）：46px 发丝圆框，
   品牌绿描边 + 深绿 icon；hover 金环点亮 + 抬升，与全页"金只做呼吸点"
   的角色一致。弹层复用既有 .footer-link-pop/.footer-pop，域名小字
   给足"这是哪儿"的信息 */
.footer-quick {
    display: flex;
    align-items: center;
    gap: 1.15rem;
    list-style: none;
    margin: 0;
    padding: 0;
}

.footer-quick li {
    display: flex;
}

.footer-entry {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--brand-primary-dark);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.24);
    background: rgba(255, 255, 255, 0.55);
    transition:
        border-color 0.2s ease,
        background 0.2s ease,
        color 0.2s ease,
        transform 0.2s ease,
        box-shadow 0.2s ease;
}

.footer-entry .icon-github {
    width: 17px;
    height: 17px;
}

.footer-entry:hover {
    border-color: rgba(var(--brand-gold-rgb), 0.55);
    background: rgba(255, 255, 255, 0.9);
    color: var(--brand-gold-dark);
    transform: translateY(-3px);
    box-shadow: 0 8px 18px rgba(20, 45, 25, 0.1);
}

/* 第二层 · 发丝线：两端虚化的 1px 渐变，替代实心 border 的生硬。
   中央缀一枚金点 —— 南师印章系统的"中心金点"在最小尺寸上的复用，
   与 stat-face 内圈虚线、tech-layer 序号章形成同一套金点语汇 */
/* 51.la 访客数据：单行排布，用细竖线分隔，与页脚的细线/灰字语汇一致。
   数据由 fetchVisitorStats() 取回、Vue 渲染；窄屏自动换行，不会溢出 */
.footer-visitor {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: center;
    gap: 2px 0;
    margin: 26px 0 12px;
    font-size: 12px;
    line-height: 1.9;
    color: var(--text-muted);
}

.footer-visitor__title {
    padding: 0 14px 0 0;
    color: var(--text-secondary);
    font-weight: 600;
}

.footer-visitor__item {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    padding: 0 14px;
    border-left: 1px solid var(--border-light);
}

.footer-visitor__value {
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
}

/* 更新时间：与指标同排但视觉权重再低一档（不抢数字），
   靠同一道竖线前缀维持「一行数据」的读法；数字用等宽数字避免宽度跳动 */
.footer-visitor__stamp {
    padding: 0 0 0 14px;
    border-left: 1px solid var(--border-light);
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
}

.footer-rule {
    position: relative;
    align-self: stretch;
    height: 1px;
    background: linear-gradient(
        90deg,
        transparent,
        var(--border-light),
        transparent
    );
}

.footer-rule::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 5px;
    height: 5px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: var(--brand-gold);
    opacity: 0.75;
}

/* 第三层 · 法务行：版权 + 隐私/条款 */
.footer-meta {
    width: 100%;
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

/* ============ 页脚外链 hover 弹层（P2#13，借鉴南师友链下拉） ============ */
.footer-link-pop {
    position: relative;
    display: inline-flex;
    align-items: center;
}

.footer-pop {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    transform: translate(-50%, 6px);
    padding: 0.4rem 0.7rem;
    border-radius: 8px;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    box-shadow: 0 8px 20px rgba(20, 45, 25, 0.12);
    color: var(--text-secondary);
    font-size: 0.72rem;
    white-space: nowrap;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
    /* 将 hover 悬浮提示框层级置顶 */
    z-index: 999;
}

.footer-pop::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    margin-left: -5px;
    border: 5px solid transparent;
    border-top-color: var(--bg-primary);
    filter: drop-shadow(0 1px 0 var(--border-light));
}

.footer-link-pop:hover .footer-pop,
.footer-link-pop:focus-within .footer-pop {
    opacity: 1;
    visibility: visible;
    transform: translate(-50%, 0);
}

/* ============ 右侧轨道式区块导航（P1#7） ============
   Hero 轨道环语汇的收束：三枚轨道点对应三大节，选中点拉长为胶囊。
   fixed 右侧居中，桌面显示、≤1024px 隐藏（移动端另有全屏菜单） */
.section-orbit {
    position: fixed;
    right: 22px;
    top: 50%;
    transform: translateY(-50%);
    z-index: calc(var(--z-float, 100) - 1);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
}

.orbit-dot {
    width: 9px;
    height: 9px;
    padding: 0;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.45);
    border-radius: 999px;
    background: transparent;
    cursor: pointer;
    transition: height 0.3s ease, background 0.3s ease, border-color 0.3s ease;
}

.orbit-dot:hover {
    background: rgba(var(--brand-primary-rgb), 0.4);
}

.orbit-dot.active {
    height: 24px;
    background: var(--brand-gold);
    border-color: var(--brand-gold);
}

/* ============ 移动端全屏菜单覆层（P2#10） ============
   原实现是「深绿 → 近黑」的渐变 + 顶部绿光晕，和整页的浅色纸面
   （#f9f9f9 + 细网格 + 金/绿双色柔光 + 衬线标题）完全两套语言，
   盖上来像跳到了另一个站 —— 这是"背景很丑"的根源。
   改成同一张纸：底色、网格、柔光全部复用 .section-bg 的参数，
   顶部补一道与 .navbar::before 同款的品牌渐变封边，
   覆层因此读作"页面拉长了一屏"，而不是"弹出一块黑幕"。 */
.mobile-menu {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-float, 100) + 10);
    display: flex;
    flex-direction: column;
    padding: 0 1.5rem 2rem;
    /* 刘海 / 小白条安全区；env 无值时回落到 0，不影响桌面调试 */
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: calc(2rem + env(safe-area-inset-bottom, 0px));
    /* 覆层本身不滚，滚动交给中间的 .mobile-menu__nav ——
       顶栏与底部按钮因此始终固定，列表再长也不会把它们顶走 */
    overflow: hidden;
    color: var(--text-primary);
    /* 半透明 + 背景模糊：让底下的页面隐约透上来。
       原来是实心 #f9f9f9 整屏糊死，盖上来像"跳到另一个站"；
       0.8 是折中 —— 再往下压，正文压在复杂内容上对比度就悬了 */
    background-color: rgba(249, 249, 249, 0.8);
    backdrop-filter: blur(20px) saturate(150%);
    -webkit-backdrop-filter: blur(20px) saturate(150%);
    /* 五层背景按顺序：① 顶部 3px 品牌封边 ② 顶部绿光 ③ 右下金光 ④⑤ 细网格 */
    background-image:
        linear-gradient(90deg, var(--brand-primary), var(--brand-gold)),
        radial-gradient(
            ellipse 90% 52% at 50% -8%,
            rgba(var(--brand-primary-rgb), 0.13),
            transparent 62%
        ),
        radial-gradient(
            ellipse 70% 45% at 102% 106%,
            rgba(var(--brand-gold-rgb), 0.1),
            transparent 60%
        ),
        linear-gradient(rgba(var(--brand-primary-rgb), 0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(var(--brand-primary-rgb), 0.035) 1px, transparent 1px);
    background-size: 100% 3px, auto, auto, 32px 32px, 32px 32px;
    background-position: 0 0, 0 0, 0 0, 0 0, 0 0;
    background-repeat: no-repeat, no-repeat, no-repeat, repeat, repeat;
}

/* 不支持 backdrop-filter 时退回近实心：否则 0.8 的底直接透上来，
   深色文字压在页面内容上会读不清 */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .mobile-menu {
        background-color: rgba(249, 249, 249, 0.97);
    }
}

/* 顶栏：与 .navbar-inner 同高（--landing-navbar-h），品牌落点因此不跳 */
.mobile-menu__bar {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    height: var(--landing-navbar-h, 64px);
}

.mobile-menu__brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}

.mobile-menu__wordmark {
    font-size: 1.02rem;
    font-weight: 700;
    letter-spacing: 0.3px;
    color: var(--brand-primary-dark);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* 关闭钮：与 .nav-burger 同尺寸的圆形按钮，浅底细边 */
.mobile-menu__close {
    flex: none;
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border: 1px solid var(--border-light);
    border-radius: 50%;
    background: var(--bg-primary);
    color: var(--text-secondary);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    transition: color 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.mobile-menu__close:active {
    color: var(--brand-primary-dark);
    border-color: rgba(var(--brand-primary-rgb), 0.4);
}

/* 悬停高亮只授给真正支持悬停的设备：菜单覆层只在触屏出现，:hover 粘住会让
   关闭钮一直保持旋转 90° 的高亮态；按压反馈交给 :active */
@media (hover: hover) and (pointer: fine) {
    .mobile-menu__close:hover {
        color: var(--brand-primary-dark);
        border-color: rgba(var(--brand-primary-rgb), 0.4);
        transform: rotate(90deg);
    }
}

/* 两级索引，结构照搬南师大 header-con 的 `.scroll > ul > li`：
   栏目行（h2.title）→ 子项列表（dl > dd），左对齐 + 发丝线 + 右箭头。
   · 为什么补第二级：本页只有 4 个栏目，任何"撑满一屏"的做法都只能靠
     拉高行距，结果就是字浮在一大片空气里（上一版行高 128px 就是这个病）。
     南师大那套之所以不散，是因为它本身是一张密集的站点索引 ——
     这里补上真实的第二级（核心功能 10 张卡、技术栈 3 层），
     密度由内容给，而不是由行高硬撑。
   · 列表整体可滚动、按钮与个人主页固定在底部：屏幕多高都不会出现
     "中间一坨、四周一圈空白"或"三块各据一方"的极端。 */
.mobile-menu__nav {
    flex: 1;
    /* flex 子项要能滚动，必须允许它缩到内容高度以下 */
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    width: 100%;
    max-width: 24rem;
    margin: 0 auto;
    /* 浅色纸面上别横插一道深槽 */
    scrollbar-width: thin;
}

.mobile-menu__list {
    margin: 0;
    padding: 0;
    list-style: none;
}

/* 栏目行：序号 + 标题 + 箭头，箭头靠 margin-left: auto 推到最右，
   与南师大 `i.arrow` 的位置一致 */
.mobile-menu__head {
    appearance: none;
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 0.92rem 0.25rem;
    border: 0;
    border-bottom: 1px solid var(--border-light);
    background: transparent;
    color: var(--text-primary);
    font-family: var(--font-serif);
    font-size: 1.08rem;
    font-weight: 700;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition: color 0.2s ease, border-color 0.2s ease;
}

.mobile-menu__label {
    min-width: 0;
}

.mobile-menu__arrow {
    /* iOS Safari：必须用 CSS 给死宽高，光有 :size 属性会塌成点 */
    width: 16px;
    height: 16px;
    flex: none;
    margin-left: auto;
    color: var(--text-muted);
    transition: transform 0.2s ease, color 0.2s ease;
}

.mobile-menu__head:focus-visible {
    color: var(--brand-primary-dark);
    border-bottom-color: rgba(var(--brand-primary-rgb), 0.45);
}

.mobile-menu__head:active {
    color: var(--brand-primary-dark);
}

/* 悬停高亮只授给真正支持悬停的设备：触屏上点开/收起栏目后 :hover 会粘在
   该行上（文字变色 + 箭头位移都留着，像始终处于悬停），按压反馈交给 :active */
@media (hover: hover) and (pointer: fine) {
    .mobile-menu__head:hover {
        color: var(--brand-primary-dark);
        border-bottom-color: rgba(var(--brand-primary-rgb), 0.45);
    }
}

/* 箭头右移 3px 作为悬停反馈：左对齐布局里怎么动都不会撞歪任何轴线 */
.mobile-menu__head:focus-visible .mobile-menu__arrow {
    color: var(--brand-primary-dark);
    transform: translateX(3px);
}

@media (hover: hover) and (pointer: fine) {
    .mobile-menu__head:hover .mobile-menu__arrow {
        color: var(--brand-primary-dark);
        transform: translateX(3px);
    }
}

/* 子项：单列紧凑排布（手机上单列比双列好扫读，13 条也刚好把一屏填满）。
   左缩进 38px = 序号槽 26px + 间距 12px，与栏目标题落在同一条竖线上 */
.mobile-menu__sub {
    margin: 0;
    padding: 0.3rem 0 0.6rem 38px;
    list-style: none;
    border-bottom: 1px solid var(--border-light);
}

.mobile-menu__sub-link {
    appearance: none;
    display: block;
    width: 100%;
    padding: 0.3rem 0;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.86rem;
    line-height: 1.4;
    text-align: left;
    cursor: pointer;
    transition: color 0.2s ease, transform 0.2s ease;
}

.mobile-menu__sub-link:focus-visible {
    color: var(--brand-primary-dark);
    transform: translateX(3px);
}

.mobile-menu__sub-link:active {
    color: var(--brand-primary-dark);
}

/* 悬停高亮只授给真正支持悬停的设备：触屏上点子项跳转后 :hover 会粘住
   （文字保持深色 + 右移 3px），按压反馈交给 :active */
@media (hover: hover) and (pointer: fine) {
    .mobile-menu__sub-link:hover {
        color: var(--brand-primary-dark);
        transform: translateX(3px);
    }
}

/* 序号用深金：亮金 #c9a227 在白底只有 2.6:1，做文字不达标。
   text-align: center 让两位数字与 GitHub 图标在同一 26px 槽位里对齐 */
.mobile-menu__no {
    flex: none;
    width: 26px;
    text-align: center;
    font-family: var(--font-num);
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: var(--brand-gold-dark);
}

/* GitHub 行的"序号位"放图标，尺寸略放大以对齐文字视觉重量 */
.mobile-menu__head--ext .mobile-menu__no {
    font-size: 0.95rem;
}

/* 主 CTA：与 Hero 的 .btn-large 同一套渐变 + 投影。
   它是固定页脚（nav 滚动、它不动），与列表之间留 0.75rem 分隔 */
.mobile-menu__cta {
    display: flex;
    align-items: center;
    justify-content: center;
    /* 与列表同宽同轴：列表收窄到 24rem 后，按钮若还占满整行，
       宽屏上会明显比列表宽出一截，看着像没对齐 */
    align-self: center;
    flex: none;
    width: 100%;
    max-width: 24rem;
    margin-top: 0.75rem;
    padding: 0.78rem 1.5rem;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    text-decoration: none;
    box-shadow: 0 8px 20px rgba(var(--brand-primary-rgb), 0.28);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.mobile-menu__cta:active {
    transform: translateY(0);
    box-shadow: 0 6px 14px rgba(var(--brand-primary-rgb), 0.28);
}

/* 悬停高亮只授给真正支持悬停的设备：触屏上点完 CTA :hover 会粘住
   （按钮一直保持上浮态），按压反馈交给 :active */
@media (hover: hover) and (pointer: fine) {
    .mobile-menu__cta:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 26px rgba(var(--brand-primary-rgb), 0.34);
    }
}

/* 个人主页：紧跟在 CTA 下方，两者组成固定页脚 */
.btn-primary svg {
    width: 16px;
    height: 16px;
    flex: none;
}

.mobile-menu__contact svg {
    width: 15px;
    height: 15px;
    flex: none;
}

.mobile-menu__contact {
    align-self: center;
    flex: none;
    margin-top: 0.85rem;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
    font-size: 0.85rem;
    text-decoration: none;
    transition: color 0.2s ease;
}

.mobile-menu__contact:active {
    color: var(--brand-primary-dark);
}

@media (hover: hover) and (pointer: fine) {
    .mobile-menu__contact:hover {
        color: var(--brand-primary-dark);
    }
}

/* 覆层滑入/滑出（translateY(-100%→0)） */
.menu-fade-enter-active,
.menu-fade-leave-active {
    transition: opacity 0.3s ease, transform 0.35s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.menu-fade-enter-from,
.menu-fade-leave-to {
    opacity: 0;
    transform: translateY(-100%);
}

/* ============ 通用工具类 · 图上压字遮罩（借鉴南师大 .banner .txt / .mask-bg） ============
   当 hero / CTA / 某卡片需要铺背景图并压白字时，在图片层之上盖一层自底向上的
   黑色渐隐，文字落在渐隐浓处保证对比度（白字对深底过 WCAG AA）。
   用法：容器加 .media-scrim 且内含背景图；需压字的元素加 .scrim-text 并贴底。
   当前页面无图上压字需求，此为标准解法预留，待上图时即用。 */
.media-scrim::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0) 60%);
    pointer-events: none;
}

.scrim-text {
    position: relative;
    z-index: 1;
    color: #fff;
}

/* ============ 键盘焦点 ============ */
/* 页面可交互元素统一 :focus-visible 焦点环（lang-btn 已有独立实现） */
.btn-primary:focus-visible,
.btn-large:focus-visible,
.btn-outline:focus-visible,
.github-pill:focus-visible,
.oss-support-btn:focus-visible,
.oss-repo-link:focus-visible,
.btn-cta:focus-visible,
.footer-links a:focus-visible {
    outline: 2px solid rgba(var(--brand-primary-rgb), 0.55);
    outline-offset: 2px;
}

/* ============ 响应式适配 ============ */
@media (max-width: 1024px) {
    /* 平板起中部放不下锚点组：隐藏（区块仍可正常滚动到达） */
    .nav-links {
        display: none;
    }

    /* 右簇四件套（汉堡 / Star / 语言 / 登录）各自 flex-shrink:0，
       在 375px 上合计已约 220px。原 .nav-actions 带 flex:1（可压缩），
       与 .brand 对半分配后品牌标题只剩几十像素；320px 下右簇甚至整体
       超出导航条，被 .landing-container 的 overflow-x:hidden 直接裁掉
       登录钮 —— 这是移动端"导航没适配"的直接原因。
       改为右簇不伸缩：剩余空间全归品牌区，标题以省略号收尾，
       四个控件在任何窄屏下都完整可见 */
    .nav-actions {
        flex: 0 0 auto;
    }

    .brand {
        flex: 1 1 auto;
    }

    /* 汉堡已是移动优先（默认显示，仅 >1024px 隐藏），此处无需再授 display；
       右侧轨道导航让位 */
    .section-orbit {
        display: none;
    }

    .features-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    /* 2 列下主卡整行 + 10 张普通卡恰满 5 行，取消孤卡居中 */
    .features-grid .feature-card:last-child {
        grid-column: auto;
    }

    /* 主卡在 2 列下不再跨 2 行（否则占满首屏顶部一整块），
       改为整行单列，读作"置顶推荐卡" */
    .feature-card--hero {
        grid-column: 1 / -1;
        grid-row: auto;
    }

    /* 主卡 2 列整行时：文案纵向不变，裸图仍贴右下、按原比适配 */
    .feature-card--hero {
        min-height: 360px;
    }

    .feature-card--hero p {
        max-width: 40ch;
        margin-bottom: 12rem;
    }

    .feature-hero-preview {
        position: absolute;
        right: 0;
        bottom: 0;
        width: min(66%, 480px);
        height: auto;
        overflow: hidden;
        /* 装饰性配图：不可选中、不可拖拽、不抢指针（与桌面端一致） */
        user-select: none;
        -webkit-user-select: none;
        -webkit-user-drag: none;
        pointer-events: none;
    }

    .feature-hero-preview__img {
        display: block;
        width: 100%;
        height: auto;
        object-fit: contain;
        /* 嵌入式裸图：无背景、无边框、无圆角、无阴影（与桌面端一致） */
        background: none;
        border: 0;
        border-radius: 0;
        box-shadow: none;
    }

    /* 四周白色渐变过渡（与桌面端一致）：以图片中心为圆心的圆形径向渐变，
       圆心透明、越往外越白，从四周柔化矩形硬边 */
    .feature-hero-preview::after {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: radial-gradient(
            circle at center,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0) 28%,
            var(--bg-primary) 88%
        );
    }
}

@media (max-width: 768px) {
    .landing-container {
        --landing-navbar-h: 64px;
    }

    .navbar-inner {
        padding: 0 1rem;
    }

    .brand-subtitle {
        display: none;
    }

    .nav-actions {
        gap: 8px;
    }

    /* 窄屏导航控件整体降一档，给右簇让出空间：
       徽牌 42→34（导航条本身也降到 64px，42 在里面偏挤）；
       品牌名 1.25→1.05rem；Star 胶囊内边距收到与 ≤480 一致的 10px；
       语言钮内边距从 6px 9px 收到 8px（触屏档的 40px 高度不变） */
    .brand-badge {
        width: 34px;
        height: 34px;
    }

    .brand-title {
        font-size: 1.05rem;
    }

    .nav-github {
        padding: 0 10px;
    }

    .lang-btn {
        padding: 0 8px;
    }

    /* 登录/注册：从"0.9rem + 0.6rem 内边距"的桌面尺寸收到与
       .nav-github / .nav-burger 同高的 34px 胶囊，字号降一档。
       高度锁 34px 是为了让右侧四个控件（汉堡 / Star / 语言 / 登录）
       在同一条基线上，否则 36.5px 的按钮会比旁边的胶囊高出一截 */
    .btn-primary {
        height: 34px;
        padding: 0 0.85rem;
        gap: 6px;
        font-size: 0.8rem;
        border-radius: 9px;
    }

    .lang-btn {
        padding: 5px 7px;
        font-size: 10px;
    }

    .hero-section {
        padding: 3rem 1rem 0;
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
        gap: 0.5rem 1rem;
    }

    .stat-item {
        width: 88px;
    }

    .stat-face {
        width: 76px;
        height: 76px;
    }

    .stat-value {
        font-size: 1.35rem;
    }

    .features-grid {
        grid-template-columns: 1fr;
        gap: 1rem;
    }

    .features-section {
        padding: 3rem 1rem 0;
    }

    /* 深结构适配：横向 padding 移到 .tech-inner */
    .tech-section {
        padding: 2.5rem 0 0;
    }

    .tech-inner {
        padding: 0 1rem;
    }

    /* 三栏在 736px 内容宽下每张只剩 ~230px，职责文案会被挤成窄条 ——
       窄屏改单列纵排，三张卡依次读作一条链路 */
    .tech-layers {
        grid-template-columns: 1fr;
        gap: 1rem;
    }

    .tech-layer {
        padding: 1.5rem 1.25rem 1.25rem;
    }

    .oss-section {
        padding: 2.5rem 1rem 0;
    }

    .cta-section {
        padding: 2.5rem 1rem 3rem;
    }

    .cta-card {
        padding: 2.5rem 1.5rem;
    }

    .cta-card h3 {
        font-size: 1.3rem;
    }

    .footer-inner {
        gap: 1.1rem;
    }

    .footer-meta {
        justify-content: center;
        text-align: center;
    }
}

@media (max-width: 480px) {
    /* 极窄屏导航条要同时塞下 汉堡 / Star / 语言 / 登录 四件套：
       "登录 / 注册" 连同图标约 105px，品牌名会被挤成一个省略号。
       这里退成与 .nav-github 同款的纯图标方钮（34×34），文案交给
       .btn-primary 上的 aria-label，读屏不受影响 */
    .btn-primary {
        width: 34px;
        padding: 0;
        gap: 0;
        justify-content: center;
    }

    .btn-primary-label {
        display: none;
    }

    /* 窄屏 Star 胶囊仅留图标，数字在 Hero/OSS 区已有展示位 */
    .nav-github {
        padding: 0 9px;
    }

    .nav-github-count {
        display: none;
    }

    .hero-stats {
        flex-wrap: wrap;
    }

    .stat-item {
        flex: 1 1 40%;
    }

    /* 两列棋盘排布时收窄错落幅度，避免右侧一整列明显下沉 */
    .stat-item:nth-child(even) {
        margin-top: 12px;
    }
}

/* ============ 超窄屏（≤380px：iPhone SE 一代 / 旧款安卓） ============
   320~380px 上右簇四件套 + 徽牌已占去 2/3 宽度，品牌名再缩一档、
   语言钮继续收紧，保证四件套完整可见 + 品牌名可读（超出以省略号收尾） */
@media (max-width: 380px) {
    .brand-title {
        font-size: 0.95rem;
        letter-spacing: 0;
    }

    .lang-btn {
        padding: 0 6px;
        font-size: 9.5px;
    }

    .navbar-inner {
        gap: 8px;
    }
}

/* ============ 触屏档（pointer: coarse，移动端基线） ============
 * 可点击目标 ≥40px，判据用触屏能力而非宽度断点（F12 拉窄 ≠ 真机）。
 * 窄屏媒体查询里同排四件套（汉堡 / Star / 语言 / 登录）为对齐基线锁了
 * 34px 高——那是视觉对齐的选择，不是触屏可达性的选择；本档把四件
 * 一起提到 40px，保持同高对齐不破坏基线设计。置于全部宽度断点之后，
 * 靠源序覆盖 ≤768px 的 34px 规则。 */
@media (pointer: coarse) {
    .nav-burger {
        width: 44px;
        height: 40px;
    }

    .nav-github {
        height: 40px;
    }

    .btn-primary {
        height: 40px;
    }

    /* 语言切换器整组 40px，内部按钮随 inline-flex 默认 stretch 拉满。
       内边距收到 8px：触屏档位于所有宽度断点之后，会覆盖 ≤768 的收紧值；
       10px 时「中文 / EN」两组在 375px 上要多占约 12px，直接挤压品牌名 */
    .lang-toggle {
        height: 40px;
        padding: 3px;
    }

    .lang-btn {
        /* 纵向必须撑满槽内区：原来这里只给了横向内边距（纵向为 0），
           按钮高度塌到只剩一行文字（约 10px），激活态看着像一条扁线。
           纵向用 align-self 拉满，横向留白给足并设最小宽度 —— 保证激活块
           "宽 > 高"，读起来是桌面端那颗胶囊，而不是一个圆点。 */
        align-self: stretch;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 46px;
        padding: 0 12px;
    }

    /* 桌面宽度触屏设备（横屏平板 ≥1025px）才显示的锚点组 */
    .nav-link {
        padding: 0.9rem 1rem;
    }

    /* 全屏菜单：子项行高提到 ≥44px，关闭钮 44px */
    .mobile-menu__sub-link {
        padding: 0.75rem 0;
    }

    .mobile-menu__close {
        width: 44px;
        height: 44px;
    }

    /* 轨道导航点放大一档（active 胶囊同步 +6px 保持比例）；
       纯辅助导航，主导航已由汉堡菜单承接 */
    .orbit-dot {
        width: 13px;
        height: 13px;
    }

    .orbit-dot.active {
        height: 30px;
    }

    /* 页脚文字链接：内边距撑出可点面积 */
    .footer-links a {
        padding: 8px 4px;
    }
}

/* 极窄触屏：登录钮在 ≤480px 是 34px 方形图标钮，此处放大到 40px 保持方形 */
@media (pointer: coarse) and (max-width: 480px) {
    .btn-primary {
        width: 40px;
    }

    .nav-github {
        padding: 0 11px;
    }

    /* 超窄触屏：只横向再收一档；font-size 不再往下压到 9.5px
       （真机上几乎看不清，且会让高亮块显得更扁） */
    .lang-btn {
        align-self: stretch;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 15px;
        font-size: 11px;
    }
}

/* ============ 窄屏页脚：四字中文链 2 字断行 ============
   原布局是一条硬挤的横排：四个四字中文链接 + 3 个"|"分隔符 + GitHub 胶囊，
   375px 上远超一行宽，flex 子项默认 shrink=1 把每个四字链接压成
   "3 字 + 折行"（如"隐私政/策"）。
   断行现在由文案自身完成：中文短语经 script cjkBreak 在每两字后插 \n，
   以 .cjk-break{white-space:pre-line} 渲染为断行（隐私政策 → 隐私/政策），
   断点不依赖盒宽测算；分隔符与图标全部原样保留，不做任何隐藏。本块只做三件事：
   · 链接簇允许换行、子项不再被挤压（flex-shrink: 0）—— 原 bug 的根；
   · 分隔符与两行链接块垂直居中（align-self: center）；
   · 纵向点按面积（padding 8px，与 pointer:coarse 块保持一致）。
   本块置于 pointer:coarse 块之后，同特异度下源序在后者胜。 */
/* 文案内嵌换行符（cjkBreak 生成）→ 视觉断行；宽屏文案无 \n，此规则为纯 no-op，
   故全局生效即可，无需包进媒体查询 */
.cjk-break {
    white-space: pre-line;
}
@media (max-width: 768px) {
    .footer-links {
        flex-wrap: wrap;
        justify-content: center;
        column-gap: 0.75rem;
        row-gap: 0.4rem;
    }

    /* 分隔符保留显示，与两行链接块垂直居中 */
    .footer-links .divider {
        align-self: center;
        color: var(--border-light);
    }

    /* 断行由文案内 \n（pre-line）完成；此处只保证不被挤压 + 点按面积 */
    .footer-links a {
        padding: 8px 4px;
        line-height: 1.5;
        flex-shrink: 0;
    }
}

/* 移动端同样用桌面端那套实心渐变胶囊：原来这里压成了"浅色底 + 内描边"，
   iOS 触屏又不满足 hover/pointer:fine，渐变那套样式压根没生效，
   于是选中态只剩一块扁平色斑，既不好看也看不出"选中"。
   外阴影把块面抬起来，触屏档的 40px 高度保持不变。 */
@media (max-width: 1024px) {
    .lang-btn.active {
        background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
        color: #fff;
        box-shadow: 0 2px 8px rgba(var(--brand-primary-rgb), 0.35);
    }

    .nav-link.active {
        background: rgba(var(--brand-primary-rgb), 0.1);
        color: var(--brand-primary-dark);
        transform: none;
    }
}
</style>
