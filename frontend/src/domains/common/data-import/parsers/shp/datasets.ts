/**
 * SHP 数据集分组（.shp/.dbf/.shx/.prj/.cpg sidecar 配对）
 * 日    期：2026/11/13
 */

import type { FlattenedResource } from '../../decompressor';
export type ShpDataset = {
    key: string;
    shp: FlattenedResource;
    shx?: FlattenedResource;
    dbf?: FlattenedResource;
    prj?: FlattenedResource;
    cpg?: FlattenedResource;
};
export type ShpPartsInput = {
    shp: ArrayBuffer | Blob;
    dbf?: ArrayBuffer | Blob;
    shx?: ArrayBuffer | Blob;
    prj?: ArrayBuffer | Blob;
    cpg?: ArrayBuffer | Blob;
    prjText?: string;
    cpgText?: string;
};
function normalizePath(path = ''): string {
    return String(path || '')
        .replace(/\\/g, '/')
        .trim();
}
function pathDir(path = ''): string {
    const normalized = normalizePath(path);
    const idx = normalized.lastIndexOf('/');
    if (idx < 0) return '';
    return normalized.slice(0, idx);
}
function stemOf(path = ''): string {
    const normalized = normalizePath(path);
    const base = normalized.split('/').pop() || normalized;
    const idx = base.lastIndexOf('.');
    if (idx < 0) return base;
    return base.slice(0, idx);
}
export function groupShpDatasets(resources: FlattenedResource[]): ShpDataset[] {
    const groups = new Map<string, Partial<ShpDataset>>();

    // 归一化：NFC（macOS 传入的分解式文件名） + 小写（Windows 不区分大小写）。
    // 只按原名做精确匹配时，「国界线.SHP / 国界线.dbf」这类大小写或编码差异
    // 会把同一份数据拆成互不相干的组，表现为「明明上传了 .dbf 却报缺失」。
    const normalizeKey = (value: string): string =>
        String(value || '').normalize('NFC').toLowerCase();

    for (const resource of resources) {
        const ext = String(resource.ext || '').toLowerCase();
        if (!['shp', 'shx', 'dbf', 'prj', 'cpg'].includes(ext)) continue;

        const dir = normalizeKey(pathDir(resource.path));
        const stem = normalizeKey(stemOf(resource.path));
        const key = dir ? `${dir}/${stem}` : stem;
        const current = groups.get(key) || { key };

        if (ext === 'shp') current.shp = resource;
        if (ext === 'shx') current.shx = resource;
        if (ext === 'dbf') current.dbf = resource;
        if (ext === 'prj') current.prj = resource;
        if (ext === 'cpg') current.cpg = resource;

        groups.set(key, current);
    }

    const withShp = Array.from(groups.values()).filter(
        (item): item is Partial<ShpDataset> & { shp: FlattenedResource } => !!item.shp,
    );

    // 兜底：整批只有一个 .shp 时，把「有 sidecar 但没有 shp」的孤儿组合并进来。
    // 现实里常见把 sidecar 改名（加后缀、去空格）后与 .shp 一起上传，严格配名会全部丢弃；
    // 仅一个 .shp 时不存在归属歧义，合并比报「缺少 .dbf」更符合用户意图。
    if (withShp.length === 1) {
        const target = withShp[0];
        for (const item of groups.values()) {
            if (item.shp) continue;
            if (!item.dbf && !item.shx && !item.prj && !item.cpg) continue;
            target.dbf = target.dbf || item.dbf;
            target.shx = target.shx || item.shx;
            target.prj = target.prj || item.prj;
            target.cpg = target.cpg || item.cpg;
        }
    }

    return withShp
        .filter((item): item is ShpDataset => !!item.shp)
        .sort((a, b) => a.key.localeCompare(b.key));
}
