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
    /* 导航真实定高，Hero 的 100dvh 偏移由此派生，避免魔数不同步。
       72 → 64：无框控件不需要 72px 的托盘，收窄后页面更"贴顶"，
       也把首屏内容整体上提 8px */
    --landing-navbar-h: 64px;
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

/* ============ 顶部导航 ============
   设计基线（参考 Vercel / Stripe / Linear 的官网导航）：
   · 首屏不压白色板子 —— 导航透明，滚过 6px 才浮出玻璃底与发丝线；
   · 控件一律「无边框」：文字链 + 幽灵钮，边框只在 hover 时以极淡底色的形式出现；
   · 全条只有一颗实心按钮（登录/注册），避免两处绿色同时发光；
   · 圆角统一（6px 幽灵态 / 999px 主按钮），不再出现 8/9/10/999 四种混排。
   旧版把每个控件都做成带边框的胶囊/方块，颜色、圆角、高度三套并存，
   远看是一排"贴纸"——这是"方块感"的直接来源。 */
.navbar {
    position: sticky;
    top: 0;
    z-index: var(--z-float, 100);
    background: transparent;
    border-bottom: 1px solid transparent;
    /* 只过渡颜色/阴影/边框：backdrop-filter 参与过渡在 Safari 上会掉帧，单独给时长 */
    transition:
        background-color 0.28s ease,
        border-color 0.28s ease,
        box-shadow 0.28s ease;
    user-select: none;
    -webkit-user-select: none;
}

/* 滚过首屏：玻璃底 + 发丝线 + 一层极轻的投影（不是那种"卡片浮起"的重阴影） */
.navbar.is-scrolled {
    background: rgba(252, 253, 252, 0.82);
    border-bottom-color: rgba(20, 45, 25, 0.07);
    box-shadow: 0 10px 30px -22px rgba(20, 45, 25, 0.45);
    -webkit-backdrop-filter: saturate(1.5) blur(14px);
    backdrop-filter: saturate(1.5) blur(14px);
}

/* 原 P1#5 的「品牌绿→暖金 3px 封边线」已移除：
   ① 金色端在浅底上几乎不可见，视觉上像一条"断掉"的线；
   ② 全站已有渐变主按钮，再来一条彩条属重复强调；
   ③ 正是用户所指的"装饰感"来源。品牌色改由 logo + 主按钮承担。 */

.navbar-inner {
    max-width: 1200px;
    margin: 0 auto;
    height: var(--landing-navbar-h);
    padding: 0 clamp(1rem, 3vw, 2rem);
    /* grid 而非 flex：三列 minmax(0,1fr) auto minmax(0,1fr) 让中列
       在任何两侧内容宽度下都**精确居中**。旧版靠两侧 flex:1 平分剩余空间，
       一旦品牌区或操作区内容宽度不等，中列就会偏心（实测 1440 下右偏约 180px） */
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    column-gap: 1.5rem;
}

.brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    /* grid 第一列已由 minmax(0,1fr) 定宽，此处不再需要 flex:1 参与分配；
       min-width:0 让品牌名在极窄屏可省略号收尾而不是把整条撑破 */
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
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    background-color: var(--brand-primary-dark);
    /* mask-image 由行内样式 brandBadgeStyle 注入（见 script 注释），此处只配定位/重复/尺寸 */
    -webkit-mask-position: center;
    mask-position: center;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-size: contain;
    mask-size: contain;
    /* hover 效果改为「染色」而非「旋转」——
       见下方 :active / :hover 的说明，这里只保留颜色过渡 */
    transition: background-color 0.25s ease;
}

/* ⚠️ 这里原先是 transform: rotate(-10deg) scale(1.1)，在 iOS Safari 上会闪成黑块：
   WebKit 的合成缺陷 —— 被 mask 的图层一旦参与 transform（旋转或缩放），
   遮罩层会被整块栅格化成**纯黑**，于是徽牌变成一块黑方块。
   本项目在轨道环纹样上已踩过同一个坑并留下结论（见 composables/useRingPatternStyle.ts
   的注释：被遮罩图层处于持续 transform 中 → 遮罩整块栅格化成黑色）。
   结论：**mask 图层永不参与 transform**。交互反馈改用背景色深浅，
   视觉上等价（logo 由深绿提亮为品牌绿），但完全不碰合成路径。 */
.brand-badge:active {
    background-color: var(--brand-primary);
}

/* 悬停高亮只授给真正支持悬停的设备：触屏上点一下徽牌，:hover 会粘住
   （logo 一直保持高亮态，像卡在了交互中），按压反馈交给 :active */
@media (hover: hover) and (pointer: fine) {
    .brand-badge:hover {
        background-color: var(--brand-primary);
    }
}

.brand-text {
    min-width: 0;
}

.brand-title {
    font-family: 'Cinzel', 'Times New Roman', serif;
    margin: 0;
    font-size: 1.2625rem;
    font-weight: 650;
    /* 字色由品牌深绿改为正文色：徽牌（已染成品牌绿）与文字同为绿色是重复强调，
       全站只保留一处品牌绿 —— 主按钮。这也是 Vercel / Stripe / Linear 的共同做法：
       logo 带色、wordmark 用近黑，视觉更"稳"，不会一眼全是绿 */
    color: var(--text-primary);
    letter-spacing: -0.01em;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.brand-subtitle {
    margin: 1px 0 0;
    font-size: 0.6875rem;
    /* 副标题长达 48 字符（约 290px），是 1024~1200 下品牌名被压成
       "…Online WebGIS Platf…" 的直接原因。改为「宽屏专属」：
       默认隐藏，仅在 ≥1200px（导航容器满宽）时出现 */
    display: none;
    /* 不用 --text-muted(#999)：11px 下仅约 2.6:1，达不到 WCAG AA(4.5:1)；
       --text-secondary(#666) 约 5.7:1，仍是次要层级但可读 */
    color: var(--text-secondary);
    letter-spacing: 0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

@media (min-width: 1200px) {
    .brand-subtitle {
        display: block;
    }
}

/* 中部锚点导航：纯文字链，不做胶囊底色。
   Vercel / Stripe / Linear 的中部导航都是"一行字"：默认次级灰、hover 提亮、
   当前项加一条细下划线。底色胶囊会让三个词变成三个方块，是"贴纸感"的主因 */
.nav-links {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    justify-self: center;
}

.nav-link {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.875rem;
    /* 字重全程固定 500：旧版 active 切到 600 会改变字宽，
       切换小节时整组导航会左右抖一下（三个词的宽度同时变化） */
    font-weight: 500;
    line-height: 1.4;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
    /* 供 .nav-link::after 下划线定位 */
    position: relative;
    transition: color 0.16s ease, background-color 0.16s ease;
}

@media (hover: hover) and (pointer: fine) {
    .nav-link:hover {
        /* 只有极淡的底色，不描边、不变成胶囊 */
        background: rgba(20, 45, 25, 0.045);
        color: var(--text-primary);
    }
}

.nav-link:active {
    background: rgba(20, 45, 25, 0.07);
}

/* 当前小节：只靠「颜色 + 下划线」两件事，取消旧版的底色胶囊、
   scale(1.08) 与金色短横线三重叠加 —— 一个元素同时用三种手段强调，
   是典型的"过度设计"，扫视时反而不知道看哪里 */
.nav-link.active {
    color: var(--brand-primary-dark);
}

.nav-link::after {
    content: '';
    position: absolute;
    left: 0.75rem;
    right: 0.75rem;
    bottom: 1px;
    height: 2px;
    border-radius: 2px;
    background: var(--brand-gold);
    /* 用 transform 而非 width 做展开：不触发回流，且与文字等宽 */
    transform: scaleX(0);
    transform-origin: center;
    transition: transform 0.24s cubic-bezier(0.22, 0.7, 0.3, 1);
    pointer-events: none;
}

.nav-link.active::after {
    transform: scaleX(1);
}

.nav-actions {
    display: flex;
    align-items: center;
    /* 幽灵控件之间只需 4px：它们没有边框，视觉分隔靠字形留白而非间距；
       旧版 12px 是为"带框胶囊"之间留的空，无框后反而显得散 */
    gap: 4px;
    justify-self: end;
    min-width: 0;
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
    /* WebKit（iOS Safari）的 UA 样式表给 <button> 预置了 `align-items: center`，
       Chromium 没有。本按钮是纵向 flex、三条横线靠「交叉轴拉伸」撑满宽度，
       一旦 align-items 变成 center，三条 span 的宽度就退化为 0 —— 真机上整个
       汉堡塌成一个小点。这里显式声明 stretch，压掉 UA 的 center，
       与 Chromium 的默认表现对齐（横线的显式宽度见下方 span 规则，双保险）。 */
    align-items: stretch;
    gap: 4px;
    width: 36px;
    height: 36px;
    padding: 0 9px;
    /* 去掉边框与底色：汉堡是一个"图标"，不是一颗按钮方块。
       三条线本身就是形状，再套一层框是纯多余的装饰 */
    border: 0;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    flex-shrink: 0;
    transition: background-color 0.16s ease;
}

/* 桌面端才隐藏：与下方 ≤900 块的锚点组让位互补（901 起不重叠、无缝隙）。
   断点由 1025 下调到 901 的原因：品牌区去掉副标题后只剩约 194px，
   三条锚点 247px + 右簇 283px，合计 826px —— 900px 宽就放得下。
   旧版一律在 1024 收成汉堡，导致 1024 上中部空出一大片，
   品牌挤左、按钮挤右，看着像"没做完" */
@media (min-width: 901px) {
    .nav-burger {
        display: none;
    }
}

/* 按压反馈：触屏上没有真 hover，且 :hover 点完会粘住，所以悬停高亮只授给
   真正支持悬停的设备（见下方媒体查询），触屏用 :active 给出按下即应的反馈 */
.nav-burger:active {
    background: rgba(20, 45, 25, 0.08);
}

@media (hover: hover) and (pointer: fine) {
    .nav-burger:hover {
        background: rgba(20, 45, 25, 0.05);
    }
}

.nav-burger span {
    display: block;
    /* 显式给宽，不依赖父级 align-items: stretch —— 这是本按钮在 iOS 上塌成
       一个点的直接原因（三条横线宽度退化为 0）。参照 GitHub 标记的写法：
       图标能显示靠的是**显式固有尺寸**（`width="15" height="15"` 属性），
       而不是靠父级布局顺带撑开；这里的 span 同理，宽度必须自己写死。
       100% 解析为按钮内容宽（38 - 8×2 padding - 1×2 border = 20px）。 */
    width: 100%;
    height: 2px;
    /* 纵向不参与 flex 收缩：34px 高度里 3 条 2px 横线 + 2 个 4px 间距本不溢出，
       但显式 none 可避免任何引擎在缩放/字体放大时把 2px 压到 0 */
    flex: none;
    border-radius: 1px;
    /* 无框后横线是唯一形状，用正文色保证对比（旧版 --text-secondary 在
       去掉边框后显得发灰、像禁用态） */
    background: var(--text-primary);
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

/* GitHub Star 快捷入口：无边框幽灵钮，只在 hover 时浮出极淡底。
   旧版是一颗带 1px 边框的 999px 胶囊，与旁边的语言胶囊、登录按钮
   形成"三个贴纸并排"，是右簇显乱的主因 */
.nav-github {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 8px;
    border-radius: 6px;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1;
    flex-shrink: 0;
    transition: background-color 0.16s ease, color 0.16s ease;
}

.nav-github:active {
    background: rgba(20, 45, 25, 0.08);
    color: var(--text-primary);
}

/* 悬停高亮只授给真正支持悬停的设备：触屏上点开 Star 链接后 :hover 会粘住
   （从新标签页返回时按钮仍保持高亮态），按压反馈交给 :active */
@media (hover: hover) and (pointer: fine) {
    .nav-github:hover {
        background: rgba(20, 45, 25, 0.05);
        color: var(--text-primary);
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

/* 语言切换：一对纯文字，不做分段控件（segmented pill）。
   旧版是"外框胶囊 + 内部绿色实心块"，与右侧登录按钮形成**两颗绿色相邻**，
   视线不知道该落在哪个是主操作。改成文字后，当前语言只用品牌色 + 字重区分，
   整条导航只剩登录按钮一处实心色 */
.lang-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0;
    padding: 0;
    border-radius: 0;
    background: transparent;
    border: 0;
    flex-shrink: 0;
}

.lang-btn {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1;
    /* 纵向给足 30px 触达区，横向 7px：两个词之间靠留白分隔，不用竖线 */
    padding: 9px 7px;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.16s ease, color 0.16s ease;
}

.lang-btn:active {
    background: rgba(20, 45, 25, 0.08);
    color: var(--text-primary);
}

/* 悬停高亮只授给真正支持悬停的设备：触屏上点完语言钮，:hover 会粘在刚点的
   钮上，与 .active 的渐变态并存、看着像"两个都选中"；按压反馈交给 :active */
@media (hover: hover) and (pointer: fine) {
    .lang-btn:hover {
        background: rgba(20, 45, 25, 0.05);
        color: var(--text-primary);
    }
}

.lang-btn.active {
    /* 无底色、无渐变、无投影：只剩品牌色文字 */
    background: transparent;
    color: var(--brand-primary-dark);
    box-shadow: none;
}

.lang-btn:focus-visible {
    outline: 2px solid rgba(var(--brand-primary-rgb), 0.5);
    outline-offset: 1px;
}

.btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    /* 实心纯色，不用渐变：渐变在 36px 高度上根本看不出走向，只剩「颜色不匀」；
       也不加投影 —— 导航条上的按钮不需要「浮起来」 */
    background: var(--brand-primary);
    color: #fff;
    height: 36px;
    padding: 0 1.125rem;
    /* 全条唯一的胶囊：与幽灵态的 6px 圆角形成明确的主/次区分。
       旧版此处 10px、导航项 8px、汉堡 9px、胶囊 999px，四种圆角并存，
       属于「每个控件各写各的」 */
    border-radius: 999px;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.8125rem;
    letter-spacing: 0.01em;
    /* 与左侧幽灵控件留一道视觉分组，避免主按钮「粘」在语言切换上 */
    margin-left: 6px;
    transition: background-color 0.18s ease, transform 0.18s ease;
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
    background: var(--brand-primary-dark);
    transform: translateY(1px);
}

/* 悬停高亮只授给真正支持悬停的设备：触屏上点完登录钮 :hover 会粘住
   （按钮一直保持上浮态），按压反馈交给 :active */
@media (hover: hover) and (pointer: fine) {
    .btn-primary:hover {
        background: var(--brand-primary-dark);
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
    /* 首屏是展示型内容（标语 / 副标题 / 统计数字 / 出口按钮），拖选会在
       文字上拉出蓝色选区，破坏"产品界面"而非"网页文档"的手感。
       只关掉选区：文本仍在 DOM 与无障碍树中，SEO、读屏、划词翻译插件
       均不受影响；真需要复制某段时，给该元素单独写 user-select: text 即可。 */
    user-select: none;
    -webkit-user-select: none;
}

.hero-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    /* 跨页形变的锚：与注册页 .auth-decor 同名，浏览器据此把首屏装饰层
       形变到认证页（见 assets/theme.css 的 ::view-transition-* 规则） */
    view-transition-name: hero-decor;
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

/* 光晕自转已停用（原先 96s 一圈）。
   ⚠️ 原因与徽牌同源：本层带 -webkit-mask-image 径向遮罩，
   被遮罩图层一旦持续 transform 旋转，iOS Safari 会把遮罩整块栅格化成**黑色**，
   首屏就出现一个黑圆盘。视觉代价极小（96s 转一圈的 6% 透明度条纹，
   肉眼几乎无法察觉），换来的是 iOS 上不再有黑块。 */

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

   三环差异化：outer 虚线 130s 顺时针、mid 虚线 70s 逆时针、inner 虚线最淡
   140s 顺时针。反向 + 异速 + 深浅递进，才读得出是两套独立轨道。
   （原 outer/mid 各有一枚公转金点，2026-11-02 因 iOS 合成缺陷移除，见下方说明）

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
   589 裁出 padding-box。opacity 0.85，alpha 峰值 0.557 × 0.85 = 有效 0.473，
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
   偏进环内 7px）。空心 = 一段 1.5px 宽的环带：r 5.5→7 上色，其余透明。

   ⚠️ iOS：这一层是"整块透明 + 圆形裁剪 + 绕圆心自转"的纯装饰层，iOS Safari
   会把该层整块栅格化成黑色（详见 Architecture/ios-safari-rendering-pitfalls.md）。
   桌面端完全正常，因此**只在 ≤768px 隐藏**（见手机断点里的 display:none）。 */
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


/* 中环同样改虚线：正圆的实线边框旋转在视觉上等于静止（圆周完全对称）。
   公转点移除后，环线的虚线滑动是这一环唯一的运动线索，所以虚线必须保留。
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
   与 outer 的空心点配对，两者转速不同 —— 见下方 prefers-reduced-motion 段。
   iOS 下同样只在桌面显示（原因同 outer::after）。 */
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

    /* 差速公转（仅桌面）：点的实际角速度 = 环角速度 + 点自身角速度，
       outer 130s ⊕ 69s ≈ 45s、mid 70s ⊕ 62s ≈ 33s —— 盯两秒能看出点在环上滑动。
       手机断点里整层 display:none，因此这两条动画在 iOS 上不会执行。 */
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
      → 靠 0.75/0.65/0.4 的透明度分档补偿（图源与桌面同一张，移动端加强版
        已合并，见 useRingPatternStyle 的单图源说明）；三条边框同步加深。
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
    /* 纹样与桌面共用同一张图（移动端加强版已合并，见 useRingPatternStyle）。
       小屏的 alpha 峰值会被栅格化平均（0.502 → 0.220），故三环 opacity 各提
       一档（0.75 / 0.65 / 0.4），与边框加深一起维持三环层次。
       background-image 不在此声明：由 useRingPatternStyle 注入单条规则
       （相对 url() 必须由文档级样式表解析，原因见桌面纹样层块注释）。
       唯一的结构差异是**公转点在移动端不显示**，原因见下方。 */

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

    /* 公转点在移动端直接不显示：iOS Safari 会把「整块透明 + 圆形裁剪 +
       绕圆心自转」的纯装饰层整块渲染成黑色（真机验证）。display:none 之后
       该层不参与渲染，也就不会触发合成缺陷；桌面端不受影响，保留公转。
       详见 Architecture/ios-safari-rendering-pitfalls.md。 */
    .hero-bg__ring--outer::after,
    .hero-bg__ring--mid::after {
        display: none;
    }

    /* 三环纹样透明度分档（小屏 alpha 峰值被栅格化平均，故比桌面提一档） */
    .hero-bg__ring--outer::before {
        opacity: 0.75;
    }

    .hero-bg__ring--mid::before {
        opacity: 0.65;
    }

    .hero-bg__ring--inner::before {
        opacity: 0.4;
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
    /* 淡底已足够界定形状，再描一圈边就变成"贴纸" */
    border: 0;
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
    background: rgba(var(--brand-primary-rgb), 0.055);
    /* 同上：淡品牌底 + 无描边 */
    border: 0;
    color: var(--text-primary);
    font-size: 0.85rem;
    font-weight: 600;
    text-decoration: none;
    transition: background-color 0.2s ease, color 0.2s ease;
}

.github-pill svg {
    color: var(--brand-primary-dark);
}

.github-pill:hover {
    background: rgba(var(--brand-primary-rgb), 0.1);
    color: var(--brand-primary-dark);
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

    /* 徽牌只做染色过渡，减动效下直接取消即可（已无 transform 需要复位） */
    .brand-badge {
        transition: none;
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
    /* 次级按钮不再描边：白面 + 双层轻投影已经足够"像个按钮"，
       与旁边实心主按钮形成"实/浮"对比，而不是"实/框"对比 */
    border: 0;
    box-shadow:
        0 1px 2px rgba(20, 45, 25, 0.05),
        0 10px 22px -18px rgba(20, 45, 25, 0.55);
}

.btn-outline:hover {
    color: var(--brand-primary-dark);
    transform: translateY(-2px);
    box-shadow:
        0 2px 4px rgba(20, 45, 25, 0.06),
        0 18px 30px -20px rgba(20, 45, 25, 0.6);
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
    /* 圆币本身就是形状，描边是多余的；靠投影与底色区分 */
    border: 0;
    box-shadow: 0 4px 14px rgba(20, 45, 25, 0.07);
    transition: box-shadow 0.25s ease;
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
    /* 去描边：改由「白色面 + 极轻投影」与浅绿页面底拉开层次。
       白底 + 1px 灰边 + 统一圆角是"AI 生成卡片"最典型的三件套 ——
       页面里 11 张卡同时套这一层，整页就像一排同款贴纸。
       投影分两层：1px 接触阴影定边界，28px 大扩散只负责"浮起"，
       静态时几乎看不见，hover 才明显 —— 层次靠动效建立，不靠常驻描边 */
    background: var(--bg-primary);
    border: 0;
    border-radius: 16px;
    padding: 1.8rem 1.6rem;
    box-shadow:
        0 1px 2px rgba(20, 45, 25, 0.03),
        0 12px 28px -24px rgba(20, 45, 25, 0.5);
    transition: box-shadow 0.25s ease, transform 0.25s ease, background-color 0.25s ease;
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
    /* 无描边可改，hover 全靠"抬起 + 投影加深"表达；位移从 4px 收到 3px，
       配合更柔的阴影，读起来是"浮起"而不是"跳一下" */
    transform: translateY(-3px);
    box-shadow:
        0 1px 2px rgba(20, 45, 25, 0.04),
        0 22px 40px -26px rgba(20, 45, 25, 0.55);
}

.feature-card:hover::before {
    opacity: 1;
}

/* hover 掠光：与技术栈卡区分 ——
   .tech-layer::after 是"从左侧填充并停留"（scaleX 0→1），适合 3 张大卡的沉静感；
   功能卡有 11 张、更小更密，整片填充会显得笨重且雷同，改为一道 40% 宽的斜向掠光
   快速扫过（0.6s）后消失，不留终态。调色板与角度（100deg、品牌+金）保持同源，
   只是节奏更轻——同一族语汇，不同量级。 */
.feature-card::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 40%;
    background: linear-gradient(
        100deg,
        transparent 0%,
        rgba(var(--brand-primary-rgb), 0.06) 40%,
        rgba(var(--brand-gold-rgb), 0.1) 55%,
        transparent 100%
    );
    transform: translateX(-120%);
    opacity: 0;
    pointer-events: none;
}

.feature-card:hover::after {
    animation: feature-sheen 0.6s cubic-bezier(0.33, 0, 0.2, 1);
}

@keyframes feature-sheen {
    0% {
        transform: translateX(-120%);
        opacity: 0;
    }

    15%,
    85% {
        opacity: 1;
    }

    100% {
        transform: translateX(320%);
        opacity: 0;
    }
}

@media (prefers-reduced-motion: reduce) {
    .feature-card:hover::after {
        animation: none;
    }
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
    /* 淡品牌底已界定圆形，去掉 1px 描边 */
    border: 0;
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
    /* 与 .feature-card 同一套"无描边 + 双层轻投影"的表面语汇 */
    border: 0;
    box-shadow:
        0 1px 2px rgba(20, 45, 25, 0.03),
        0 12px 28px -24px rgba(20, 45, 25, 0.5);
    overflow: hidden;
    transition: box-shadow 0.25s ease, transform 0.25s ease;
}

/* 顶部渐显细线 + hover 抬升：与 .feature-card 同属一套卡片语汇。
   区别在扫光方式——技术栈卡是"左侧填充并停留"（承载链路叙事，节奏更沉），
   功能卡是"掠光扫过即散"（卡片更小更密，节奏更轻），二者共用调色板与 100deg 角度 */
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
    transform: translateY(-3px);
    box-shadow:
        0 1px 2px rgba(20, 45, 25, 0.04),
        0 22px 40px -26px rgba(20, 45, 25, 0.55);
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
    border: 0;
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
    /* 淡品牌底代替"白底 + 灰边"：徽标本身是弱信息，用一层很浅的色块
       就能标出"这是一个可扫读的词条"，再描边就变成一颗贴纸 */
    background: rgba(var(--brand-primary-rgb), 0.055);
    border: 0;
    color: var(--text-secondary);
    font-size: 0.85rem;
    font-weight: 600;
    transition: background-color 0.2s ease, color 0.2s ease;
}

.tech-badge svg,
.tech-badge i {
    color: var(--brand-primary);
}

.tech-badge:hover {
    background: rgba(var(--brand-primary-rgb), 0.1);
    color: var(--brand-primary-dark);
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
    /* 已有淡品牌底，边框属重复强调，去掉 */
    border: 0;
    background: rgba(var(--brand-primary-rgb), 0.05);
    transition: background-color 0.2s ease, color 0.2s ease;
}

.oss-repo-link:hover {
    color: var(--brand-primary-dark);
    background: rgba(var(--brand-primary-rgb), 0.1);
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
    /* 图表本身自带白底，去掉描边只留投影 */
    border: 0;
    background: #fff;
    box-shadow:
        0 1px 2px rgba(20, 45, 25, 0.03),
        0 16px 32px -26px rgba(20, 45, 25, 0.5);
    transition: box-shadow 0.25s ease, transform 0.25s ease;
}

.oss-chart-link:hover {
    transform: translateY(-2px);
    box-shadow:
        0 1px 2px rgba(20, 45, 25, 0.04),
        0 24px 40px -26px rgba(20, 45, 25, 0.55);
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
    /* 图片与说明同属一张卡，去掉中间那条分隔线 —— 卡本身已无描边，
       内部再画一条横线只会把一张卡切成两个方块 */
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
    border: 0;
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
    /* 与 .btn-outline 同款次级按钮：白面 + 轻投影，不描边 */
    border: 0;
    box-shadow:
        0 1px 2px rgba(20, 45, 25, 0.05),
        0 10px 22px -18px rgba(20, 45, 25, 0.55);
}

.oss-support-btn--fork:hover {
    color: var(--brand-primary-dark);
    transform: translateY(-2px);
    box-shadow:
        0 2px 4px rgba(20, 45, 25, 0.06),
        0 18px 30px -20px rgba(20, 45, 25, 0.6);
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
    /* 20px 大圆角 + 大扩散投影，去描边 —— 这是全页唯一的"大面板"，
       靠体量和投影与内容卡区分，不需要再画一圈边 */
    border: 0;
    color: var(--text-primary);
    overflow: hidden;
    box-shadow:
        0 1px 2px rgba(20, 45, 25, 0.03),
        0 30px 60px -40px rgba(20, 45, 25, 0.5);
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
    border: 0;
    background: rgba(var(--brand-primary-rgb), 0.055);
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
    /* 页脚社交圆钮：圆形本身已有形状，去掉描边改用淡品牌底 */
    border: 0;
    background: rgba(var(--brand-primary-rgb), 0.07);
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
    background: rgba(var(--brand-gold-rgb), 0.14);
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
    /* 去掉竖分隔线：同排数据靠 padding 的 28px 间距已足够分组，
       竖线属"表格化"装饰，与全页去边框一致 */
    padding: 0 14px;
}

.footer-visitor__value {
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
}

/* 更新时间：与指标同排但视觉权重再低一档（不抢数字），
   靠同一道竖线前缀维持「一行数据」的读法；数字用等宽数字避免宽度跳动 */
.footer-visitor__stamp {
    padding: 0 0 0 14px;
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
    /* 气泡靠投影与白底浮在页面之上，不描边 */
    border: 0;
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
    /* 四层背景按顺序：① 顶部绿光 ② 右下金光 ③④ 细网格。
       原先还有一层「绿→金 3px 封边」，与已删除的 .navbar::before 同款；
       导航条不再有这条彩带后，覆层若还留着就成了全站唯一的装饰横条 */
    background-image:
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
    background-size: auto, auto, 32px 32px, 32px 32px;
    background-position: 0 0, 0 0, 0 0, 0 0;
    background-repeat: no-repeat, no-repeat, repeat, repeat;
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

/* 关闭钮：与 .nav-burger 同尺寸的圆形按钮，浅底细边。
   SVG 采用 GitHub 式设置（块级渲染 + 显式尺寸 + 清除按钮内边距），
   避免 iOS 上文本字形基线导致的视觉偏移。 */
.mobile-menu__close {
    flex: none;
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgba(20, 45, 25, 0.05);
    color: var(--text-secondary);
    font-size: 0;
    line-height: 0;
    cursor: pointer;
    transition: color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
}

.mobile-menu__close svg {
    display: block;
    width: 18px;
    height: 18px;
    flex: none;
}

.mobile-menu__close:active {
    color: var(--brand-primary-dark);
    background: rgba(var(--brand-primary-rgb), 0.12);
}

/* 悬停高亮只授给真正支持悬停的设备：菜单覆层只在触屏出现，:hover 粘住会让
   关闭钮一直保持旋转 90° 的高亮态；按压反馈交给 :active */
@media (hover: hover) and (pointer: fine) {
    .mobile-menu__close:hover {
        color: var(--brand-primary-dark);
        background: rgba(var(--brand-primary-rgb), 0.09);
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
    display: flex;
    flex-direction: column;
    justify-content: safe center;
    /* flex 子项要能滚动，必须允许它缩到内容高度以下 */
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    width: 100%;
    max-width: 24rem;
    margin: 0 auto;
    padding: 0.75rem 0;
    /* 浅色纸面上别横插一道深槽 */
    scrollbar-width: thin;
}

.mobile-menu__list {
    margin: 0;
    padding: 0;
    list-style: none;
    width: 100%;
}

/* 分隔线去掉后，组与组之间靠这条间距建立节奏（原来靠 13 条 1px 横线） */
.mobile-menu__list > li + li {
    margin-top: 0.35rem;
}

/* 栏目行：序号 + 标题 + 箭头，箭头靠 margin-left: auto 推到最右，
   与南师大 `i.arrow` 的位置一致 */
.mobile-menu__head {
    appearance: none;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 0.72rem 0.5rem;
    border: 0;
    /* 去掉「每行一条 1px 分隔线」：13 行叠起来就是一张表格，
       这是移动端最明显的"边框方块感"。分组改由「行距 + 序号 + 子项缩进」表达 */
    background: transparent;
    color: var(--text-primary);
    border-radius: 10px;
    font-family: var(--font-serif);
    font-size: 1.08rem;
    font-weight: 700;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition: color 0.2s ease, background-color 0.2s ease;
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
    background: rgba(var(--brand-primary-rgb), 0.06);
}

.mobile-menu__head:active {
    color: var(--brand-primary-dark);
    background: rgba(var(--brand-primary-rgb), 0.08);
}

.mobile-menu__head.is-expanded .mobile-menu__arrow {
    color: var(--brand-primary-dark);
    transform: rotate(90deg);
}

/* 悬停高亮只授给真正支持悬停的设备：触屏上点开/收起栏目后 :hover 会粘在
   该行上（文字变色 + 箭头位移都留着，像始终处于悬停），按压反馈交给 :active */
@media (hover: hover) and (pointer: fine) {
    .mobile-menu__head:hover {
        color: var(--brand-primary-dark);
        background: rgba(var(--brand-primary-rgb), 0.05);
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
    padding: 0.2rem 0 0.55rem 38px;
    list-style: none;
    /* 无分隔线：子项与所属标题同属一组，靠左缩进与留白区分，
       不再在每组底部画一条横线 */
}

.mobile-menu__sub-link {
    appearance: none;
    display: block;
    width: 100%;
    padding: 0.24rem 0;
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
    /* 与导航栏主按钮同一套：999px 胶囊 + 纯色，不用渐变。
       旧版这里是 12px 圆角 + 135° 渐变 + 投影，是全页最后一处「渐变方块」，
       在手机上尤其突兀（移动端只看到它和列表，对比更强） */
    border-radius: 999px;
    background: var(--brand-primary);
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    text-decoration: none;
    box-shadow: 0 8px 20px -14px rgba(var(--brand-primary-rgb), 0.7);
    transition: background-color 0.2s ease, transform 0.2s ease;
}

.mobile-menu__cta:active {
    background: var(--brand-primary-dark);
    transform: translateY(1px);
    box-shadow: 0 4px 12px -10px rgba(var(--brand-primary-rgb), 0.7);
}

/* 悬停高亮只授给真正支持悬停的设备：触屏上点完 CTA :hover 会粘住
   （按钮一直保持上浮态），按压反馈交给 :active */
@media (hover: hover) and (pointer: fine) {
    .mobile-menu__cta:hover {
        background: var(--brand-primary-dark);
        transform: translateY(-2px);
        box-shadow: 0 12px 26px -16px rgba(var(--brand-primary-rgb), 0.75);
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
/* 901~1024 保留中部锚点组（实测合计 826px，放得下）；≤900 收成汉堡。
   ⚠️ 隐藏锚点组时必须同步把 grid 从三列收成两列：中列是 auto，
   导航项 display:none 后该列宽度归零，但 .nav-actions 会被自动排进第 2 列
   （中间），右侧控件就会跑到导航条正中 —— 三列模板与两列内容必须配套改 */
@media (max-width: 900px) {
    .nav-links {
        display: none;
    }

    .navbar-inner {
        grid-template-columns: minmax(0, 1fr) auto;
    }

    .nav-actions {
        min-width: 0;
    }

    /* 顺序：语言 → 登录 → 汉堡。主操作靠右但不贴边，汉堡居末是移动端通行做法
       （拇指回退成本最低）。汉堡在 DOM 里排第一，这里用 order 把它挪到最后，
       避免为了排序去改模板结构 */
    .btn-primary {
        order: 1;
    }

    .nav-burger {
        order: 2;
    }
}

@media (max-width: 1024px) {
    /* 右侧轨道导航让位（纯辅助，主导航已由锚点组/汉堡承接） */
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
        /* 56px：无框控件本身不需要 64px 的托盘高度，收窄后首屏内容上移，
           导航也不再像一条"横梁"压在页面上 */
        --landing-navbar-h: 56px;
    }

    .navbar-inner {
        padding: 0 1rem;
        column-gap: 0.75rem;
    }

    .nav-actions {
        gap: 2px;
    }

    /* 窄屏只保留「语言 / 登录 / 汉堡」三件，Star 钮收进全屏菜单
       （菜单里已有 GitHub 入口）。旧版把汉堡+Star+语言+登录四件全塞进
       390px，品牌名被压成 "NEG…"，这是移动端最刺眼的一处 */
    .nav-github {
        display: none;
    }

    .brand-badge {
        width: 30px;
        height: 30px;
    }

    .brand-title {
        font-size: 1rem;
    }

    .lang-btn {
        padding: 9px 6px;
        font-size: 0.6875rem;
    }

    /* 主按钮降到 34px 与其余控件同高；仍是全条唯一实心色块 */
    .btn-primary {
        height: 34px;
        padding: 0 0.9rem;
        gap: 6px;
        font-size: 0.8125rem;
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
    /* 极窄屏（≤480）主按钮退成 34×34 圆形图标钮：
       文案 "Sign in / Register" 约 105px，留着会把品牌名挤成一个省略号。
       圆形（999px）而非方钮 —— 全站唯一实心色块保持"胶囊家族"的形状，
       不在这里破例出现一个方块。文案交给 aria-label，读屏不受影响 */
    .btn-primary {
        width: 34px;
        padding: 0;
        gap: 0;
        justify-content: center;
    }

    .btn-primary-label {
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
   无框控件本身占位小，320~380px 下品牌名仍可完整显示；
   这里只把字再收一档，不再需要靠压缩控件内边距来腾地方 */
@media (max-width: 380px) {
    .brand-title {
        font-size: 1.1375rem;
        letter-spacing: -0.015em;
    }

    .navbar-inner {
        column-gap: 8px;
        padding: 0 0.75rem;
    }
}

/* ============ 触屏档（pointer: coarse，移动端基线） ============
 * 可点击目标 ≥40px，判据用触屏能力而非宽度断点（F12 拉窄 ≠ 真机）。
 * 无框控件靠"内边距"而不是"边框"撑出触达区，所以这里只调尺寸，不补边框。 */
@media (pointer: coarse) {
    .nav-burger {
        width: 40px;
        height: 40px;
        padding: 0 10px;
    }

    .nav-github {
        height: 40px;
        padding: 0 10px;
    }

    .btn-primary {
        height: 38px;
        padding: 0 1rem;
    }

    /* 语言切换：文字对只需保证 40px 触达高度。
       旧的 min-width:46 是为"绿色实心胶囊"留的宽度，文字态用不上，
       在 375px 上两个词会多占约 20px，直接挤压品牌名 */
    .lang-toggle {
        height: 40px;
        padding: 0;
    }

    .lang-btn {
        align-self: stretch;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 34px;
        padding: 0 8px;
        font-size: 0.75rem;
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

    .mobile-menu__close svg {
        width: 20px;
        height: 20px;
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

/* 极窄触屏：登录钮在 ≤480px 是 34px 圆形图标钮，触屏档放大到 40px 保持正圆 */
@media (pointer: coarse) and (max-width: 480px) {
    .btn-primary {
        width: 40px;
        height: 40px;
        padding: 0;
    }

    /* 超窄触屏语言钮：横向收到 7px（无边框后不需要 15px 的"胶囊内衬"），
       字号不再往下压到 9.5px（真机上几乎看不清） */
    .lang-btn {
        align-self: stretch;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 30px;
        padding: 0 7px;
        font-size: 0.6875rem;
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

/* 原「≤1024px 语言钮改回实心渐变胶囊 / 导航项补底色胶囊」的覆盖块已删除：
   那是为旧版"胶囊 + 渐变"体系打的补丁，在无框文字体系下会把语言钮变回
   一颗绿色实心块，与右侧登录按钮形成两颗绿色相邻 —— 正是本次要消除的问题。
   现在 .lang-btn.active 全宽度统一为"品牌色文字"，不再按断点分叉。 */
</style>

