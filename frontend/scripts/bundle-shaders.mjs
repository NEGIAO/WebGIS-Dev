// bundle-shaders.mjs — 体积云 shader bundle 生成器（真源 → 副本单向同步）
//
// 真源:src/domains/cesium/modules/cloud/lib/AtmosphereFromThreeGeospatial/Shaders/
// 副本①:src/domains/cesium/modules/cloud/lib/shaders/bundledShaders.js(运行时唯一真源,
//        shaderLoader.js bundle 优先命中,fetch 仅回退)
// 副本②:public/cloud-atmosphere/shaders/(fetch 回退镜像)
//
// 背景(V3.5.28):上版白蒙版修复写入源 .frag 后因 bundle 过期未生效——多副本无同步机制。
// 本脚本补齐机制缺口并自动化:
//   1) vite.config.js 配置求值时调用 bundleShaders()——dev / build / build:* 全自动再生,
//      「改了源忘跑脚本」不再可能产生漂移;
//   2) --check 模式只校验不写盘,漂移时报 exit 1——供 CI(deploy.yml)与本地门禁使用;
//   3) 可独立运行:node scripts/bundle-shaders.mjs [--check]
//
// 输出确定性:CRLF→LF 统一、无时间戳字段,同内容 → 同产物,git 无噪声 diff。
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

function resolveFrontendRoot() {
  const candidates = [join(scriptDir, '..'), join(scriptDir, '..', '..')];
  const found = candidates.find((p) => statSync(p, { throwIfNoEntry: false })?.isDirectory());
  if (!found) {
    throw new Error('无法定位 frontend 目录');
  }
  return found;
}

const SHADERS_REL = 'src/domains/cesium/modules/cloud/lib/AtmosphereFromThreeGeospatial/Shaders';
const BUNDLE_REL = 'src/domains/cesium/modules/cloud/lib/shaders/bundledShaders.js';
const MIRROR_REL = 'public/cloud-atmosphere/shaders';
const SHADER_EXT = /\.(glsl|frag|vert)$/;

/** @returns {{name: string, body: string}[]} name 为 POSIX 相对路径,body 已统一 LF */
export function collectShaders(frontendRoot) {
  const shadersDir = join(frontendRoot, SHADERS_REL);
  /** @type {{name: string, body: string}[]} */
  const entries = [];
  (function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (SHADER_EXT.test(name)) {
        entries.push({
          name: relative(shadersDir, full).split(sep).join('/'),
          // 统一 LF,避免 CRLF 进入 bundle 后 diff 噪声
          body: readFileSync(full, 'utf8').replace(/\r\n/g, '\n'),
        });
      }
    }
  })(shadersDir);
  return entries;
}

function renderBundle(entries) {
  const banner = `/**
 * 自动生成的内联 shader 模块,请勿手动编辑。
 * 再生:vite.config.js 求值时自动执行;亦可手动 node frontend/scripts/bundle-shaders.mjs
 * 校验:node frontend/scripts/bundle-shaders.mjs --check(CI 门禁用)
 * 真源:src/domains/cesium/modules/cloud/lib/AtmosphereFromThreeGeospatial/Shaders/
 */

/** @type {Readonly<Record<string, string>>} */
export const BUNDLED_SHADERS = {
`;
  const body = entries
    .map(({ name, body: b }) => `  ${JSON.stringify(name)}: ${JSON.stringify(b)},`)
    .join('\n');
  return `${banner}${body}\n};\n`;
}

const normalizeLF = (text) => text.replace(/\r\n/g, '\n');

/**
 * 生成(或校验)shader bundle 与 public 镜像。
 * @param {{check?: boolean}} [options] check=true 时只校验不写盘
 * @returns {{ok: boolean, count: number, drifts: string[]}}
 */
export function bundleShaders({ check = false } = {}) {
  const frontendRoot = resolveFrontendRoot();
  const entries = collectShaders(frontendRoot);
  if (entries.length === 0) {
    throw new Error(`Shaders 目录为空或不存在:${join(frontendRoot, SHADERS_REL)}`);
  }

  const bundleText = renderBundle(entries);
  const bundlePath = join(frontendRoot, BUNDLE_REL);
  const mirrorDir = join(frontendRoot, MIRROR_REL);

  /** @type {string[]} */
  const drifts = [];

  const expectFile = (label, filePath, expectedText) => {
    let actual = null;
    try {
      actual = normalizeLF(readFileSync(filePath, 'utf8'));
    } catch {
      /* 缺失按漂移处理 */
    }
    if (actual !== expectedText) {
      drifts.push(`${label} 与真源不一致(或缺失):${relative(frontendRoot, filePath)}`);
    }
  };

  expectFile('bundle', bundlePath, bundleText);
  for (const { name, body } of entries) {
    expectFile('镜像', join(mirrorDir, ...name.split('/')), `${body}`);
  }
  // 镜像中不应存在真源没有的多余 shader 文件(删除源文件后遗留的陈旧副本)
  if (drifts.length === 0) {
    (function walkMirror(dir) {
      for (const name of readdirSync(dir).sort()) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          walkMirror(full);
        } else if (SHADER_EXT.test(name)) {
          const rel = relative(mirrorDir, full).split(sep).join('/');
          if (!entries.some((e) => e.name === rel)) {
            drifts.push(`镜像存在真源已删除的陈旧副本:${rel}`);
          }
        }
      }
    })(mirrorDir);
  }

  if (check) {
    if (drifts.length > 0) {
      console.error(`[shader-bundle] 漂移检测失败(${drifts.length} 处),请执行:npm run shaders`);
      for (const d of drifts) console.error(`[shader-bundle]   - ${d}`);
      return { ok: false, count: entries.length, drifts };
    }
    console.log(`[shader-bundle] 校验通过:${entries.length} 个 shader 的 bundle 与 public 镜像均一致`);
    return { ok: true, count: entries.length, drifts };
  }

  writeFileSync(bundlePath, bundleText, 'utf8');
  for (const { name, body } of entries) {
    const target = join(mirrorDir, ...name.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body, 'utf8');
  }
  // 清理镜像中真源已删除的陈旧副本,保持「镜像 = 真源」严格等价
  const removed = [];
  (function pruneMirror(dir) {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        pruneMirror(full);
      } else if (SHADER_EXT.test(name)) {
        const rel = relative(mirrorDir, full).split(sep).join('/');
        if (!entries.some((e) => e.name === rel)) {
          rmSync(full);
          removed.push(rel);
        }
      }
    }
  })(mirrorDir);

  console.log(
    `[shader-bundle] 已同步 ${entries.length} 个 shader → ${BUNDLE_REL} + ${MIRROR_REL}/` +
      (removed.length ? `(清理陈旧副本 ${removed.length} 个)` : ''),
  );
  return { ok: true, count: entries.length, drifts: [] };
}

// 独立运行入口:node scripts/bundle-shaders.mjs [--check]
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  try {
    const result = bundleShaders({ check });
    if (!result.ok) process.exitCode = 1;
  } catch (e) {
    console.error(`[shader-bundle] ${e.message}`);
    process.exitCode = 1;
  }
}
