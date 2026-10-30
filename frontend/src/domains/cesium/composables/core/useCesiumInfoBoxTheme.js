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
 */

const FRAME_STYLE_ID = 'cesium-infobox-theme-style';

/** 读取父页当前生效的主题色（已解析为具体色值） */
function readThemeTokens() {
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const pick = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
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
function buildFrameCss(t) {
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
`.trim();
}

export function useCesiumInfoBoxTheme({ getViewer } = {}) {
    let boundFrame = null;
    let themeObserver = null;

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
        frame.addEventListener('load', applyInfoBoxTheme);
        applyInfoBoxTheme();
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
        boundFrame = null;
    }

    return {
        bindInfoBoxTheme,
        applyInfoBoxTheme,
        watchThemeChange,
        cleanupInfoBoxTheme,
    };
}
