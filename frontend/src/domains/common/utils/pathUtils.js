/**
 * 路径工具函数 — 统一模块
 *
 * 合并自 archiveProcessor.js、batchProcessor.js、decompressFile.js、
 * useGisLoader.ts、useKmzLoader.js 中的重复路径处理函数。
 *
 * @module pathUtils
 */

/**
 * 规范化路径：统一使用正斜杠，去除 ./ 前缀，去除首尾空白
 * @param {string} path - 原始路径
 * @returns {string} 规范化后的路径
 */
export function normalizePath(path = '') {
    return String(path || '')
        .replace(/\\/g, '/')
        .replace(/^\.\/?/, '')
        .trim();
}

/**
 * 提取文件扩展名（小写）
 * @param {string} path - 文件路径
 * @returns {string} 小写扩展名，无扩展名时返回空字符串
 */
export function getExtension(path = '') {
    const normalized = normalizePath(path).toLowerCase();
    const idx = normalized.lastIndexOf('.');
    if (idx < 0 || idx === normalized.length - 1) return '';
    return normalized.slice(idx + 1);
}

/**
 * 提取文件 stem（不含扩展名的完整路径）
 * 保留目录前缀，适合用于路径级别的 stem 比较
 * @param {string} path - 文件路径
 * @returns {string} 不含扩展名的路径
 */
export function getStem(path = '') {
    const normalized = normalizePath(path);
    const idx = normalized.lastIndexOf('.');
    return idx > 0 ? normalized.slice(0, idx) : normalized;
}

/**
 * 提取文件名 stem（仅文件名，不含目录和扩展名）
 * @param {string} path - 文件路径
 * @returns {string} 不含目录和扩展名的文件名
 */
export function getNameStem(path = '') {
    const normalized = normalizePath(path);
    const idx = normalized.lastIndexOf('.');
    const withoutExt = idx > 0 ? normalized.slice(0, idx) : normalized;
    const slashIdx = withoutExt.lastIndexOf('/');
    return slashIdx >= 0 ? withoutExt.slice(slashIdx + 1) : withoutExt;
}

/**
 * 提取小写的完整路径 stem（含目录），适合做大小写不敏感的 map key
 * @param {string} path - 文件路径
 * @returns {string} 小写的不含扩展名的路径
 */
export function getStemKey(path = '') {
    return getStem(path).toLowerCase();
}

/**
 * 提取目录部分
 * @param {string} path - 文件路径
 * @returns {string} 目录路径，无目录时返回空字符串
 */
export function getDir(path = '') {
    const normalized = normalizePath(path);
    const idx = normalized.lastIndexOf('/');
    return idx > 0 ? normalized.slice(0, idx) : '';
}

/**
 * 分离目录和文件名
 * @param {string} path - 文件路径
 * @returns {{ dir: string, file: string }} 目录和文件名
 */
export function splitDirAndFile(path = '') {
    const normalized = normalizePath(path);
    const idx = normalized.lastIndexOf('/');
    if (idx < 0) return { dir: '', file: normalized };
    return {
        dir: normalized.slice(0, idx),
        file: normalized.slice(idx + 1),
    };
}

/**
 * 解析相对路径，支持 .. 和 . 段，处理绝对 URL、data URI 和 fragment
 * @param {string} basePath - 基准路径
 * @param {string} relativePath - 相对路径
 * @returns {string} 解析后的路径
 */
export function resolveRelativePath(basePath, relativePath) {
    const rel = normalizePath(relativePath);
    // 绝对 URL、data URI、fragment 直接返回
    if (!rel || /^([a-z]+:)?\/\//i.test(rel) || rel.startsWith('data:') || rel.startsWith('#')) {
        return rel;
    }

    const { dir } = splitDirAndFile(basePath);
    const seed = dir ? `${dir}/${rel}` : rel;
    const parts = seed.split('/');
    const out = [];

    for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') {
            if (out.length) out.pop();
            continue;
        }
        out.push(part);
    }
    return out.join('/');
}

/**
 * 提取目录下文件的基础 stem（不含目录、不含扩展名）
 * @param {string} path - 文件路径
 * @returns {string} 文件名 stem
 */
export function getBaseStem(path = '') {
    const normalized = normalizePath(path).toLowerCase();
    const base = normalized.split('/').pop() || normalized;
    const idx = base.lastIndexOf('.');
    return idx > 0 ? base.slice(0, idx) : base;
}

/**
 * 生成 SHP 文件分组 key（目录 + 基础 stem）
 * @param {string} path - 文件路径
 * @returns {string} 分组 key
 */
export function makeShpGroupKey(path = '') {
    const dir = getDir(path);
    const stem = getBaseStem(path);
    return dir ? `${dir}/${stem}` : stem;
}
