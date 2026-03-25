import { ref } from 'vue';

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const IS_DEV = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;

function normalizePath(path) {
    return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function splitDirAndFile(path) {
    const normalized = normalizePath(path);
    const idx = normalized.lastIndexOf('/');
    if (idx < 0) return { dir: '', file: normalized };
    return {
        dir: normalized.slice(0, idx),
        file: normalized.slice(idx + 1)
    };
}

function resolveRelativePath(basePath, relativePath) {
    const rel = normalizePath(relativePath);
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

function detectMimeType(path) {
    const lower = String(path || '').toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.bmp')) return 'image/bmp';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    return 'application/octet-stream';
}

function pickMainKmlEntry(entries) {
    if (!entries.length) return null;

    const docKml = entries.find((entry) => splitDirAndFile(entry.name).file.toLowerCase() === 'doc.kml');
    if (docKml) return docKml;

    return entries
        .slice()
        .sort((a, b) => {
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
    const pointLinePolygonCount = countByRegex(content, /<\s*(?:[\w-]+:)?(?:Point|LineString|Polygon)\b/gi);
    const documentCount = countByRegex(content, /<\s*(?:[\w-]+:)?Document\b/gi);

    // 优先保证“有可渲染要素”的 KML 胜出，其次再看体量。
    return (
        placemarkCount * 1000
        + coordinatesCount * 300
        + pointLinePolygonCount * 120
        + documentCount * 20
        + Math.min(content.length, 5000)
    );
}

function tryDecode(buffer, encoding) {
    try {
        const text = new TextDecoder(encoding, { fatal: false }).decode(buffer);
        const invalidCount = (text.match(/\uFFFD/g) || []).length;
        return { text, invalidCount, encoding };
    } catch {
        return null;
    }
}

function decodeKmlText(buffer) {
    const candidates = ['utf-8', 'utf-16le', 'utf-16be', 'gbk']
        .map((enc) => tryDecode(buffer, enc))
        .filter(Boolean)
        .sort((a, b) => a.invalidCount - b.invalidCount);

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

async function rewriteKmlImageHrefs({ kmlText, kmlEntryName, entryMap, blobUrlCollector }) {
    const xml = new DOMParser().parseFromString(kmlText, 'text/xml');
    const parseError = xml.querySelector('parsererror');
    if (parseError) return kmlText;

    const hrefNodes = Array.from(xml.getElementsByTagName('href'));
    for (const node of hrefNodes) {
        const rawHref = String(node.textContent || '').trim();
        if (!rawHref || !IMAGE_EXT_RE.test(rawHref)) continue;

        const resolved = resolveRelativePath(kmlEntryName, rawHref);
        const zipEntry = entryMap.get(resolved);
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
    const {
        rewriteResourceBlobUrls = false,
        debug = false
    } = options;

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
            score: getKmlContentScore(text)
        });
    }

    decodedCandidates.sort((a, b) => b.score - a.score);
    if (decodedCandidates.length && decodedCandidates[0].score > 0) {
        mainKmlEntry = decodedCandidates[0].entry;
        kmlString = decodedCandidates[0].text;
    } else {
        const fallback = decodedCandidates.find((item) => item.entry.name === mainKmlEntry?.name) || decodedCandidates[0];
        if (!fallback) {
            throw new Error('KMZ 中 KML 读取失败');
        }
        mainKmlEntry = fallback.entry;
        kmlString = fallback.text;
    }

    const resourceBlobUrls = [];
    if (rewriteResourceBlobUrls) {
        const entryMap = buildEntryMap(entries);
        kmlString = await rewriteKmlImageHrefs({
            kmlText: kmlString,
            kmlEntryName: mainKmlEntry.name,
            entryMap,
            blobUrlCollector: resourceBlobUrls
        });
    }

    if (debug && IS_DEV) {
        console.info('[kmz-loader]', {
            mainKmlEntry: mainKmlEntry.name,
            totalEntries: entries.length,
            kmlEntryCount: kmlEntries.length,
            rewrittenResourceCount: resourceBlobUrls.length
        });
    }

    return {
        kmlString,
        entryName: mainKmlEntry.name,
        resourceBlobUrls
    };
}

export function useKmzLoader(options = {}) {
    const {
        parseKml = null,
        rewriteResourceBlobUrls = false,
        debug = false
    } = options;

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
                rewriteResourceBlobUrls: loadOptions.rewriteResourceBlobUrls ?? rewriteResourceBlobUrls,
                debug: loadOptions.debug ?? debug
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
        revokeResourceBlobUrls
    };
}
