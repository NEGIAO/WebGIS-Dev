export type GisDispatchInput = {
    resources?: Array<File | Blob | any>;
    content?: unknown;
    type?: string;
    name?: string;
};

export function createUploadPayloadsFromFiles(files: File[]): GisDispatchInput {
    const normalizedFiles = (files || []).filter(Boolean);
    const firstName = normalizedFiles[0]
        ? (normalizedFiles[0] as any).webkitRelativePath || normalizedFiles[0].name
        : '多文件上传';

    return {
        resources: normalizedFiles,
        type: 'directory',
        name: firstName || '多文件上传',
    };
}

export function createUploadPayloadFromFolder(files: File[]): GisDispatchInput {
    return {
        resources: files || [],
        type: 'directory',
        name: files?.[0]?.webkitRelativePath?.split('/')?.[0] || '文件夹上传',
    };
}

export function createUploadPayloadFromEntries(entries: any[]): GisDispatchInput {
    return {
        resources: entries || [],
        type: 'directory',
        name: '拖拽导入',
    };
}
