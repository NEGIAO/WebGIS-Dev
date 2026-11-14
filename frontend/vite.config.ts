import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type ConfigEnv, type UserConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';
import { visualizer } from 'rollup-plugin-visualizer';
import { generateShareDataManifest } from './scripts/generate-sharedata-manifest.mjs';
import { bundleShaders } from './scripts/bundle-shaders.mjs';

// 解析 .env 为 kv，支持引号与行尾注释
function parseEnvFile(filePath: string): Record<string, string> {
    const env: Record<string, string> = {};
    if (!fs.existsSync(filePath)) return env;
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || !line.includes('=')) continue;
        const eqIdx = line.indexOf('=');
        const key = line.slice(0, eqIdx).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
        let value = line.slice(eqIdx + 1).trim();
        // 去除未被引号包裹的行尾注释
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
 * 按 mode 二选一读取 deploy/ 下的 env（build→.env，dev→.env.local），
 * 替代 Vite 默认同时加载两者的行为；仅暴露 VITE_ 前缀变量。
 */
function selectiveEnvPlugin() {
    return {
        name: 'selective-env',
        config(_config: UserConfig, { mode }: ConfigEnv) {
            const envDir = fileURLToPath(new URL('../deploy', import.meta.url));
            const isProd = mode === 'production';
            const envFile = isProd ? '.env' : '.env.local';
            const env = parseEnvFile(path.resolve(envDir, envFile));

            const prefixedEnv: Record<string, string> = {};
            for (const [key, value] of Object.entries(env)) {
                if (key.startsWith('VITE_')) {
                    prefixedEnv[`import.meta.env.${key}`] = JSON.stringify(value);
                }
            }

            return {
                define: {
                    ...(_config.define || {}),
                    ...prefixedEnv,
                },
            };
        },
    };
}

export default defineConfig(({ command, mode }) => {
    const isBuild = command === 'build';
    const isAnalyze = mode === 'analyze';
    const isProductionLikeBuild = isBuild && mode !== 'development';

    const envDir = fileURLToPath(new URL('../deploy', import.meta.url));
    const isProd = mode === 'production';
    const activeEnvFile = isProd ? '.env' : '.env.local';
    const env = parseEnvFile(path.resolve(envDir, activeEnvFile));

    // 刷新共享资源清单（见 generate-sharedata-manifest.mjs）
    generateShareDataManifest();

    // 重建 shader bundle 及 public 镜像，避免源码与产物漂移（见 bundle-shaders.mjs）
    bundleShaders();

    const baseUrl = env.VITE_BASE_URL || './';

    // 版本号从 README.md 提取，避免手动同步
    const readmePath = fileURLToPath(new URL('../README.md', import.meta.url));
    let appDisplayVersion = 'V0.0.0';
    try {
        const readmeContent = fs.readFileSync(readmePath, 'utf-8');
        const match = readmeContent.match(/当前版本[^\d]*(\d+\.\d+\.\d+)/);
        if (match) {
            appDisplayVersion = `V${match[1]}`;
        }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[vite] 无法读取 README.md 提取版本：${msg}`);
    }

    return {
        base: baseUrl,

        // 关闭 Vite 默认 .env 加载，改由 selectiveEnvPlugin 按 mode 读取。
        // Vite 8 起 envFile:false 已弃用，等效写法为 envDir:false（与上方同名常量无关）。
        envDir: false,

        // 注入从 README.md 提取的全局版本号
        define: {
            __APP_VERSION__: JSON.stringify(appDisplayVersion),
        },

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

        // 路径别名
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url)),
                '@domains': fileURLToPath(new URL('./src/domains', import.meta.url)),
                '@ol': fileURLToPath(new URL('./src/domains/ol', import.meta.url)),
                '@cesium-domain': fileURLToPath(new URL('./src/domains/cesium', import.meta.url)),
                '@common': fileURLToPath(new URL('./src/domains/common', import.meta.url)),
                // 映射到 CDN 的 window.Cesium，避免与 npm 包双实例冲突
                cesium: fileURLToPath(new URL('./src/cesium-shim.ts', import.meta.url)),
            },
        },

        // 开发代理：高德跨域、Docker 后端转发、局域网移动端调试
        server: {
            host: '0.0.0.0',
            port: 5173,
            // 固定端口便于局域网/书签调试，占用时直接报错
            strictPort: true,
            cors: true,
            proxy: (() => {
                // 后端顶级段原样透传（零改写），保证瓦片 URL 的百分号编码无损
                // 容器内由 compose 注入 VITE_DEV_PROXY_TARGET=http://api:7860
                const backend = process.env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:7860';
                const routes: Record<string, {
                    target: string;
                    changeOrigin: boolean;
                    secure?: boolean;
                    rewrite?: (path: string) => string;
                }> = {};
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
            // 允许任意 Host，供局域网真机/内网穿透调试（仅 dev）
            allowedHosts: true,

            // 容器内 bind mount 的 inotify 失效时需轮询；放宽间隔并排除大目录，避免扫描风暴
            watch: {
                usePolling: process.env.VITE_WATCH_USEPOLLING === '1',
                interval: Number(process.env.VITE_WATCH_INTERVAL || 300),
                ignored: ['**/public/**', '**/dist/**', '**/node_modules/**', '**/.*'],
            },
        },

        // 排除 npm cesium 预构建，避免与 CDN 双实例
        optimizeDeps: {
            exclude: ['cesium'],
        },

        worker: {
            format: 'es',
        },

        build: {
            sourcemap: !isProductionLikeBuild,
            // Vite 8 的 oxc 压缩器不支持 drop console/debugger，改用 terser 保留日志剥离
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

            // 交给 rolldown 默认分组：重库落在按需分片，不进入入口预加载图
            modulePreload: {
                polyfill: true,
            },

            // 分包交给 rolldown 默认策略；此处仅约束 chunk 名不以下划线开头
            rollupOptions: {
                output: {
                    /**
                     * GitHub Pages 的 Jekyll 会丢弃 `_` 前缀产物（如 _plugin-vue_export-helper-*.js），
                     * 导致入口 import 404、SPA 白屏；统一剥掉 chunk 名前导下划线。
                     */
                    chunkFileNames: (chunkInfo) =>
                        `assets/${String(chunkInfo.name || 'chunk').replace(/^_+/, '')}-[hash].js`,
                    // manualChunks 已移除：Vite 8/rolldown 的分组语义会把应用模块塞进第三方 chunk，
                    // 使入口被迫加载约 218 kB geotiff；改回默认分组后首屏传输约降为三分之一。
                    // 若需按包分组，改用 output.advancedChunks。
                },
            },
        },
    };
});
