/**
 * generate-sharedata-manifest.mjs — 共享资源清单生成器
 *
 * 功能:递归扫描 public/ShareData,生成 public/ShareData/manifest.json,
 *       供 useSharedResourceLoader 运行时 fetch(替代旧 import.meta.glob 方案——
 *       glob 会把 ShareData 全目录再拷贝进 dist/assets 产生约 7.5MB 纯死重,
 *       而代码只消费文件路径,哈希副本零引用;V3.4.54 加载性能优化移除)。
 *
 * 调用方式:
 *   1) vite.config.js 在配置求值时调用 generateShareDataManifest()——
 *      npm run dev / build / build:webgis* 均自动刷新,清单永不过期;
 *   2) 也可独立运行:node scripts/generate-sharedata-manifest.mjs
 *
 * 输出格式(与 loader 的 manifest 解析逻辑对齐):
 *   { "resources": [ { "path": "相对ShareData的POSIX路径", "name": "文件名", "size": 字节数 } ] }
 *   不含时间戳/机器相关字段,保证产物确定性(同内容 → 同清单,git 无噪声 diff)。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(SCRIPT_DIR, '..');
const SHARE_DIR = path.join(FRONTEND_ROOT, 'public', 'ShareData');
const OUTPUT_PATH = path.join(SHARE_DIR, 'manifest.json');
const MANIFEST_NAME = 'manifest.json';

/**
 * 递归收集目录下全部文件
 * @param {string} dirAbs - 当前目录绝对路径
 * @param {string} relPrefix - 相对 ShareData 的前缀(POSIX 分隔)
 * @returns {Array<{path: string, name: string, size: number}>}
 */
function collectFiles(dirAbs, relPrefix = '') {
    const out = [];
    for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
        const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        const abs = path.join(dirAbs, entry.name);
        if (entry.isDirectory()) {
            out.push(...collectFiles(abs, rel));
        } else if (entry.isFile()) {
            // 清单自身不作为资源登记
            if (rel === MANIFEST_NAME) continue;
            out.push({ path: rel, name: entry.name, size: fs.statSync(abs).size });
        }
    }
    return out;
}

/**
 * 生成(或刷新)ShareData 清单文件。目录不存在时静默跳过(不阻断构建)。
 * @returns {number} 登记的资源数(-1 表示目录缺失未生成)
 */
export function generateShareDataManifest() {
    if (!fs.existsSync(SHARE_DIR)) {
        console.warn(`[sharedata-manifest] 目录不存在,跳过生成:${SHARE_DIR}`);
        return -1;
    }
    const resources = collectFiles(SHARE_DIR).sort((a, b) => a.path.localeCompare(b.path, 'en'));
    const manifest = { resources };
    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(manifest, null, 4)}\n`, 'utf-8');
    console.log(`[sharedata-manifest] 已生成 ${resources.length} 条资源 → public/ShareData/manifest.json`);
    return resources.length;
}

// 独立运行入口:node scripts/generate-sharedata-manifest.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    generateShareDataManifest();
}
