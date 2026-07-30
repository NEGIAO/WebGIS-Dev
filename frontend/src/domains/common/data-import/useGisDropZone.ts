import { ref } from 'vue';
import {
    createUploadPayloadFromEntries,
    createUploadPayloadsFromFiles,
    type GisDispatchInput,
} from '@common/data-import/gisUploadPayload';

type WebkitDataTransferItem = DataTransferItem & {
    webkitGetAsEntry?: () => FileSystemEntry | null;
};

type GisDropZoneOptions = {
    onUpload?: (payload: GisDispatchInput) => void | Promise<void>;
};

/**
 * 判断当前拖拽是否包含本地文件/目录，避免普通 DOM 拖拽误触发导入提示。
 *
 * @param {DataTransfer | null | undefined} dataTransfer
 * @returns {boolean}
 */
function hasFileItems(dataTransfer?: DataTransfer | null): boolean {
    if (!dataTransfer) return false;

    const items = Array.from(dataTransfer.items || []) as WebkitDataTransferItem[];
    if (items.some((item) => item?.kind === 'file')) return true;

    const types = Array.from(dataTransfer.types || []);
    if (types.includes('Files')) return true;

    return Boolean(dataTransfer.files?.length);
}

/**
 * 将拖拽数据转换为与 TOC 上传区完全一致的 GIS 导入载荷。
 * 优先保留 FileSystemEntry，以支持文件夹和 SHP 配套文件的递归读取；
 * 不支持 Entry API 的浏览器则回退为普通 FileList。
 *
 * @param {DataTransfer | null | undefined} dataTransfer
 * @returns {object | null}
 */
function createDropUploadPayload(dataTransfer?: DataTransfer | null): GisDispatchInput | null {
    if (!dataTransfer) return null;

    const entryItems = (Array.from(dataTransfer.items || []) as WebkitDataTransferItem[])
        .filter((item) => item?.kind === 'file')
        .map((item) =>
            typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null,
        )
        .filter(Boolean);

    if (entryItems.length) {
        return createUploadPayloadFromEntries(entryItems);
    }

    const files = Array.from(dataTransfer.files || []);
    if (!files.length) return null;
    return createUploadPayloadsFromFiles(files);
}

/**
 * 通用 GIS 文件拖拽导入区。
 *
 * @param {object} options
 * @param {(payload: object) => void | Promise<void>} options.onUpload
 */
export function useGisDropZone({ onUpload }: GisDropZoneOptions) {
    const isDragging = ref(false);

    function handleDragEnter(event: DragEvent) {
        if (!hasFileItems(event?.dataTransfer)) return;
        isDragging.value = true;
    }

    function handleDragOver(event: DragEvent) {
        if (!hasFileItems(event?.dataTransfer)) return;
        isDragging.value = true;
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy';
        }
    }

    function handleDragLeave(event: DragEvent) {
        const currentTarget = event?.currentTarget;
        const relatedTarget = event?.relatedTarget;

        // 在拖拽经过容器内部子节点时，不关闭覆盖提示，避免闪烁。
        if (
            currentTarget instanceof Node &&
            relatedTarget instanceof Node &&
            currentTarget.contains(relatedTarget)
        ) {
            return;
        }

        isDragging.value = false;
    }

    function handleDrop(event: DragEvent): GisDispatchInput | null {
        isDragging.value = false;
        const payload = createDropUploadPayload(event?.dataTransfer);
        if (!payload) return null;

        onUpload?.(payload);
        return payload;
    }

    return {
        isDragging,
        handleDragEnter,
        handleDragOver,
        handleDragLeave,
        handleDrop,
    };
}

export { createDropUploadPayload, hasFileItems };
