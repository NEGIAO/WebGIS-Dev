import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';
import { visualizer } from 'rollup-plugin-visualizer';
import { generateShareDataManifest } from './scripts/generate-sharedata-manifest.mjs';
import { bundleShaders } from './scripts/bundle-shaders.mjs';

/**
 * 解析 .env 文件为 key-value 对象（支持基础单双引号、行尾注释）
 */
function parseEnvFile(filePath) {
    const env = {};
    if (!fs.existsSync(filePath)) return env;
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || !line.includes('=')) continue;
        const eqIdx = line.indexOf('=');
        const key = line.slice(0, eqIdx).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
        let value = line.slice(eqIdx + 1).trim();
        // 去除行尾注释（未被引号包裹的 #）
        let quote = '';
        for (let i = 0; i < value.length; i++) {
            const ch = value[i];
            if (ch === '\\') {
                i++;
                continue;
            }
            if (ch === '"' || ch === "'") {
                if (!quote) quote = ch;
                else if (quote === ch) quote = '';
            } else if (ch === '#' && !quote) {
                value = value.slice(0, i).trim();
                break;
            }
        }
        // 去引号
        if (
            value.length >= 2 &&
            value[0] === value[value.length - 1] &&
            (value[0] === '"' || value[0] === "'")
        ) {
            value = value.slice(1, -1);
        }
        env[key] = value;
    }
    return env;
}

/**
 * 双 env 文件插件
 *
 * 架构（L1 不涉密，两个文件都提交 git）：
 *   .env       → 部署环境（npm run build 读取）
 *   .env.local → 本地开发（npm run dev 读取）
 *
 * Vite 默认会在所有模式下同时加载 .env + .env.local，
 * 本插件禁用默认加载，改为按 mode 二选一。
 */
function selectiveEnvPlugin() {
    return {
        name: 'selective-env',
        config(config, { mode }) {
            const envDir = fileURLToPath(new URL('../deploy', import.meta.url)); // 环境文件已收敛至 deploy/
            const isProd = mode === 'production';
            const envFile = isProd ? '.env' : '.env.local';
            const env = parseEnvFile(path.resolve(envDir, envFile));

            // 仅暴露 VITE_ 前缀变量（与 Vite 原生行为一致）
            const prefixedEnv = {};
            for (const [key, value] of Object.entries(env)) {
                if (key.startsWith('VITE_')) {
                    prefixedEnv[`import.meta.env.${key}`] = JSON.stringify(value);
                }
            }

            return {
                define: {
                    ...(config.define || {}),
                    ...prefixedEnv,
                },
            };
        },
    };
}

export default defineConfig(({ command, mode }) => {
    // 环境判断
    const isBuild = command === 'build';
    const isAnalyze = mode === 'analyze';
    const isProductionLikeBuild = isBuild && mode !== 'development';

    // 双 env 文件架构（两个文件都提交 git，L1 不涉密）：
    //   .env       → 部署环境（npm run build 读取）
    //   .env.local → 本地开发（npm run dev 读取）
    const envDir = fileURLToPath(new URL('../deploy', import.meta.url)); // 环境文件已收敛至 deploy/
    const isProd = mode === 'production';
    const activeEnvFile = isProd ? '.env' : '.env.local';
    const env = parseEnvFile(path.resolve(envDir, activeEnvFile));

    // 刷新 public/ShareData/manifest.json(共享资源清单;dev 与所有 build 脚本统一生效)
    // 替代旧 import.meta.glob 方案,详见 scripts/generate-sharedata-manifest.mjs 头注释
    generateShareDataManifest();

    // 再生体积云 shader bundle 与 public 镜像(真源 Shaders/ → bundledShaders.js + 镜像;
    // dev 与所有 build 脚本统一生效,杜绝「改源忘跑 bundle 脚本」漂移,
    // 详见 scripts/bundle-shaders.mjs 头注释;CI 另有 --check 门禁步)
    bundleShaders();

    // 项目基础路径（从当前环境文件读取，缺省相对路径）
    const baseUrl = env.VITE_BASE_URL || './';

    // 从 README.md 提取版本号（构建时自动同步，LLM 更新 README 后无需手动维护 Vue 侧版本）
    const readmePath = fileURLToPath(new URL('../README.md', import.meta.url));
    let appDisplayVersion = 'V0.0.0';
    try {
        const readmeContent = fs.readFileSync(readmePath, 'utf-8');
        const match = readmeContent.match(/当前版本[^\d]*(\d+\.\d+\.\d+)/);
        if (match) {
            appDisplayVersion = `V${match[1]}`;
        }
    } catch (e) {
        console.warn(`[vite] 无法读取 README.md 提取版本：${e.message}`);
    }

    return {
        base: baseUrl,

        // 禁用 Vite 默认的 .env 加载（改由 selectiveEnvPlugin 按 mode 二选一读取）。
        // Vite 8 起 `envFile: false` 已弃用，官方替代写法是 `envDir: false`：
        // 语义同为"不自动加载任何 .env"。注意上面的 `envDir` 常量仍指向 deploy/，
        // 供插件内部 parseEnvFile 使用，与此处的 Vite 选项互不影响。
        envDir: false,

        // 构建时注入全局常量 __APP_VERSION__（值从 README.md 自动提取）
        define: {
            __APP_VERSION__: JSON.stringify(appDisplayVersion),
        },

        // 插件配置
        plugins: [
            vue(),
            selectiveEnvPlugin(),
            command === 'serve' && vueDevTools(),
            isAnalyze &&
                visualizer({
                    filename: 'stats.html',
                    template: 'treemap',
                    gzipSize: true,
                    brotliSize: true,
                    open: false,
                }),
        ].filter(Boolean),

        // 路径别名：@ 指向 src
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url)),
                '@domains': fileURLToPath(new URL('./src/domains', import.meta.url)),
                '@ol': fileURLToPath(new URL('./src/domains/ol', import.meta.url)),
                '@cesium-domain': fileURLToPath(new URL('./src/domains/cesium', import.meta.url)),
                '@common': fileURLToPath(new URL('./src/domains/common', import.meta.url)),
                // Cesium ESM 垫片：将 `import { ... } from "cesium"` 映射到 window.Cesium（CDN 全局变量）
                // 避免 npm cesium 包与 CDN cesium 产生双实例冲突
                cesium: fileURLToPath(new URL('./src/cesium-shim.js', import.meta.url)),
            },
        },

        // 开发服务器代理（解决高德 API 跨域）
        // 开发服务器代理（解决高德 API 跨域与局域网移动端调试）
        // 开发服务器代理（解决高德 API 跨域、Docker 后端转发与移动端调试）
        server: {
            host: '0.0.0.0',
            port: 5173,
            // 固定端口：5173 被占时直接报错退出，禁止静默漂到 5174+。
            // 手机/平板书签和局域网调试都依赖固定端口；僵尸进程由 predev 脚本清理。
            strictPort: true,
            cors: true,
            proxy: (() => {
                // 与生产 nginx 同构的后端顶级段全部原样透传（零改写），
                // 瓦片代理 URL 中的百分号编码因此无损到达后端。
                // 本机原生 dev 默认指向本机 Docker 后端(7860)；
                // 容器内 dev 由 compose 注入 VITE_DEV_PROXY_TARGET=http://api:7860
                const backend = process.env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:7860';
                const routes = {};
                for (const prefix of ['/api', '/proxy', '/tiles', '/monitor']) {
                    routes[prefix] = { target: backend, changeOrigin: true };
                }
                // 高德 API 代理
                routes['/amap-api'] = {
                    target: 'https://restapi.amap.com',
                    changeOrigin: true,
                    secure: true,
                    rewrite: (path) => path.replace(/^\/amap-api/, ''),
                };
                return routes;
            })(),
            // 允许任意 Host：局域网真机调试(手机连电脑 WiFi 用 IP 访问)、内网穿透等。
            // 仅 dev server 本地工具链使用，不随生产构建走
            allowedHosts: true,

            // 文件监听：容器内 Windows bind mount 的 inotify 不触发，
            // compose 注入 VITE_WATCH_USEPOLLING=1 启用轮询（原生 dev 保持事件模式）。
            // 轮询跨挂载盘代价高：interval 放宽到秒级、排除大体积静态目录，
            // 否则扫描风暴会拖慢所有请求（实测首页 17s）
            watch: {
                usePolling: process.env.VITE_WATCH_USEPOLLING === '1',
                interval: Number(process.env.VITE_WATCH_INTERVAL || 300),
                ignored: ['**/public/**', '**/dist/**', '**/node_modules/**', '**/.*'],
            },
        },

        // 排除 Cesium npm 包的预构建，避免与 CDN Cesium 产生双实例
        optimizeDeps: {
            exclude: ['cesium'],
        },

        // Web Worker 配置：使用 ES 模块格式（支持 code-splitting）
        worker: {
            format: 'es',
        },

        // 构建配置
        build: {
            sourcemap: !isProductionLikeBuild,
            // Vite 8 起 rolldown/oxc 取代 esbuild：esbuild 压缩器已废弃且不再内置，
            // 而 oxc 压缩器不支持 drop console/debugger。为保留原有的生产日志剥离行为，
            // 改用 Vite 8 仍原生支持的 terser（terserOptions 见下方）。
            minify: 'terser',
            chunkSizeWarningLimit: 300,
            terserOptions: {
                compress: {
                    drop_console: true,
                    drop_debugger: true,
                },
                format: {
                    comments: false,
                },
            },

            // 模块预加载：交给 rolldown 默认分组后，重库（geotiff / echarts / three / rapier…）
            // 天然落在按需分片里，不会进入入口的预加载图，因此原先那份按 vendor-* 名称
            // 过滤的白名单已失效（默认分组不再产出这些名字），一并移除，避免留下死配置。
            // 实测默认分组下首屏预加载仅 10 个分片、合计约 53 kB(gzip)。
            modulePreload: {
                polyfill: true,
            },

            // 产物命名与分包：分包交给 rolldown 默认策略（见下方 manualChunks 移除说明），
            // 此处只保留一项必需约束 —— chunk 文件名不得以下划线开头（Jekyll 会丢弃）。
            rollupOptions: {
                output: {
                    /**
                     * GitHub Pages 默认以 Jekyll 构建，而 Jekyll **会丢弃文件名以 `_` 开头的产物**
                     * （`EntryFilter#special?` 对 `.` 与 `_` 前缀一律排除；只有仓库**根目录**的
                     * `.nojekyll` 才能关闭该行为，子目录里的 `.nojekyll` 无效）。
                     *
                     * 典型受害者是 `@vitejs/plugin-vue` 为异步 SFC 生成的
                     * `assets/_plugin-vue_export-helper-<hash>.js`：入口 chunk 会 import 它，
                     * 但站点上返回 404 → 整个 SPA 白屏，且报错形如
                     * `net::ERR_ABORTED 404 (Not Found)`。
                     *
                     * 这里统一剥掉 chunk 名的前导下划线，从构建侧根治，不再依赖部署端的 Jekyll 配置。
                     */
                    chunkFileNames: (chunkInfo) =>
                        `assets/${String(chunkInfo.name || 'chunk').replace(/^_+/, '')}-[hash].js`,
                    // ── 手工 manualChunks 已移除（2026-10-31，Vite 8 / rolldown）────────────
                    //
                    // 原策略按包名切成 vendor-ol-all / vendor-geotiff / vendor-echarts-all 等 20 余个
                    // 命名 chunk。该策略在 Vite 6（Rollup）下成立，但本项目已升级到 Vite 8 + rolldown，
                    // 实测分组语义与 Rollup 不同：多个 manual 分组被合并，且**应用模块被塞进以第三方库
                    // 命名的 chunk**。可复现证据（改前产物）：
                    //   · vendor-geotiff-*.js（591 kB）内部同时含 api/backend/admin.js 等应用模块；
                    //   · 入口 chunk 因此静态 import 了这个 591 kB blob —— 落地页被迫下载约 218 kB
                    //     （gzip）的栅格解析代码，而首屏完全用不到；
                    //   · vendor-lucide-*.js（120 kB）实际装的是 Vue 运行时 + 图标，vendor-vue 里
                    //     只剩 vue-router，chunk 名与内容已不对应。
                    //
                    // 处置：交回 rolldown 默认分组（按动态 import 边界切分 + 共享依赖提升）。
                    // 对照实测（同一份源码）：
                    //   手工分组：入口 108.8 kB(gzip 31.8) + 预加载 92 kB + 额外 218 kB geotiff
                    //   默认分组：入口 187.5 kB(gzip 约 55) + 预加载 53 kB，入口不含 geotiff
                    // 首屏总传输约降到三分之一，且不再有「重库被拉进入口」的结构性风险。
                    //
                    // 代价：chunk 数由 108 增至约 152（按需请求扇出略增）。对首屏无影响——首屏只关心
                    // 入口 + 预加载图；按需分片只在用户触发对应功能时才请求。
                    // 若后续需重新按包分组，应改用 rolldown 的 output.advancedChunks，而非 Rollup 时代
                    // 的 manualChunks。
                },
            },
        },
    };
});
