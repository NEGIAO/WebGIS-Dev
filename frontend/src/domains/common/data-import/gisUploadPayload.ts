export type GisDispatchInput = {
    resources?: Array<File | Blob | any>;
    content?: unknown;
    type?: string;
    name?: string;
    /**
     * 人工指定的源坐标系（`EPSG:4547` / `WKT:别名`）。
     * 空串或缺省表示「自动识别」：.prj > KML 声明 > GeoJSON crs > 坐标量级推断。
     */
    overrideCrs?: string;
};

/** 上传载荷的构建选项（目前只有源坐标系覆盖） */
export type GisUploadOptions = {
    overrideCrs?: string;
};

export function createUploadPayloadsFromFiles(
    files: File[],
    options: GisUploadOptions = {},
): GisDispatchInput {
    const normalizedFiles = (files || []).filter(Boolean);
    const firstName = normalizedFiles[0]
        ? (normalizedFiles[0] as any).webkitRelativePath || normalizedFiles[0].name
        : '多文件上传';

    return {
        resources: normalizedFiles,
        type: 'directory',
        name: firstName || '多文件上传',
        overrideCrs: String(options.overrideCrs || '').trim(),
    };
}

export function createUploadPayloadFromFolder(
    files: File[],
    options: GisUploadOptions = {},
): GisDispatchInput {
    return {
        resources: files || [],
        type: 'directory',
        name: files?.[0]?.webkitRelativePath?.split('/')?.[0] || '文件夹上传',
        overrideCrs: String(options.overrideCrs || '').trim(),
    };
}

export function createUploadPayloadFromEntries(
    entries: any[],
    options: GisUploadOptions = {},
): GisDispatchInput {
    return {
        resources: entries || [],
        type: 'directory',
        name: '拖拽导入',
        overrideCrs: String(options.overrideCrs || '').trim(),
    };
}
