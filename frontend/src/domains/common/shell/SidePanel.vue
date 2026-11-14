<template>
    <!-- 外壳：负责布局与折叠手柄溢出，不裁切 -->
    <div
        class="info-panel-shell"
        :class="{
            collapsed: isCollapsed,
            'in-dihuan': locationInfo.isInDihuan,
            'is-revealing': revealing,
        }"
    >
        <!-- 折叠开关（放在 shell 上，可伸出面板） -->
        <div
            class="toggle-handle"
            :title="isCollapsed ? t('shell.expandPanel') : t('shell.collapsePanel')"
            @click="$emit('toggle-panel')"
        >
            <!-- 只用一个向左的箭头，通过动态 class 控制旋转 -->
            <svg
                class="handle-icon"
                :class="{ 'is-flipped': !isCollapsed }"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M11 19l-7-7 7-7"
                />
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 19l-7-7 7-7"
                />
            </svg>
        </div>

        <!-- 内层：overflow hidden + border-radius，子元素背景被圆角裁切 -->
        <div
            v-show="!isCollapsed"
            class="info-panel"
        >
        <!-- 面板内容区域 -->
        <div
            class="panel-content"
            :class="{
                'no-padding':
                    activeTab === 'chat' ||
                    activeTab === 'toolbox' ||
                    activeTab === 'bus' ||
                    activeTab === 'drive' ||
                    activeTab === 'compass' ||
                    activeTab === 'buildings' ||
                    activeTab === 'info',
            }"
        >
            <div
                v-if="activeFeature?.label && activeTab !== 'info'"
                class="active-feature-banner"
            >
                {{ t('shell.activeFeature', { label: activeFeature.label }) }}
            </div>

            <!-- 模式 1: AI 聊天 -->
            <div
                v-show="activeTab === 'chat'"
                class="toolbox-content"
            >
                <ChatPanelContent
                    v-if="loadedTabs.has('chat')"
                    :active-tab="activeTab"
                    @close-chat="$emit('close-chat')"
                />
            </div>

            <!-- 模式 2: 工具箱 -->
            <div
                v-show="activeTab === 'toolbox'"
                class="toolbox-content"
            >
                <ToolboxPanel
                    v-if="loadedTabs.has('toolbox')"
                    :user-layers="userLayers"
                    :base-layers="baseLayers"
                    :overview="toolboxOverview"
                    :default-tab="toolboxTab"
                    :upload-progress="uploadProgress"
                    :latest-search-poi="latestSearchPoi"
                    :active-engine="activeEngine"
                    @close="$emit('switch-tab', 'info')"
                    @upload-data="$emit('upload-data', $event)"
                    @interaction="$emit('interaction', $event)"
                    @toggle-layer-visibility="$emit('toggle-layer-visibility', $event)"
                    @change-layer-opacity="$emit('change-layer-opacity', $event)"
                    @toggle-layer-label-visibility="$emit('toggle-layer-label-visibility', $event)"
                    @zoom-layer="$emit('zoom-layer', $event)"
                    @view-layer="$emit('view-layer', $event)"
                    @remove-layer="$emit('remove-layer', $event)"
                    @edit-layer="$emit('edit-layer', $event)"
                    @reorder-user-layers="$emit('reorder-user-layers', $event)"
                    @solo-layer="$emit('solo-layer', $event)"
                    @apply-style-template="$emit('apply-style-template', $event)"
                    @update-draw-style="$emit('update-draw-style', $event)"
                    @update-layer-style="$emit('update-layer-style', $event)"
                    @update-cesium-layer-style="$emit('update-cesium-layer-style', $event)"
                    @highlight-attribute-feature="$emit('highlight-attribute-feature', $event)"
                    @zoom-attribute-feature="$emit('zoom-attribute-feature', $event)"
                    @draw-point-by-coordinates="$emit('draw-point-by-coordinates', $event)"
                    @draw-amap-aoi-from-json="$emit('draw-amap-aoi-from-json', $event)"
                    @toggle-layer-crs="$emit('toggle-layer-crs', $event)"
                    @export-layer-data="$emit('export-layer-data', $event)"
                    @import-to-3d="$emit('import-to-3d', $event)"
                    @rename-layer="$emit('rename-layer', $event)"
                    @layer-selected="$emit('layer-selected', $event)"
                />
            </div>

            <!-- 模式 3: 公交规划 -->
            <div
                v-show="activeTab === 'bus'"
                class="toolbox-content"
            >
                <RoutePlannerPanel
                    v-if="loadedTabs.has('bus')"
                    mode="bus"
                    :token="tiandituToken"
                    :start-point-pick="startBusPointPick"
                    :draw-route-on-map="drawRouteOnMap"
                    :zoom-to-bus-route-step="zoomToBusRouteStep"
                    :preview-bus-route-step="previewBusRouteStep"
                    :clear-bus-route-step-preview="clearBusRouteStepPreview"
                    @close="$emit('switch-tab', 'info')"
                />
            </div>

            <!-- 模式 4: 驾车规划 -->
            <div
                v-show="activeTab === 'drive'"
                class="toolbox-content"
            >
                <RoutePlannerPanel
                    v-if="loadedTabs.has('drive')"
                    mode="drive"
                    :token="tiandituToken"
                    :start-point-pick="startBusPointPick"
                    :draw-drive-route-on-map="drawDriveRouteOnMap"
                    :zoom-to-drive-route-step="zoomToDriveRouteStep"
                    :preview-drive-route-step="previewDriveRouteStep"
                    :clear-drive-route-step-preview="clearDriveRouteStepPreview"
                    @close="$emit('switch-tab', 'info')"
                />
            </div>

            <!-- 模式 5: 风水罗盘 -->
            <div
                v-show="activeTab === 'compass'"
                class="toolbox-content"
            >
                <CompassControlPanel
                    v-if="loadedTabs.has('compass')"
                    :get-user-location="getUserLocation"
                    @close="$emit('switch-tab', 'info')"
                />
            </div>

            <!-- 模式 6: 腾讯建筑白模抓取 -->
            <div
                v-show="activeTab === 'buildings'"
                class="toolbox-content"
            >
                <TencentBuildingPanel
                    v-if="loadedTabs.has('buildings')"
                    :get-cesium-viewer="getCesiumViewer"
                    :get-cesium="getCesiumNamespace"
                    :active-engine="activeEngine"
                    @upload-data="$emit('upload-data', $event)"
                    @close="$emit('switch-tab', 'info')"
                />
            </div>

            <!-- 模式 7: 天气看板 -->
            <div
                v-show="activeTab === 'weather'"
                class="toolbox-content weather-tab-content"
            >
                <WeatherChartPanel v-if="loadedTabs.has('weather') && shouldLoadWeather" />
            </div>

            <!-- 模式 8: 热点新闻 -->
            <div
                v-show="activeTab === 'info'"
                class="news-dashboard"
            >
                <div class="news-header-bar">
                    <span class="news-logo">Hot News</span>
                    <span class="news-subtitle">{{ t('shell.newsSubtitle', { platform: currentPlatformLabel }) }}</span>
                </div>

                <!-- 平台标签 -->
                <div class="news-platform-tabs">
                    <button
                        v-for="p in newsPlatforms"
                        :key="p.key"
                        class="platform-chip"
                        :class="{ active: currentPlatform === p.key }"
                        @click="switchNewsPlatform(p.key)"
                    >
                        {{ p.label }}
                    </button>
                </div>

                <!-- 加载状态 -->
                <div
                    v-if="newsLoading"
                    class="news-loading"
                >
                    <div class="loading-dot-pulse"></div>
                    <span>{{ t('shell.loadingNews') }}</span>
                </div>

                <!-- 新闻列表 -->
                <div
                    v-else
                    class="news-list"
                >
                    <a
                        v-for="(item, idx) in newsItems"
                        :key="idx"
                        :href="item.url"
                        target="_blank"
                        class="news-card"
                    >
                        <div
                            class="news-rank"
                            :class="rankClass(idx)"
                        >
                            {{ idx + 1 }}
                        </div>
                        <div class="news-body">
                            <div class="news-title">{{ item.title }}</div>
                            <div
                                v-if="item.desc || item.content"
                                class="news-meta"
                            >
                                <span class="news-desc">{{ item.desc || item.content }}</span>
                            </div>
                        </div>
                        <div
                            v-if="item.score || item.publish_time"
                            class="news-score"
                        >
                            <span class="score-value">{{
                                item.publish_time
                                    ? item.publish_time.slice(-8)
                                    : formatScore(item.score)
                            }}</span>
                        </div>
                    </a>
                    <div
                        v-if="!newsItems.length && !newsLoading"
                        class="news-empty"
                    >
                        {{ t('shell.noNews') }}
                    </div>
                </div>

                <!-- 访问统计 -->
                <!-- <div
                    style="
                        height: 20px;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                    "
                >
                    <img
                        src="https://visitor-badge.laobi.icu/badge?page_id=negiao.webgis"
                        alt="visitor badge"
                        loading="lazy"
                        decoding="async"
                    />
                </div> -->

                <div class="news-footer">
                    <span
                        class="footer-status"
                        :class="{ live: !newsLoading }"
                    >
                        <span class="status-dot"></span>
                        {{ newsLoading ? t('shell.newsLoading') : t('shell.newsUpdated', { time: lastNewsUpdate }) }}
                    </span>
                </div>
            </div>
        </div>
    </div>
</div>
</template>


<script lang="ts" src="./SidePanel.ts"></script>

<style scoped>
/* 外壳：允许折叠手柄溢出，本身不做圆角裁切 */
.info-panel-shell {
    position: relative;
    display: flex;
    flex-direction: row;
    width: 100%;
    height: 100%;
    overflow: visible;
}

/* 内层面板：overflow hidden 让子元素背景被 border-radius 裁切 */
.info-panel {
    position: relative;
    display: flex;
    flex-direction: row;
    flex: 1;
    min-width: 0;
    height: 100%;
    background: var(--bg-primary);
    overflow: hidden;
    /* 去「单层中性黑」：接触层贴边定界，负扩散层只向右溢出，
       读作「浮在地图之上」而不是「一块被投影糊过的白板」。
       色调走 --shadow-rgb，切蓝主题自动换调（原 2px 0 8px rgba(0,0,0,.1)） */
    box-shadow:
        1px 0 2px rgba(var(--shadow-rgb), 0.05),
        10px 0 28px -16px rgba(var(--shadow-rgb), 0.4);
    transition: width 0.3s ease;
    /* 简写顺序：左上 右上 右下 左下 */
    border-radius: 16px 0 0 16px;
}

/* 展开扫光：沿面板宽度从左扫过一道品牌 + 金的低透水洗。
   与落地页卡片的 hover 掠光同一套语汇，但这里是"面板出现"的一次性提示。
   不用 View Transitions 的原因：面板宽度由 sidePanelRatio 与懒加载共同驱动，
   尺寸会异步落定，整页快照会与这种延迟打架（实测宽度滞留约 1s）；
   CSS 扫光只动 transform/opacity，不参与布局，不受影响。 */
.info-panel::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(
        100deg,
        transparent 0%,
        rgba(var(--brand-primary-rgb), 0.1) 45%,
        rgba(var(--brand-gold-rgb), 0.12) 55%,
        transparent 100%
    );
    transform: translateX(-100%);
    opacity: 0;
    pointer-events: none;
}

.info-panel-shell.is-revealing .info-panel::after {
    animation: panel-sheen 560ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

@keyframes panel-sheen {
    0% {
        transform: translateX(-100%);
        opacity: 0;
    }

    12%,
    70% {
        opacity: 1;
    }

    100% {
        transform: translateX(100%);
        opacity: 0;
    }
}

@media (prefers-reduced-motion: reduce) {
    .info-panel-shell.is-revealing .info-panel::after {
        animation: none;
    }
}

/* 折叠手柄 */
.toggle-handle {
    width: 30px;
    height: 60px;
    align-self: center;
    background: var(--bg-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 12px 0 0 12px;
    /* 手柄是从面板「长出来」的一截，不是独立贴纸：给它向左溢出的轻投影，
       视觉上与面板连成一体。过渡只列实际变化的属性（原 all 会把尺寸也纳入过渡） */
    box-shadow:
        -1px 0 2px rgba(var(--shadow-rgb), 0.05),
        -6px 0 16px -12px rgba(var(--shadow-rgb), 0.45);
    transition: background-color 0.2s ease, box-shadow 0.2s ease;
    /* 原为 --z-toast(9999)：折叠手柄会压在所有模态/弹层之上，属层级误用。
       按 theme.css 的分层约定，地图浮层用 --z-float */
    z-index: var(--z-float);

    /* 相对 shell 定位，伸出面板左侧 */
    position: absolute;
    left: -30px;
    top: 50%;
    transform: translateY(-50%);
}

.toggle-handle:hover {
    background: var(--brand-accent-dark);
    /* 原 hover 里还写着 width: 30px —— 与常态同值，是条无效规则，已删。
       悬停时投影同步加深，读作「被按住而非被染色」 */
    box-shadow:
        -1px 0 2px rgba(var(--shadow-rgb), 0.08),
        -8px 0 20px -12px rgba(var(--shadow-rgb), 0.55);
}

.handle-icon {
    font-size: 12px;
    color: var(--brand-accent);
    font-weight: bold;
    width: 20px;
    height: 20px;
    /* 增加平滑的过渡动画 */
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s ease;
}

/* 悬停时底色换成深绿，绿图标压深绿仅约 2.9:1（低于 UI 组件 3:1 下限），
   故图标同步转白；这是「状态承载可读性」而非装饰 */
.toggle-handle:hover .handle-icon {
    color: #fff;
}

.handle-icon.is-flipped {
    transform: rotate(180deg);
}

/* 内容区域 */
.panel-content {
    flex: 1;
    /* padding: 20px;  Removed: Moved to .info-content */
    /* overflow-y: auto; Removed: Moved to .info-content */
    display: flex;
    flex-direction: column;
    min-width: 300px;
    height: 100%;
    overflow: hidden;
}

/* 原为 linear-gradient(30deg, rgba(235,222,222,0) → --brand-accent)：
   起点带一截暖粉灰（与绿色主题无关），终点是品牌绿，而文字用深绿 ——
   绿底绿字对比仅约 2:1，属可读性缺陷。改为淡品牌底 + 深绿字（约 4.9:1），
   同时落实「纯装饰性色带一律移除」的纪律 */
.active-feature-banner {
    padding: 8px 14px;
    background: rgba(var(--brand-primary-rgb), 0.08);
    color: var(--brand-primary-dark);
    font-size: var(--fs-sm);
    font-weight: 600;
}

.toolbox-content {
    flex: 1;
    overflow-y: auto;
    background: var(--bg-primary);
}

.panel-content.no-padding {
    padding: 0;
}

/* 移动端适配 */
@media (max-width: 768px) {
    .info-panel-shell {
        display: flex;
        flex-direction: column;
        width: 100% !important;
        height: 60vh;
        transition: transform 0.3s ease;
        overflow: visible;
        position: fixed;
        bottom: 0;
        left: 0;
    }

    /* .panel-content 基准 min-width: 300px 在窄屏抽屉内会撑出横向溢出，
       触发 iOS Safari 整页缩小（F12 模拟不复现）。移动端清零。 */
    .panel-content {
        min-width: 0;
    }

    /* 收起状态下的处理：将整个面板向下推 */
    .info-panel-shell.collapsed {
        transform: translateY(100%);
    }

    .info-panel {
        flex: 1;
        width: 100%;
        min-height: 0;
        flex-direction: column;
        /* 底部抽屉：圆角在上方 */
        border-radius: 16px 16px 0 0;
        overflow: hidden;
    }

    .toggle-handle {
        width: 80px;
        height: 30px;
        align-self: center;
        border-radius: 15px 15px 0 0;

        /* 核心修改 */
        position: static;
        /* 恢复默认，不再需要 relative */
        margin-top: -30px;
        /* 用负外边距向上拉 */
        margin-bottom: 0;

        transform: translateX(0%);
        /* 保持的水平偏移 */
        transition: background 0.2s ease;
    }

    /* 修复：移动端点按触发 :hover/:active 时不再缩成 30px（沿用桌面端视觉） */
    .toggle-handle:hover,
    .toggle-handle:active {
        width: 80px;
        background: var(--brand-accent-dark);
    }

    .handle-icon {
        /* 移动端箭头为上下方向（与桌面端的左右区分） */
        transition: transform 0.3s ease;
        transform: rotate(90deg);
        width: 20px;
        height: 20px;
        color: var(--brand-accent);
    }

    .handle-icon.is-flipped {
        transform: rotate(-90deg);
    }
}

/* ── News Dashboard 样式 ── */
.news-dashboard {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 0;
    padding: 0 !important;
    background: var(--bg-primary);
    border-radius: 16px 0 0 16px;
}

.news-header-bar {
    padding: 8px;
    flex-shrink: 0;
    /* 结构性分隔线：规范例外，保留；但改用令牌色，不再硬编码 #f0f0f0 */
    border-bottom: 1px solid rgba(var(--shadow-rgb), 0.07);
}

.news-logo {
    font-family: var(--font-en);
    font-size: 24px;
    font-weight: 700;
    /* 原为 background-clip: text 的渐变文字：24px/700 下渐变走向根本看不出，
       只剩「颜色不匀」；且渐变文字在高对比模式与打印场景常整块消失 */
    color: var(--brand-primary-dark);
    display: block;
    line-height: 1.2;
}

.news-subtitle {
    font-family: var(--font-mono);
    font-size: 12px;
    /* 12px 用 --text-muted(#999) 仅约 2.8:1，不达 WCAG AA；降一档到 --text-secondary(约 5.7:1) */
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.1em;
}

.news-platform-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 16px;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(var(--shadow-rgb), 0.07);
}

/* 平台胶囊：去 #ddd 描边，改淡底；
   原版散落 5 处硬编码绿（#13c64f / #268c0a / #0ea342 / #15883d），
   且 active 底色是 rgba(0,153,204,.12) —— 一个蓝色跑在绿色主题里，全部收敛到品牌令牌 */
.platform-chip {
    padding: 5px 12px;
    border: 0;
    border-radius: 20px;
    background: rgba(var(--shadow-rgb), 0.05);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 12px;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease;
}

.platform-chip:hover {
    background: rgba(var(--brand-primary-rgb), 0.1);
    color: var(--brand-primary-dark);
}

.platform-chip.active {
    background: rgba(var(--brand-primary-rgb), 0.16);
    color: var(--brand-primary-dark);
    font-weight: 600;
}

.news-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px 16px;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 12px;
}

.loading-dot-pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--brand-primary);
    animation: dotPulse 1.2s ease-out infinite;
}

/* 波纹改用品牌色：原起点 #0dcd4a / rgba(5,165,59,.6) 是硬编码绿，
   终点 rgba(0,212,255,0) 更是一枚青色——只因 alpha=0 才没被看出来 */
@keyframes dotPulse {
    0%,
    100% {
        box-shadow: 0 0 0 0 rgba(var(--brand-primary-rgb), 0.55);
    }
    50% {
        box-shadow: 0 0 0 12px rgba(var(--brand-primary-rgb), 0);
    }
}

.news-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.news-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 8px;
    border-radius: 6px;
    text-decoration: none;
    color: inherit;
    transition: background-color 0.2s ease;
}

.news-card:hover {
    /* 原 #f5f5f5 中性灰：与整页绿色调脱节，改用极淡品牌底 */
    background: rgba(var(--brand-primary-rgb), 0.055);
}

.news-rank {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    border-radius: 4px;
    /* 原 rgba(0,0,0,.08) 中性黑：与全站冷调阴影语汇脱节 */
    background: rgba(var(--shadow-rgb), 0.06);
}

/* 前三名的金/银/铜属「语义色」而非装饰——各自对应名次，不能统一成品牌绿。
   但原取值 #f0b35a / #a0b8c8 / #c89070 在 10% 淡底上对比不足 2.5:1，
   这里整体压深一档，既保住奖牌观感，又把文字拉到可读 */
.rank-top1 {
    color: var(--brand-gold-dark);
    background: rgba(var(--brand-gold-rgb), 0.14);
}

.rank-top2 {
    color: #6b7f8c;
    background: rgba(160, 184, 200, 0.16);
}

.rank-top3 {
    color: #9c6644;
    background: rgba(200, 144, 112, 0.16);
}

.news-body {
    flex: 1;
    min-width: 0;
}

.news-title {
    font-family: var(--font-en);
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    transition: color 0.2s ease;
}

.news-card:hover .news-title {
    /* 原 #15ac3a 硬编码绿，与 --brand-primary-dark 仅差几个色阶，统一回令牌 */
    color: var(--brand-primary-dark);
}

.news-meta {
    margin-top: 2px;
}

.news-desc {
    font-family: var(--font-en);
    font-size: 12px;
    /* 12px 用 --text-muted(#999) 仅约 2.8:1，不达 WCAG AA；降一档到 --text-secondary */
    color: var(--text-secondary);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.news-score {
    flex-shrink: 0;
}

.score-value {
    font-family: var(--font-mono);
    font-size: 10px;
    /* 10px 小字用 #999 基本不可读；这类时长/热度属弱信息，给 --text-secondary 已足够 */
    color: var(--text-secondary);
    background: rgba(var(--shadow-rgb), 0.06);
    padding: 2px 8px;
    border-radius: 10px;
    white-space: nowrap;
}

.news-empty {
    padding: 40px 16px;
    text-align: center;
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: 12px;
}

.news-footer {
    padding: 12px 16px;
    /* 结构性分隔线：规范例外，保留但改用令牌色 */
    border-top: 1px solid rgba(var(--shadow-rgb), 0.07);
    flex-shrink: 0;
}

.footer-status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-secondary);
}

.footer-status.live {
    color: var(--brand-primary);
}

.status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
}

.footer-status.live .status-dot {
    animation: dotPulse 2s ease-out infinite;
}
</style>

