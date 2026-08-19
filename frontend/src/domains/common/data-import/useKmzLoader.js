import { ref } from 'vue';
import { normalizePath, splitDirAndFile, resolveRelativePath } from '@common/utils/pathUtils';

const IS_DEV = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;

function detectMimeType(path) {
    const lower = String(path || '').toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.bmp')) return 'image/bmp';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    if (lower.endsWith('.ico')) return 'image/x-icon';
    if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
    if (lower.endsWith('.kml')) return 'application/vnd.google-earth.kml+xml';
    if (lower.endsWith('.kmz')) return 'application/vnd.google-earth.kmz';
    return 'application/octet-stream';
}

function pickMainKmlEntry(entries) {
    if (!entries.length) return null;

    const docKml = entries.find(
        (entry) => splitDirAndFile(entry.name).file.toLowerCase() === 'doc.kml',
    );
    if (docKml) return docKml;

    return entries.slice().sort((a, b) => {
        const depthA = normalizePath(a.name).split('/').length;
        const depthB = normalizePath(b.name).split('/').length;
        if (depthA !== depthB) return depthA - depthB;
        return normalizePath(a.name).length - normalizePath(b.name).length;
    })[0];
}

function countByRegex(text, regex) {
    const matches = String(text || '').match(regex);
    return matches ? matches.length : 0;
}

function getKmlContentScore(text) {
    const content = String(text || '');
    const placemarkCount = countByRegex(content, /<\s*(?:[\w-]+:)?Placemark\b/gi);
    const coordinatesCount = countByRegex(content, /<\s*(?:[\w-]+:)?coordinates\b/gi);
    const pointLinePolygonCount = countByRegex(
        content,
        /<\s*(?:[\w-]+:)?(?:Point|LineString|Polygon)\b/gi,
    );
    const documentCount = countByRegex(content, /<\s*(?:[\w-]+:)?Document\b/gi);

    // 优先保证“有可渲染要素”的 KML 胜出，其次再看体量。
    return (
        placemarkCount * 1000 +
        coordinatesCount * 300 +
        pointLinePolygonCount * 120 +
        documentCount * 20 +
        Math.min(content.length, 5000)
    );
}

/**
 * 解码 KML 文本（多编码，与 textDecoder.js decodeTextContent 同源启发式）
 * 注意：任意字节流按 UTF-16 解码都不会产生替换字符，若仅按替换字符计数，
 * GBK 文本会被误判为 UTF-16LE；故增加字节级 0x00 支撑校验（真 UTF-16 的
 * ASCII 标记必然在原始字节中产生 0x00，LE 在奇位、BE 在偶位）与 C0 控制
 * 字符罚分。
 *
 * @param {ArrayBuffer} buffer - KML 原始字节
 * @returns {string} 解码后的文本
 */
function decodeKmlText(buffer) {
    const bytes = new Uint8Array(buffer);

    // BOM 权威判定
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        return new TextDecoder('utf-8').decode(buffer);
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder('utf-16le').decode(buffer);
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        return new TextDecoder('utf-16be').decode(buffer);
    }

    let nulBytes = 0;
    let evenNul = 0;
    let oddNul = 0;
    for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0x00) {
            nulBytes++;
            if (i % 2 === 0) evenNul++;
            else oddNul++;
        }
    }
    const byteNullRatio = bytes.length ? nulBytes / bytes.length : 0;

    const candidates = ['utf-8', 'utf-16le', 'utf-16be', 'gbk']
        .map((enc) => {
            try {
                const text = new TextDecoder(enc, { fatal: false }).decode(buffer);
                let invalidCount = 0;
                let nulCount = 0;
                let ctrlCount = 0;
                for (let i = 0; i < text.length; i++) {
                    const code = text.charCodeAt(i);
                    if (code === 0xfffd) {
                        invalidCount++;
                    } else if (code === 0x0000) {
                        nulCount++;
                    } else if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
                        ctrlCount++;
                    }
                }
                let score = invalidCount * 10000 + ctrlCount * 100 + nulCount;
                const isUtf16 = enc === 'utf-16le' || enc === 'utf-16be';
                if (isUtf16) {
                    if (byteNullRatio < 0.01) score += 1000;
                    if (enc === 'utf-16le' && evenNul > oddNul) score += 50;
                    if (enc === 'utf-16be' && oddNul > evenNul) score += 50;
                }
                return { text, score, encoding: enc };
            } catch {
                return null;
            }
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score);

    if (!candidates.length) {
        throw new Error('KML 文本解码失败');
    }
    return candidates[0].text;
}

async function toArrayBuffer(input) {
    if (input instanceof ArrayBuffer) return input;

    if (typeof input === 'string') {
        const resp = await fetch(input);
        if (!resp.ok) {
            throw new Error(`下载 KMZ 失败: ${resp.status} ${resp.statusText}`);
        }
        return resp.arrayBuffer();
    }

    if (input instanceof Blob) {
        return input.arrayBuffer();
    }

    throw new Error('仅支持 File/Blob、URL 或 ArrayBuffer 作为 KMZ 输入');
}

function buildEntryMap(entries) {
    const map = new Map();
    entries.forEach((entry) => {
        map.set(normalizePath(entry.name), entry);
    });
    return map;
}

/**
 * 在 entryMap 中查找 zip 条目（多级容错：精确 → 大小写不敏感 → URL 解码）
 * @param {Map<string, object>} entryMap - normalizePath 后的路径 → JSZip entry
 * @param {string} resolvedPath - 已解析的规范路径
 * @returns {object|undefined} 命中的 zip 条目
 */
function lookupZipEntry(entryMap, resolvedPath) {
    if (entryMap.has(resolvedPath)) return entryMap.get(resolvedPath);

    const lower = resolvedPath.toLowerCase();
    for (const key of entryMap.keys()) {
        if (key.toLowerCase() === lower) return entryMap.get(key);
    }

    try {
        const decoded = decodeURIComponent(resolvedPath);
        if (decoded !== resolvedPath) {
            if (entryMap.has(decoded)) return entryMap.get(decoded);
            const decodedLower = decoded.toLowerCase();
            for (const key of entryMap.keys()) {
                if (key.toLowerCase() === decodedLower) return entryMap.get(key);
            }
        }
    } catch {
        // 非法 URL 编码，忽略
    }
    return undefined;
}

/**
 * 将 KML 中所有可解析的 href（图标、叠加影像、NetworkLink 等）重写为 blob URL。
 * 只重写能在 KMZ 压缩包内命中的相对路径资源；外部 URL / data URI / root:// 原样保留。
 * 容错：路径规范化、大小写不敏感匹配、URL 编码（%20 等）回退。
 *
 * @param {Object} params
 * @param {string} params.kmlText - KML 文本
 * @param {string} params.kmlEntryName - KML 在压缩包内的条目名（相对路径解析基准）
 * @param {Map<string, object>} params.entryMap - normalizePath 后的路径 → JSZip entry
 * @param {string[]} params.blobUrlCollector - 收集新建 blob URL，供调用方统一回收
 * @returns {Promise<string>} 重写后的 KML 文本
 */
async function rewriteKmlResourceHrefs({ kmlText, kmlEntryName, entryMap, blobUrlCollector }) {
    const xml = new DOMParser().parseFromString(kmlText, 'text/xml');
    const parseError = xml.querySelector('parsererror');
    if (parseError) return kmlText;

    const hrefNodes = Array.from(xml.getElementsByTagName('href'));
    for (const node of hrefNodes) {
        const rawHref = String(node.textContent || '').trim();
        if (!rawHref) continue;

        const resolved = resolveRelativePath(kmlEntryName, rawHref);
        const zipEntry = lookupZipEntry(entryMap, resolved);
        if (!zipEntry) continue;

        const bytes = await zipEntry.async('arraybuffer');
        const blob = new Blob([bytes], { type: detectMimeType(resolved) });
        const blobUrl = URL.createObjectURL(blob);
        blobUrlCollector.push(blobUrl);
        node.textContent = blobUrl;
    }

    return new XMLSerializer().serializeToString(xml);
}

export async function extractKmlFromKmz(kmzInput, options = {}) {
    const { rewriteResourceBlobUrls = false, debug = false } = options;

    const kmzBuffer = await toArrayBuffer(kmzInput);
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(new Uint8Array(kmzBuffer));

    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    const kmlEntries = entries.filter((entry) => /\.kml$/i.test(entry.name));
    if (!kmlEntries.length) {
        throw new Error('KMZ 中未找到 .kml 文件');
    }

    let mainKmlEntry = pickMainKmlEntry(kmlEntries);
    let kmlString = '';

    // 先解码候选 KML，再基于内容打分，避免选中空壳 doc.kml。
    const decodedCandidates = [];
    for (const entry of kmlEntries) {
        const kmlBuffer = await entry.async('arraybuffer');
        const text = decodeKmlText(kmlBuffer);
        decodedCandidates.push({
            entry,
            text,
            score: getKmlContentScore(text),
        });
    }

    decodedCandidates.sort((a, b) => b.score - a.score);
    if (decodedCandidates.length && decodedCandidates[0].score > 0) {
        mainKmlEntry = decodedCandidates[0].entry;
        kmlString = decodedCandidates[0].text;
    } else {
        const fallback =
            decodedCandidates.find((item) => item.entry.name === mainKmlEntry?.name) ||
            decodedCandidates[0];
        if (!fallback) {
            throw new Error('KMZ 中 KML 读取失败');
        }
        mainKmlEntry = fallback.entry;
        kmlString = fallback.text;
    }

    const resourceBlobUrls = [];
    if (rewriteResourceBlobUrls) {
        const entryMap = buildEntryMap(entries);
        kmlString = await rewriteKmlResourceHrefs({
            kmlText: kmlString,
            kmlEntryName: mainKmlEntry.name,
            entryMap,
            blobUrlCollector: resourceBlobUrls,
        });
    }

    if (debug && IS_DEV) {
        console.warn('[kmz-loader]', {
            mainKmlEntry: mainKmlEntry.name,
            totalEntries: entries.length,
            kmlEntryCount: kmlEntries.length,
            rewrittenResourceCount: resourceBlobUrls.length,
        });
    }

    return {
        kmlString,
        entryName: mainKmlEntry.name,
        resourceBlobUrls,
    };
}

export function useKmzLoader(options = {}) {
    const { parseKml = null, rewriteResourceBlobUrls = false, debug = false } = options;

    const isLoading = ref(false);
    const error = ref(null);
    const kmlString = ref('');
    const entryName = ref('');
    const resourceBlobUrls = ref([]);

    function revokeResourceBlobUrls() {
        resourceBlobUrls.value.forEach((u) => {
            try {
                URL.revokeObjectURL(u);
            } catch {
                // ignore
            }
        });
        resourceBlobUrls.value = [];
    }

    async function loadKmz(source, loadOptions = {}) {
        isLoading.value = true;
        error.value = null;

        revokeResourceBlobUrls();

        try {
            const result = await extractKmlFromKmz(source, {
                rewriteResourceBlobUrls:
                    loadOptions.rewriteResourceBlobUrls ?? rewriteResourceBlobUrls,
                debug: loadOptions.debug ?? debug,
            });

            kmlString.value = result.kmlString;
            entryName.value = result.entryName;
            resourceBlobUrls.value = result.resourceBlobUrls;

            if (typeof parseKml === 'function') {
                await parseKml(result.kmlString);
            }

            return result.kmlString;
        } catch (err) {
            error.value = err;
            throw err;
        } finally {
            isLoading.value = false;
        }
    }

    return {
        isLoading,
        error,
        kmlString,
        entryName,
        resourceBlobUrls,
        loadKmz,
        extractKmlFromKmz,
        revokeResourceBlobUrls,
    };
}
