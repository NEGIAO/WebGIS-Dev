import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, 'docs', 'BOUNDARY_INDEX.md');

const TARGETS = [
    {
        title: 'Stores',
        dir: 'src/stores',
        exts: new Set(['.ts', '.js'])
    },
    {
        title: 'Constants',
        dir: 'src/constants',
        exts: new Set(['.ts', '.js'])
    },
    {
        title: 'Map Features',
        dir: 'src/composables/map/features',
        exts: new Set(['.ts', '.js'])
    }
];

async function listFilesRecursive(baseDir, exts) {
    const absDir = path.join(ROOT, baseDir);
    const out = [];

    async function walk(currentAbs, currentRel) {
        const entries = await readdir(currentAbs, { withFileTypes: true });
        for (const entry of entries) {
            const nextAbs = path.join(currentAbs, entry.name);
            const nextRel = currentRel ? `${currentRel}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                await walk(nextAbs, nextRel);
                continue;
            }
            const ext = path.extname(entry.name).toLowerCase();
            if (!exts.has(ext)) continue;
            out.push(`${baseDir}/${nextRel}`);
        }
    }

    await walk(absDir, '');
    out.sort((a, b) => a.localeCompare(b, 'en'));
    return out;
}

function buildMarkdown(sections) {
    const generatedAt = new Date().toISOString();
    const lines = [];

    lines.push('# Boundary Index');
    lines.push('');
    lines.push('This file is auto-generated. Do not edit manually.');
    lines.push('');
    lines.push(`Generated at: ${generatedAt}`);
    lines.push('');

    for (const section of sections) {
        lines.push(`## ${section.title}`);
        lines.push('');
        if (!section.files.length) {
            lines.push('- (empty)');
            lines.push('');
            continue;
        }
        for (const file of section.files) {
            lines.push(`- ${file}`);
        }
        lines.push('');
    }

    lines.push('## Usage');
    lines.push('');
    lines.push('- Run `npm run docs:index` to refresh this index.');
    lines.push('');

    return `${lines.join('\n')}`;
}

async function main() {
    const sections = [];

    for (const target of TARGETS) {
        const files = await listFilesRecursive(target.dir, target.exts);
        sections.push({ title: target.title, files });
    }

    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, buildMarkdown(sections), 'utf8');
    console.log(`Boundary index generated: ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
