function extractSourceUrl(source) {
    if (!source) return '';

    if (typeof source.getUrls === 'function') {
        const urls = source.getUrls();
        if (Array.isArray(urls)) {
            const first = urls.find((item) => typeof item === 'string' && item.trim());
            if (first) return String(first).trim();
        }
    }

    if (typeof source.getUrl === 'function') {
        const directUrl = source.getUrl();
        if (typeof directUrl === 'string' && directUrl.trim()) return directUrl.trim();
    }

    return '';
}

async function copyTextToClipboard(text) {
    const content = String(text || '').trim();
    if (!content) return false;

    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(content);
            return true;
        }
    } catch {
        // 继续使用 fallback。
    }

    try {
        const textArea = document.createElement('textarea');
        textArea.value = content;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textArea);
        return !!ok;
    } catch {
        return false;
    }
}

/**
 * 图层右键菜单动作处理：复制 URL / 查看 URL。
 */
export function useLayerContextMenuActions({
    layerInstances,
    getLayerConfigs,
    customMapUrlRef,
    message
}) {
    const resolveLayerSourceUrl = (layerId) => {
        const normalizedLayerId = String(layerId || '').trim();
        if (!normalizedLayerId) return '';

        if (normalizedLayerId === 'custom' && customMapUrlRef?.value) {
            return String(customMapUrlRef.value).trim();
        }

        const fromInstance = extractSourceUrl(layerInstances?.[normalizedLayerId]?.getSource?.());
        if (fromInstance) return fromInstance;

        const layerConfigs = typeof getLayerConfigs === 'function' ? getLayerConfigs() : [];
        const layerConfig = Array.isArray(layerConfigs)
            ? layerConfigs.find((cfg) => cfg.id === normalizedLayerId)
            : null;

        if (!layerConfig?.createSource) return '';

        try {
            const source = layerConfig.createSource();
            return extractSourceUrl(source);
        } catch {
            return '';
        }
    };

    const copyLayerUrl = async (layerId, layerName = '') => {
        const normalizedName = String(layerName || layerId || '图层').trim();
        const sourceUrl = resolveLayerSourceUrl(layerId);
        if (!sourceUrl) {
            message?.warning?.(`${normalizedName} 当前无法提取可复制的 URL`);
            return;
        }

        const copied = await copyTextToClipboard(sourceUrl);
        if (copied) {
            message?.success?.(`已复制 ${normalizedName} 图源 URL`);
        } else {
            message?.error?.(`复制 ${normalizedName} 图源 URL 失败`);
        }
    };

    const viewLayerUrl = (layerId, layerName = '') => {
        const normalizedName = String(layerName || layerId || '图层').trim();
        const sourceUrl = resolveLayerSourceUrl(layerId);
        if (!sourceUrl) {
            message?.warning?.(`${normalizedName} 当前无法提取 URL`);
            return;
        }

        window.prompt(`${normalizedName} 图源 URL`, sourceUrl);
    };

    const handleLayerContextAction = async (payload = {}) => {
        const action = String(payload.action || '').trim();
        const layerId = String(payload.layerId || '').trim();
        const layerName = String(payload.layerName || layerId || '图层').trim();
        if (!action || !layerId) return;

        if (action === 'copy-url') {
            await copyLayerUrl(layerId, layerName);
            return;
        }

        if (action === 'view-url') {
            viewLayerUrl(layerId, layerName);
        }
    };

    return {
        resolveLayerSourceUrl,
        handleLayerContextAction
    };
}
