<template>
    <div
        ref="landingEl"
        class="landing-container"
    >
        <!-- ============ 顶部导航 ============ -->
        <!-- is-scrolled：首屏时导航完全透明（不做白色板子），滚过 6px 才浮出玻璃底。
             现代官网（Vercel / Stripe / Linear）都用这一手，目的是让导航"融进"首屏，
             而不是在内容上方压一条实心横条 —— 后者正是"方块感"的最大来源 -->
        <header
            class="navbar"
            :class="{ 'is-scrolled': navScrolled }"
        >
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
                        :href="githubPageUrl"
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
                                :d="githubMarkPath"
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
                    <!-- aria-label 兜底：≤480px 时 .btn-primary-label 被隐藏、
                         按钮只剩 LogIn 图标，读屏仍能拿到完整文案
                         （与 .nav-github 隐藏 .nav-github-count 同一套处理） -->
                    <a
                        href="#/register"
                        class="btn-primary"
                        :aria-label="t('landing.navLogin')"
                        @pointerenter="warmRegisterOnIntent"
                        @focusin="warmRegisterOnIntent"
                        @touchstart.passive="warmRegisterOnIntent"
                        @click="onRegisterClick"
                    >
                        <LogIn :size="16" />
                        <span class="btn-primary-label">{{ t('landing.navLogin') }}</span>
                    </a>
                </div>
            </div>
        </header>

        <!-- ============ Hero 区域 ============ -->
        <main class="content">
            <section class="hero-section">
                <div
                    ref="heroBgEl"
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

                    <div
                        class="hero-actions"
                        @mouseenter="heroSpin.start()"
                        @mouseleave="heroSpin.stop()"
                        @focusin="heroSpin.start()"
                        @focusout="heroSpin.stop()"
                    >
                        <a
                            href="#/register"
                            class="btn-large"
                            @pointerenter="warmRegisterOnIntent"
                            @focusin="warmRegisterOnIntent"
                            @touchstart.passive="warmRegisterOnIntent"
                            @click="onRegisterClick"
                        >
                            <Rocket :size="18" />
                            {{ t('landing.tryNow') }}
                        </a>
                        <a
                            :href="githubPageUrl"
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
                                    :d="githubMarkPath"
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
                            :href="githubPageUrl"
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
                            :href="`${githubPageUrl}/fork`"
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
                                fetchpriority="high"
                                decoding="async"
                                width="1996"
                                height="769"
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
                            :href="githubPageUrl"
                            target="_blank"
                            rel="noopener"
                            class="oss-support-btn oss-support-btn--star"
                        >
                            <Star :size="16" />
                            {{ t('landing.ossStarBtn') }}
                            <span class="oss-support-btn-value">{{ formattedStars }}</span>
                        </a>
                        <a
                            :href="`${githubPageUrl}/fork`"
                            target="_blank"
                            rel="noopener"
                            class="oss-support-btn oss-support-btn--fork"
                        >
                            <GitFork :size="16" />
                            {{ t('landing.ossForkBtn') }}
                            <span class="oss-support-btn-value">{{ formattedForks }}</span>
                        </a>
                        <a
                            :href="githubPageUrl"
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
                    :href="starHistoryPageUrl"
                    target="_blank"
                    rel="noopener"
                    class="oss-chart-link"
                >
                    <img
                        :src="starChartSrc"
                        :alt="t('landing.ossChartAlt')"
                        width="800"
                        height="450"
                        loading="lazy"
                        decoding="async"
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
                        ref="ctaBgEl"
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
                    <a
                        href="#/register"
                        class="btn-cta"
                        @mouseenter="ctaSpin.start()"
                        @mouseleave="ctaSpin.stop()"
                        @focus="ctaSpin.start()"
                        @blur="ctaSpin.stop()"
                        @pointerenter="warmRegisterOnIntent"
                        @focusin="warmRegisterOnIntent"
                        @touchstart.passive="warmRegisterOnIntent"
                        @click="onRegisterClick"
                    >
                        <Send :size="16" />
                            {{ t('landing.getStarted') }}
                    </a>
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
                            :d="githubMarkPath"
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
                                :href="githubPageUrl"
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
                                        :d="githubMarkPath"
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
                    >
                        <X
                            :size="18"
                            :stroke-width="2"
                            aria-hidden="true"
                        />
                    </button>
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
                                :class="{ 'is-expanded': group.children.length > 0 && expandedMobileMenuGroups.has(group.id) }"
                                :aria-expanded="group.children.length > 0 ? expandedMobileMenuGroups.has(group.id) : undefined"
                                :aria-controls="group.children.length > 0 ? `mobile-menu-sub-${group.id}` : undefined"
                                @click="handleMobileMenuHead(group)"
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
                                v-if="group.children.length && expandedMobileMenuGroups.has(group.id)"
                                :id="`mobile-menu-sub-${group.id}`"
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
                                :href="githubPageUrl"
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
                                            :d="githubMarkPath"
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


<script lang="ts" src="./LandingView.ts"></script>

<style scoped lang="scss" src="./styles/LandingView.scss"></style>

