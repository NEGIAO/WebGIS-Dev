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
 * 判断模块是否来自指定 node_modules 包
 */
function isNodeModulePackage(id, pkgName) {
    return id.includes(`/node_modules/${pkgName}/`) || id.includes(`\\node_modules\\${pkgName}\\`);
}

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
            const envDir = fileURLToPath(new URL('..', import.meta.url));
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
    const envDir = fileURLToPath(new URL('..', import.meta.url));
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

        // env 文件目录 = 仓库根
        envDir,

        // 禁用 Vite 默认的 .env 加载（由 selectiveEnvPlugin 替代）
        envFile: false,

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
            cors: true,
            proxy: {
                // 1. 添加后端 Docker 服务的代理路径（按需要自定义前缀，如 /api）
                '/api': {
                    target: 'http://127.0.0.1:7860',
                    // 转发给电脑本地 Docker 暴露的端口，适用于内网穿透、局域网调试等场景
                    // 无需暴露后端端口到公网，避免安全风险
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api/, ''), // 剥离 /api 前缀，直接传给后端
                },
                // 2. 高德 API 代理
                '/amap-api': {
                    target: 'https://restapi.amap.com',
                    changeOrigin: true,
                    secure: true,
                    rewrite: (path) => path.replace(/^\/amap-api/, ''),
                },
            },
            allowedHosts: ['demo.negiao.cn', 'localhost', '127.0.0.1', 'negiao.cn', 'webgis.negiao.cn'],
            // 允许局域网、内网穿透访问（如 ngrok、frp、Cf tunnel 等），便于移动端调试
        },

        // 排除 Cesium npm 包的预构建，避免与 CDN Cesium 产生双实例
        optimizeDeps: {
            exclude: ['cesium'],
        },

        // 生产环境代码压缩配置
        esbuild: isProductionLikeBuild
            ? {
                  drop: ['console', 'debugger'],
                  legalComments: 'none',
              }
            : undefined,

        // Web Worker 配置：使用 ES 模块格式（支持 code-splitting）
        worker: {
            format: 'es',
        },

        // 构建配置
        build: {
            sourcemap: !isProductionLikeBuild,
            minify: 'esbuild',
            chunkSizeWarningLimit: 300,

            // 模块预加载：只预加载首屏关键 chunk，避免浏览器提前下载懒加载模块
            // 过滤掉 geotiff/lerc/jszip/proj4/codec 等非首屏 chunk（节省 ~594 KB 首屏传输）
            modulePreload: {
                polyfill: true,
                resolveDependencies: (filename, deps) => {
                    const SKIP_PRELOAD_CHUNKS = [
                        'vendor-geotiff',
                        'vendor-lerc',
                        'vendor-jszip',
                        'vendor-shpjs',
                        'vendor-proj4',
                        'vendor-codec',
                        'vendor-echarts-all',
                        'vendor-three',
                        'vendor-rapier',
                        'vendor-hljs',
                        'vendor-marked',
                        'vendor-lilgui',
                        'vendor-loaders',
                        'vendor-cesium-deps',
                        'vendor-planar-route',
                    ];
                    return deps.filter(
                        (dep) => !SKIP_PRELOAD_CHUNKS.some((name) => dep.includes(name)),
                    );
                },
            },

            // Rollup 分包策略：按功能拆分，避免单个 chunk 过大
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        if (id.includes('vite/preload-helper')) return 'vendor-runtime';
                        if (!id.includes('node_modules')) return undefined;

                        // 地图引擎（排除 GeoTIFF 相关模块，它们随 geotiff chunk 懒加载）
                        if (
                            isNodeModulePackage(id, 'ol') &&
                            !id.includes('ol/source/GeoTIFF') &&
                            !id.includes('ol/source/DataTile')
                        )
                            return 'vendor-ol-all';
                        // 图表库（~543KB）
                        if (
                            isNodeModulePackage(id, 'echarts') ||
                            isNodeModulePackage(id, 'zrender')
                        )
                            return 'vendor-echarts-all';
                        // GeoTIFF 解析（~316KB）
                        if (isNodeModulePackage(id, 'geotiff')) return 'vendor-geotiff';
                        // OL 的 GeoTIFF/DataTile source 随 geotiff 一起懒加载（避免拉入首屏）
                        if (id.includes('ol/source/GeoTIFF') || id.includes('ol/source/DataTile'))
                            return 'vendor-geotiff';
                        // zstd 解码器(geotiff 传递依赖;此前漏配落入 vendor-libs 兜底桶被入口预加载,gzip 63KB)
                        if (isNodeModulePackage(id, 'zstddec')) return 'vendor-geotiff';
                        // LERC 栅格解码
                        if (isNodeModulePackage(id, 'lerc')) return 'vendor-lerc';
                        // 压缩库
                        if (isNodeModulePackage(id, 'jszip')) return 'vendor-jszip';
                        if (isNodeModulePackage(id, 'shpjs')) return 'vendor-shpjs';
                        // 坐标投影
                        if (isNodeModulePackage(id, 'proj4')) return 'vendor-proj4';
                        // HTTP 客户端
                        if (isNodeModulePackage(id, 'axios')) return 'vendor-axios';
                        // Three.js（仅 ShallowWater 使用，~700KB）
                        if (isNodeModulePackage(id, 'three')) return 'vendor-three';
                        // Rapier 物理引擎（仅 PlayerController 使用，~300KB）
                        if (isNodeModulePackage(id, '@dimforge/rapier3d-compat'))
                            return 'vendor-rapier';
                        // highlight.js 代码高亮（仅 AI 聊天使用，~350KB）
                        if (isNodeModulePackage(id, 'highlight.js')) return 'vendor-hljs';
                        // Markdown 渲染（仅 AI 聊天使用）
                        if (
                            isNodeModulePackage(id, 'marked') ||
                            isNodeModulePackage(id, 'dompurify')
                        )
                            return 'vendor-marked';
                        // 图标库（tree-shake 后仅保留使用到的图标）
                        if (isNodeModulePackage(id, '@lucide/vue')) return 'vendor-lucide';
                        // 压缩/解码（仅瓦片模块使用）
                        if (
                            isNodeModulePackage(id, 'pako') ||
                            isNodeModulePackage(id, 'protobufjs') ||
                            isNodeModulePackage(id, 'zstd-codec')
                        )
                            return 'vendor-codec';
                        // lil-gui 控件（仅 Cesium 面板使用）
                        if (isNodeModulePackage(id, 'lil-gui')) return 'vendor-lilgui';
                        // 3D 模型加载器（仅 Cesium PlayerController 使用，~340KB）
                        if (id.includes('@loaders.gl')) return 'vendor-loaders';
                        // Cesium 生态依赖(knockout 供 cesium-shim/navigation;math.gl/probe.gl 供 loaders.gl)
                        // 独立成懒加载 chunk,避免混入 vendor-libs 兜底桶被入口预加载(gzip 约 45KB)
                        if (
                            isNodeModulePackage(id, 'knockout') ||
                            id.includes('@math.gl') ||
                            id.includes('@probe.gl')
                        ) {
                            return 'vendor-cesium-deps';
                        }
                        // Vue 核心框架
                        if (
                            isNodeModulePackage(id, 'vue') ||
                            isNodeModulePackage(id, '@vue') ||
                            isNodeModulePackage(id, 'vue-router') ||
                            isNodeModulePackage(id, 'pinia')
                        ) {
                            return 'vendor-vue';
                        }
                        // 通知/消息库（独立 chunk，避免混入 vendor-libs）
                        if (
                            isNodeModulePackage(id, 'vue-toastification') ||
                            isNodeModulePackage(id, 'vue3-toastify')
                        ) {
                            return 'vendor-toast';
                        }
                        // 面状航线模块依赖（独立懒加载 chunk，避免混入 vendor-libs 兜底桶被入口预加载）
                        if (
                            isNodeModulePackage(id, '@turf') ||
                            isNodeModulePackage(id, '@cesium-extends')
                        ) {
                            return 'vendor-planar-route';
                        }
                        // 剩余 node_modules（小库合集）
                        return 'vendor-libs';
                    },
                },
            },
        },
    };
});
