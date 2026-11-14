/**
 * useCesiumInfoBoxTheme.js — Cesium InfoBox 主题化
 *
 * 背景：InfoBox 的描述内容渲染在**独立 iframe** 里，Cesium 自带的
 * Widgets/InfoBox/InfoBoxDescription.css 把正文设为浅青色 `#edffff`
 * （为暗色卡片设计）。卡片改白底后，正文会变成"白底浅字"不可读。
 * 而 iframe 是独立文档，父页 CSS 无法穿透，只能把样式注入 iframe 内部。
 *
 * 做法：向 iframe 文档 head 注入一份样式，颜色实时读取父页计算后的
 * --brand-* / --text-* 令牌，因此切换主题（绿/蓝）时 iframe 内文字同步跟随。
 * 另监听 iframe load 事件（iframe 文档可能被重建）并监听 <html data-theme>
 * 变化，保证样式始终有效。
 *
 * 高度自适应（2026-11-13 补）：
 * Cesium 的 InfoBox.css 与 InfoBox.js 都没有给 iframe 设高度，iframe 因此落回
 * HTML 元素默认的 150px，内容超出就在 iframe 内部滚动 —— 表现为「卡片高度固定」。
 * 本模块在 iframe load、内容变更（MutationObserver）与宽度变化（ResizeObserver）
 * 时测量文档实际高度并回写 style.height，上限为视口的 60%，超出部分仍由
 * iframe 内部滚动承载。
 */

const FRAME_STYLE_ID = 'cesium-infobox-theme-style';

/** iframe 自适应高度的上限（视口占比）：超长属性表不把卡片撑满整屏 */
const FRAME_MAX_HEIGHT_RATIO = 0.6;

/**
 * 功能：读取 iframe 文档的内容高度。
 * 参数：doc —— iframe 的 contentDocument。
 * 返回：像素高度（含 padding），取不到时为 0。
 * 说明：Cesium 的 InfoBoxDescription.css 已把 body 的 margin/padding 归零，
 *   故 scrollHeight 与实际可见高度一致；同时取 documentElement 与 body 的较大值兜底。
 */
function measureFrameContentHeight(doc: any) {
    const root = doc?.documentElement;
    const body = doc?.body;
    if (!root || !body) return 0;
    return Math.ceil(Math.max(root.scrollHeight, body.scrollHeight, body.offsetHeight));
}

/** 读取父页当前生效的主题色（已解析为具体色值） */
function readThemeTokens() {
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const pick = (name: any, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    return {
        text: pick('--text-primary', '#333'),
        textMuted: pick('--text-muted', '#999'),
        brand: pick('--brand-primary', '#4caf50'),
        brandDark: pick('--brand-primary-dark', '#2e7d32'),
        brandBg: pick('--brand-primary-bg', '#e8f5e9'),
        brandLight: pick('--brand-primary-light', '#81c784'),
    };
}

/** iframe 内部样式：白底深字 + 品牌色表头，覆写 Cesium 自带的浅色规则 */
function buildFrameCss(t: any) {
    return `
.cesium-infoBox-description { color: ${t.text} !important; }
.cesium-infoBox-description a:link,
.cesium-infoBox-description a:visited,
.cesium-infoBox-description a:hover,
.cesium-infoBox-description a:active { color: ${t.brandDark} !important; }
.cesium-infoBox-description table,
.cesium-infoBox-defaultTable { color: ${t.text} !important; }
.cesium-infoBox-defaultTable tr:nth-child(odd) { background-color: ${t.brandBg} !important; }
.cesium-infoBox-defaultTable tr:nth-child(even) { background-color: #fff !important; }
.cesium-infoBox-defaultTable th,
.cesium-infoBox-defaultTable td { color: ${t.text} !important; }
.cesium-infoBox-description-lighter,
.cesium-infoBox-description-lighter table,
.cesium-infoBox-defaultTable-lighter { color: ${t.text} !important; }

/* 应用自有点查描述（identifyPresentation 产出）的类名钩子 */
.cesium-identify-heading { color: ${t.brandDark} !important; }
.cesium-identify-key { color: ${t.textMuted} !important; }
.cesium-identify-value { color: ${t.text} !important; }

.cesium-infoBox-loadingContainer { background: #fff !important; }

/* 高度由父页按内容测量，内部只允许纵向滚动，避免长表格撑出横向滚动条 */
html, body { overflow-x: hidden; }
`.trim();
}

export interface InfoBoxThemeOptions {
    /** 取当前 Cesium viewer（可能尚未创建，需容忍空值） */
    getViewer?: () => any;
}

export function useCesiumInfoBoxTheme({ getViewer }: InfoBoxThemeOptions = {}) {
    let boundFrame: any = null;
    let themeObserver: any = null;
    let contentObserver: any = null;
    let resizeObserver: any = null;
    let rafId = 0;
    let lastWidth = 0;

    /** 把主题样式写入 iframe 文档（幂等，重复调用只更新内容） */
    function applyInfoBoxTheme() {
        const frame = getViewer?.()?.infoBox?.frame;
        const doc = frame?.contentDocument;
        if (!doc?.head) return;
        let styleEl = doc.getElementById(FRAME_STYLE_ID);
        if (!styleEl) {
            styleEl = doc.createElement('style');
            styleEl.id = FRAME_STYLE_ID;
            doc.head.appendChild(styleEl);
        }
        styleEl.textContent = buildFrameCss(readThemeTokens());
    }

    /** 绑定 iframe（iframe 文档可能随描述变化重建，故监听其 load） */
    function bindInfoBoxTheme() {
        const frame = getViewer?.()?.infoBox?.frame;
        if (!frame || frame === boundFrame) {
            applyInfoBoxTheme();
            return;
        }
        boundFrame = frame;
        frame.addEventListener('load', handleFrameLoad);
        handleFrameLoad();
        observeFrameResize();
        window.addEventListener('resize', scheduleSync);
    }

    /**
     * 功能：把 iframe 高度同步为内容实际高度。
     * 参数：无（从 viewer.infoBox.frame 取）。
     * 返回：无。
     * 核心逻辑：内容高度 ≤ 视口 60% 时 iframe 恰好包住内容；
     *   超出则钳到 60%，由 iframe 内部滚动承载 —— 既不出现固定空白，也不会顶穿屏幕。
     */
    function syncFrameHeight() {
        const frame = getViewer?.()?.infoBox?.frame;
        const doc = frame?.contentDocument;
        if (!frame || !doc) return;
        // 无描述时 Cesium 给容器加 bodyless，iframe 为 display:none，不参与布局
        if (getComputedStyle(frame).display === 'none') return;
        const contentHeight = measureFrameContentHeight(doc);
        if (!contentHeight) return;
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const maxHeight = Math.round(viewportHeight * FRAME_MAX_HEIGHT_RATIO);
        frame.style.height = `${Math.min(contentHeight, maxHeight)}px`;
    }

    /** 合并同一帧内的多次变更，避免 MutationObserver 连续触发导致布局抖动 */
    function scheduleSync() {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            rafId = 0;
            syncFrameHeight();
        });
    }

    /** 监听 iframe 文档内容变化：描述是异步写入 / 表格可能展开，需要随之重算 */
    function observeFrameContent() {
        const doc = getViewer?.()?.infoBox?.frame?.contentDocument;
        if (!doc?.body) return;
        contentObserver?.disconnect();
        contentObserver = new MutationObserver(scheduleSync);
        contentObserver.observe(doc.body, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
        });
    }

    /** 监听 iframe 宽度变化：宽度决定换行，进而决定高度 */
    function observeFrameResize() {
        const frame = getViewer?.()?.infoBox?.frame;
        if (!frame || typeof ResizeObserver !== 'function') return;
        resizeObserver?.disconnect();
        lastWidth = Math.round(frame.getBoundingClientRect().width);
        resizeObserver = new ResizeObserver((entries) => {
            const width = Math.round(entries[0]?.contentRect?.width ?? 0);
            // 只对「宽度变化」重算：height 是本模块写入的，响应它会在
            // 写高度 → 触发 observer → 再写高度 之间形成自激循环
            if (!width || Math.abs(width - lastWidth) < 1) return;
            lastWidth = width;
            scheduleSync();
        });
        resizeObserver.observe(frame);
    }

    /** iframe 文档重建（每次写描述）后的统一收尾：注入样式、重绑内容监听、重算高度 */
    function handleFrameLoad() {
        applyInfoBoxTheme();
        observeFrameContent();
        syncFrameHeight();
    }

    /** 主题切换（data-theme 变化）后重新注入，使 iframe 内文字跟随新主题 */
    function watchThemeChange() {
        if (themeObserver) return;
        themeObserver = new MutationObserver(() => applyInfoBoxTheme());
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        });
    }

    function cleanupInfoBoxTheme() {
        themeObserver?.disconnect();
        themeObserver = null;
        contentObserver?.disconnect();
        contentObserver = null;
        resizeObserver?.disconnect();
        resizeObserver = null;
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
        window.removeEventListener('resize', scheduleSync);
        boundFrame?.removeEventListener('load', handleFrameLoad);
        boundFrame = null;
    }

    return {
        bindInfoBoxTheme,
        applyInfoBoxTheme,
        watchThemeChange,
        cleanupInfoBoxTheme,
    };
}
