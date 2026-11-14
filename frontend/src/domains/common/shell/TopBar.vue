<template>
    <div class="top-bar">
        <div class="branding">
            <a
                href="../index.html"
                class="logo-link"
            >
                <img
                    :src="faviconUrl"
                    alt="Icon"
                    class="logo-icon"
                />
                <span class="title-text">{{ t('topbar.slogan') }}</span>
            </a>
        </div>

        <div class="controls">
            <div
                ref="menuHostRef"
                class="menu-host"
            >
                <button
                    class="nav-btn"
                    :class="{ 'is-open': showToolMenu }"
                    :title="t('topbar.menuTitle')"
                    @click="toggleToolMenu"
                >
                    <span class="btn-icon">
                        <list-icon
                            :size="18"
                            :stroke-width="2"
                        />
                    </span>
                    <span class="btn-text">{{ t('topbar.menu') }}</span>
                </button>
                <div
                    v-if="showToolMenu"
                    class="floating-menu tools-menu"
                >
                    <div class="menu-header">
                        <span class="menu-header-title">{{ t('topbar.featureMenu') }}</span>
                    </div>
                    <div class="menu-body">
                        <!-- 主操作：全面板唯一的实底块 -->
                        <button
                            class="menu-item menu-primary"
                            @click="handleOpenToolbox"
                        >
                            <layers-icon
                                :size="16"
                                class="m-icon"
                            />
                            {{ t('topbar.layerManage') }}
                        </button>

                        <!-- 分析工具 -->
                        <div class="menu-section-title">{{ t('topbar.sectionTools') }}</div>
                        <div class="menu-grid-layout">
                            <button
                                class="menu-item"
                                @click="handleOpenCompass"
                            >
                                <compass-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                {{ t('topbar.compass') }}
                            </button>
                            <button
                                class="menu-item"
                                @click="handleOpenBuildings"
                            >
                                <building2-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                {{ t('topbar.buildings') }}
                            </button>
                        </div>

                        <!-- 路线规划 -->
                        <div class="menu-section-title">{{ t('topbar.sectionRoute') }}</div>
                        <div class="menu-grid-layout">
                            <button
                                class="menu-item"
                                @click="handleOpenBusPlanner"
                            >
                                <bus-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                {{ t('topbar.busPlanner') }}
                            </button>
                            <button
                                class="menu-item"
                                @click="handleOpenDrivePlanner"
                            >
                                <car-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                {{ t('topbar.drivePlanner') }}
                            </button>
                        </div>

                        <!-- 视图与调试：开关项，状态点表达开/关 -->
                        <div class="menu-section-title">{{ t('topbar.sectionView') }}</div>
                        <div class="menu-toggle-row">
                            <button
                                class="menu-toggle"
                                :class="{ 'is-on': isWeatherBoardMode }"
                                @click="handleToggleWeatherBoard"
                            >
                                <span class="toggle-dot"></span>
                                <component
                                    :is="isWeatherBoardMode ? MapIcon : CloudSunIcon"
                                    :size="15"
                                    class="m-icon"
                                />
                                <span class="menu-toggle-label">{{
                                    isWeatherBoardMode ? t('topbar.backToMap') : t('topbar.weatherBoard')
                                }}</span>
                            </button>
                            <button
                                class="menu-toggle"
                                :class="{ 'is-on': logMonitorVisible }"
                                @click="handleToggleLogMonitor"
                            >
                                <span class="toggle-dot"></span>
                                <activity-icon
                                    :size="15"
                                    class="m-icon"
                                />
                                <span class="menu-toggle-label">{{
                                    logMonitorVisible ? t('topbar.closeLogMonitor') : t('topbar.logMonitor')
                                }}</span>
                            </button>
                        </div>

                        <!-- 常用地点 -->
                        <div class="menu-section-title">{{ t('topbar.quickLocations') }}</div>
                        <div class="quick-loc-container">
                            <button
                                v-for="loc in quickLocations"
                                :key="loc.key"
                                class="menu-item menu-item-quick"
                                @click="handleJump(loc)"
                            >
                                <span class="menu-item-icon">
                                    <map-pin-icon :size="12" />
                                </span>
                                <span class="menu-item-label">{{ loc.label }}</span>
                            </button>
                        </div>

                        <!-- 彩蛋：与业务功能分开，只做趣味入口 -->
                        <button
                            class="menu-soup"
                            :title="t('topbar.soupTitle')"
                            @click="handleSoup"
                        >
                            <smile-icon :size="14" />
                            {{ t('topbar.soup') }}
                        </button>
                    </div>
                </div>
            </div>

            <button
                class="nav-btn"
                :title="t('topbar.shareTitle')"
                @click="handleShareView"
            >
                <span class="btn-icon">
                    <share-2-icon
                        :size="18"
                        :stroke-width="1.8"
                    />
                </span>
                <span class="btn-text">{{ t('topbar.share') }}</span>
            </button>

            <button
                class="nav-btn"
                :title="t('topbar.aiAssistant')"
                @click="handleOpenChat"
            >
                <span class="btn-icon">
                    <bot-icon
                        :size="20"
                        :stroke-width="2"
                    />
                </span>
                <span class="btn-text">{{ t('topbar.aiAssistant') }}</span>
            </button>

            <button
                class="nav-btn"
                :title="t('topbar.toggleViewTitle')"
                @click="handleToggle3D"
            >
                <span class="btn-icon">
                    <GlobeIcon
                        :size="18"
                        :stroke-width="2"
                    />
                </span>
                <span class="btn-text">
                    {{ is3DMode ? t('topbar.view2d') : t('topbar.view3d') }}
                </span>
            </button>

            <button
                class="nav-btn account-btn"
                :title="t('topbar.userCenterTitle')"
                @click="handleToggleAccountCenter"
            >
                <span class="btn-icon">
                    <user-icon
                        :size="18"
                        :stroke-width="2"
                    />
                </span>
                <span class="btn-text">{{ t('topbar.userCenter') }}</span>
            </button>

            <div
                ref="magicMenuHostRef"
                class="menu-host"
            >
                <button
                    class="nav-btn magic-btn"
                    :class="{ 'is-open': showMagicMenu }"
                    :title="t('topbar.magicEffectsTitle')"
                    @click="toggleMagicMenu"
                >
                    <span class="btn-icon">
                        <sparkles-icon
                            :size="18"
                            :stroke-width="2"
                        />
                    </span>
                    <span class="btn-text">{{ t('topbar.magicEffects') }}</span>
                </button>
                <div
                    v-if="showMagicMenu"
                    class="floating-menu magic-menu"
                >
                    <div class="menu-header">
                        <span class="menu-header-title">{{ t('topbar.magicEffects') }}</span>
                    </div>
                    <div class="menu-body">
                        <!-- 特效采用高效的 2 列网格 -->
                        <div class="magic-grid-layout">
                            <button
                                class="menu-item"
                                @click="handleActivateMagic('fluid')"
                            >
                                <wind-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                {{ t('topbar.fluid') }}
                            </button>
                            <button
                                class="menu-item"
                                @click="handleActivateMagic('gravity')"
                            >
                                <orbit-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                {{ t('topbar.gravity') }}
                            </button>
                            <button
                                class="menu-item"
                                @click="handleActivateMagic('void')"
                            >
                                <aperture-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                {{ t('topbar.void') }}
                            </button>
                            <button
                                class="menu-item"
                                @click="handleActivateMagic('wave')"
                            >
                                <waves-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                {{ t('topbar.wave') }}
                            </button>
                            <button
                                class="menu-item highlight-magic"
                                @click="handleActivateMagic('singularity')"
                            >
                                <circle-dot-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                {{ t('topbar.singularity') }}
                            </button>
                            <button
                                class="menu-item"
                                @click="handleActivateMagic('ring-explosion')"
                            >
                                <circle-icon
                                    :size="16"
                                    class="m-icon"
                                />
                                {{ t('topbar.ringExplosion') }}
                            </button>
                        </div>

                        <div class="menu-divider"></div>
                        <button
                            class="menu-item magic-close-btn"
                            @click="handleActivateMagic('off')"
                        >
                            <circle-x-icon
                                :size="16"
                                class="m-icon"
                            />
                            {{ t('topbar.closeEffects') }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>


<script lang="ts" src="./TopBar.ts"></script>

<style scoped>
/* ===================================================== */
/* TopBar 主题适配：所有颜色从 theme.css CSS 变量派生        */
/* 切换 [data-theme] 属性即可自动联动全部色彩                */
/* ===================================================== */

/* ---- 工具类 ---- */
.m-icon {
    margin-right: 8px;
    vertical-align: middle;
    /* 图标继承父元素颜色，配合 currentColor 实现主题联动 */
    color: inherit;
}

/* ==================== 顶部导航栏 ==================== */
.top-bar {
    width: 100%;
    height: 60px;
    padding: 0 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-sizing: border-box;
    position: relative;
    z-index: var(--z-modal);

    /* 收敛版：干净的品牌绿渐变基底 + 左上柔光，
       层次感全部交给 GIS 网格承担，不再叠加花哨滤镜 */
    background:
        radial-gradient(ellipse 60% 300% at 0% -80%,
            rgba(var(--brand-accent-light-rgb), 0.2) 0%, transparent 60%),
        linear-gradient(160deg,
            var(--brand-primary) 0%,
            var(--brand-primary-dark) 100%);
    border-bottom: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow:
        0 2px 10px rgba(0, 0, 0, 0.18),
        inset 0 1px 0 rgba(255, 255, 255, 0.2),
        inset 0 -1px 0 rgba(0, 0, 0, 0.15);
}

/* GIS 经纬网格（呼应 LandingView hero-bg__grid）：
   细网格 30px，每 5 格一条更亮的主网格线，向右渐隐避免干扰导航控件。
   z-index:-1 使其绘制在 .top-bar 背景之上、内容之下（CSS 绘制次序），
   无需给子元素提升层级，浮动菜单的堆叠行为不受影响 */
.top-bar::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background-image:
        linear-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.12) 1px, transparent 1px),
        linear-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.07) 1px, transparent 1px);
    background-size: 150px 150px, 150px 150px, 30px 30px, 30px 30px;
    mask-image: linear-gradient(96deg,
        rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.75) 50%, rgba(0, 0, 0, 0.5) 100%);
    -webkit-mask-image: linear-gradient(96deg,
        rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.75) 50%, rgba(0, 0, 0, 0.5) 100%);
}

.branding {
    flex-shrink: 0;
}

.logo-link {
    display: flex;
    align-items: center;
    text-decoration: none;
    color: var(--text-on-brand);
    gap: 12px;
}

.logo-icon {
    height: 40px;
    width: auto;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    transition: transform 0.3s;
}

.logo-link:hover .logo-icon {
    transform: rotate(-10deg) scale(1.1);
}

.title-text {
    font-family: 'Cinzel', 'Times New Roman', serif;
    font-size: 30px;
    font-weight: 700;
    letter-spacing: 1px;
    background: linear-gradient(to bottom, var(--text-on-brand), var(--border-light));
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* ==================== 导航按钮 ==================== */
.controls {
    display: flex;
    align-items: center;
    gap: 12px;
}

.btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: inherit;
    transition: transform 0.25s ease;
}

.btn-text {
    font-size: 16px;
    font-family:'Cinzel', 'Times New Roman', serif;
    font-weight: 600;
    letter-spacing: 0.3px;
}

.menu-host {
    position: relative;
}

/* 玻璃质感导航按钮：顶部内高光 + 细描边 + 下投影，与渐变网格 TopBar 同材质 */
.nav-btn {
    position: relative;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 16px;
    border-radius: 18px;
    cursor: pointer;
    font-size: var(--fs-md);
    color: rgba(255, 255, 255, 0.92);
    background: linear-gradient(180deg,
        rgba(255, 255, 255, 0.18) 0%,
        rgba(255, 255, 255, 0.07) 100%);
    border: 1px solid rgba(255, 255, 255, 0.22);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.28),
        0 2px 6px rgba(0, 0, 0, 0.18);
    transition:
        background 0.25s ease,
        border-color 0.25s ease,
        box-shadow 0.25s ease,
        transform 0.18s ease,
        color 0.25s ease;
    white-space: nowrap;
}

.nav-btn:hover {
    background: linear-gradient(180deg,
        rgba(255, 255, 255, 0.3) 0%,
        rgba(255, 255, 255, 0.14) 100%);
    border-color: rgba(255, 255, 255, 0.45);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.38),
        0 6px 14px rgba(0, 0, 0, 0.22);
    transform: translateY(-1px);
    color: #fff;
}

.nav-btn:hover .btn-icon {
    transform: scale(1.1);
}

.nav-btn:active {
    transform: translateY(0);
    box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.24);
}

.nav-btn:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.85);
    outline-offset: 2px;
}

/* 魔法特效：琥珀强调色，静态即带微光 */
.magic-btn {
    border-color: rgba(var(--warning-rgb), 0.35);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.28),
        0 2px 6px rgba(0, 0, 0, 0.18),
        0 0 10px rgba(var(--warning-rgb), 0.14);
}

.magic-btn:hover {
    background: linear-gradient(135deg,
        rgba(var(--warning-rgb), 0.3),
        rgba(var(--brand-accent-rgb), 0.2));
    border-color: rgba(var(--warning-rgb), 0.6);
    text-shadow: 0 0 10px rgba(var(--warning-rgb), 0.55);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.32),
        0 6px 14px rgba(0, 0, 0, 0.2),
        0 0 14px rgba(var(--warning-rgb), 0.3);
}

/* 用户中心：品牌强调色玻璃，与普通按钮区分层级 */
.account-btn {
    background: linear-gradient(180deg,
        rgba(var(--brand-accent-light-rgb), 0.32),
        rgba(var(--brand-accent-light-rgb), 0.14));
    border-color: rgba(var(--brand-accent-light-rgb), 0.45);
}

.account-btn:hover {
    background: linear-gradient(180deg,
        rgba(var(--brand-accent-light-rgb), 0.45),
        rgba(var(--brand-accent-light-rgb), 0.22));
    border-color: rgba(var(--brand-accent-light-rgb), 0.7);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.35),
        0 6px 14px color-mix(in srgb, var(--brand-accent) 35%, transparent);
    color: #fff;
}

/* 菜单展开态：按钮按压变实，与下方浮层视觉承接 */
.nav-btn.is-open,
.nav-btn.is-open:hover {
    background: rgba(255, 255, 255, 0.26);
    border-color: rgba(255, 255, 255, 0.5);
    box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.2);
    transform: none;
    color: #fff;
}

/* ===================================================== */
/* ===== 浮动菜单：参照 DrawPanel 风格 =================== */
/* ===================================================== */

.floating-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 12px);
    background: rgba(255, 255, 255, 0.96);
    border-radius: 12px;
    border: 1px solid rgba(229, 236, 230, 0.6);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    overflow: hidden;
    z-index: var(--z-modal-high);
    box-sizing: border-box;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    animation: menuSlideIn 0.2s ease-out;
}

@keyframes menuSlideIn {
    from {
        opacity: 0;
        transform: translateY(-4px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.floating-menu :deep(svg) {
    stroke: currentColor !important;
    transition: stroke 0.2s ease, transform 0.2s ease;
    margin-right: 8px;
}

/* 菜单宽度 */
.tools-menu { width: 280px; }
.magic-menu { width: 260px; }

/* ---- 品牌渐变顶栏（与 DrawPanel panel-header 一致） ---- */
.menu-header {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    background: var(--brand-gradient-header);
    color: white;
}

.menu-header-title {
    font-size: 13px;
    font-weight: 600;
}

/* ---- 菜单内容区 ---- */
.menu-body {
    padding: 10px;
}

/* ---- 2列网格 ---- */
.menu-grid-layout, .magic-grid-layout {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
}

/* ---- 菜单项 ----
   结构：主操作（实底宽块）→ 分组标题 + 2 列功能格 → 开关行 → 地点胶囊 → 彩蛋。
   层次靠「底色浓度 + 字重 + 宽度」三轴拉开，不靠描边。 */
.menu-item {
    width: 100%;
    border: none;
    text-align: left;
    background: transparent;
    border-radius: 8px;
    padding: 9px 10px;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    transition: background 0.2s, color 0.2s;
}

.menu-item:hover {
    background: rgba(var(--brand-primary-rgb), 0.08);
    color: var(--text-brand-dark);
}

/* 主操作：全宽实底块 —— 面板唯一的视觉重心 */
.menu-primary {
    padding: 12px;
    background: rgba(var(--brand-primary-rgb), 0.14);
    color: var(--brand-primary-dark);
    font-weight: 600;
}

.menu-primary:hover {
    background: rgba(var(--brand-primary-rgb), 0.2);
    color: var(--brand-primary-dark);
}

/* 分组标题：只负责归类和节奏，不参与竞争 */
.menu-section-title {
    padding: 12px 2px 5px;
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
}

.menu-item:hover :deep(svg) {
    transform: scale(1.08);
}

/* 开关行：与功能格换一个色系（中性灰），读作「另一组东西」。
   状态点常驻：关闭是空心环，开启是实心 + 外环光晕 —— 不必靠文字反推当前状态 */
.menu-toggle-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
}

.menu-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 9px 10px;
    border: none;
    border-radius: 8px;
    background: rgba(var(--shadow-rgb), 0.05);
    color: var(--text-secondary);
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
}

.menu-toggle:hover {
    background: rgba(var(--shadow-rgb), 0.09);
    color: var(--text-brand-dark);
}

.menu-toggle-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.menu-toggle :deep(svg) {
    flex: none;
    margin-right: 0;
}

.toggle-dot {
    width: 6px;
    height: 6px;
    flex: none;
    border-radius: 50%;
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--text-muted);
    transition: background 0.2s, box-shadow 0.2s;
}

.menu-toggle.is-on {
    background: rgba(var(--brand-primary-rgb), 0.1);
    color: var(--brand-primary-dark);
}

.menu-toggle.is-on .toggle-dot {
    background: var(--brand-primary);
    box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb), 0.18);
}

/* 彩蛋：与业务功能隔开，弱化成一条次要文字入口 */
.menu-soup {
    width: 100%;
    margin-top: 10px;
    padding: 8px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
}

.menu-soup:hover {
    background: rgba(var(--shadow-rgb), 0.06);
    color: var(--text-secondary);
}

/* ---- 常用地点 ---- */
.quick-loc-container {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    padding: 2px;
}

/* 最弱一级：最小号 + 最淡底，只作快捷入口，不与功能格争重量 */
.menu-item-quick {
    width: auto;
    padding: 4px 9px;
    background: rgba(var(--brand-primary-rgb), 0.06);
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 400;
    color: var(--text-secondary);
}

.menu-item-quick :deep(svg) {
    margin-right: 4px !important;
}

.menu-item-quick:hover {
    background: rgba(var(--brand-primary-rgb), 0.14);
    color: var(--text-brand-dark);
}

/* ---- 分割线（魔法菜单仍在用） ---- */
.menu-divider {
    height: 1px;
    margin: 8px 2px;
    background: var(--border-brand-light);
}

/* ---- 特效高亮项 ---- */
.highlight-magic {
    background: var(--bg-brand-light);
    border-color: var(--brand-accent);
    color: var(--brand-accent-dark);
    font-weight: bold;
}

.highlight-magic:hover {
    background: linear-gradient(135deg, rgba(var(--brand-accent-rgb), 0.1) 0%, var(--bg-active) 100%) !important;
    border-color: var(--brand-accent);
    color: var(--brand-accent-dark) !important;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--brand-accent) 25%, transparent);
}

/* ---- 特效关闭按钮 ---- */
.magic-close-btn {
    grid-column: span 2;
    justify-content: center;
    color: var(--danger);
    background: #fff0f0;
    border: none;
}

.magic-close-btn:hover {
    background: #ffe0e0 !important;
    border-color: #ffb0b0;
    color: var(--danger);
}

/* ==================== 移动端适配 ==================== */
@media (max-width: 768px) {
    .logo-icon {
        height: 30px;
    }

    .top-bar {
        padding: 0 10px;
    }

    .title-text {
        font-size: 16px;
    }

    .controls {
        gap: 3px;
    }

    .nav-btn {
        width: 36px;
        height: 36px;
        padding: 0;
        justify-content: center;
        border-radius: var(--radius-full);
    }

    .btn-text {
        display: none;
    }

    .btn-icon {
        font-size: 17px;
    }
    .logo-link {
        gap: 6px;
    }
}
</style>

