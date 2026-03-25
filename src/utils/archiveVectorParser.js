function decodeBufferWithFallback(arrayBuffer) {
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuffer);
    if (!utf8.includes('\uFFFD')) return utf8;
    try {
        return new TextDecoder('gbk', { fatal: false }).decode(arrayBuffer);
    } catch {
        return utf8;
    }
}

function getPreferredKmlEntry(entries) {
    if (!entries.length) return null;
    return entries.find((entry) => entry.name.split('/').pop()?.toLowerCase() === 'doc.kml')
        || entries.slice().sort((a, b) => a.name.length - b.name.length)[0];
}

function findMatchingSidecar(entries, shpEntry, ext) {
    const shpPath = shpEntry.name;
    const dotIdx = shpPath.lastIndexOf('.');
    const shpStem = dotIdx >= 0 ? shpPath.slice(0, dotIdx) : shpPath;

    return entries.find((entry) => {
        if (entry.dir) return false;
        const lower = entry.name.toLowerCase();
        if (!lower.endsWith(`.${ext}`)) return false;
        const idx = entry.name.lastIndexOf('.');
        const stem = idx >= 0 ? entry.name.slice(0, idx) : entry.name;
        return stem === shpStem;
    }) || null;
}

async function readEntryArrayBuffer(entry) {
    return entry.async('arraybuffer');
}

async function readEntryText(entry) {
    const buf = await readEntryArrayBuffer(entry);
    return decodeBufferWithFallback(buf);
}

export async function extractArchiveVectorPayload(archiveBuffer, JSZipCtor) {
    if (!(archiveBuffer instanceof ArrayBuffer)) {
        throw new Error('压缩包数据无效');
    }

    const zip = await JSZipCtor.loadAsync(new Uint8Array(archiveBuffer));
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);

    const kmlEntries = entries.filter((entry) => entry.name.toLowerCase().endsWith('.kml'));
    if (kmlEntries.length) {
        const kmlEntry = getPreferredKmlEntry(kmlEntries);
        const text = await readEntryText(kmlEntry);
        return {
            kind: 'kml',
            kmlText: text,
            entryName: kmlEntry.name
        };
    }

    const shpEntries = entries.filter((entry) => entry.name.toLowerCase().endsWith('.shp'));
    if (shpEntries.length) {
        const shpEntry = shpEntries[0];
        const dbfEntry = findMatchingSidecar(entries, shpEntry, 'dbf');
        const prjEntry = findMatchingSidecar(entries, shpEntry, 'prj');
        const cpgEntry = findMatchingSidecar(entries, shpEntry, 'cpg');

        const shp = await readEntryArrayBuffer(shpEntry);
        const dbf = dbfEntry ? await readEntryArrayBuffer(dbfEntry) : undefined;
        const prj = prjEntry ? await readEntryText(prjEntry) : undefined;
        const cpg = cpgEntry ? await readEntryText(cpgEntry) : undefined;

        return {
            kind: 'shp',
            shpParts: {
                shp,
                dbf,
                prj,
                cpg
            },
            entryName: shpEntry.name
        };
    }

    throw new Error('压缩包内未找到可解析的 KML 或 SHP 数据');
}
