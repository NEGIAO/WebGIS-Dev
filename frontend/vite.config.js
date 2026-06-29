import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';
import { visualizer } from 'rollup-plugin-visualizer';

/**
 * 判断模块是否来自指定 node_modules 包
 */
function isNodeModulePackage(id, pkgName) {
  return id.includes(`/node_modules/${pkgName}/`) || id.includes(`\\node_modules\\${pkgName}\\`);
}

export default defineConfig(({ command, mode }) => {
  // 环境判断
  const isBuild = command === 'build';
  const isAnalyze = mode === 'analyze';
  const isProductionLikeBuild = isBuild && mode !== 'development';

  // 项目基础路径（支持环境变量自定义）
  const baseUrl = process.env.VITE_BASE_URL || './';

  return {
    base: baseUrl,

    // 插件配置
    plugins: [
      vue(),
      command === 'serve' && vueDevTools(),
      isAnalyze && visualizer({
        filename: 'stats.html',
        template: 'treemap',
        gzipSize: true,
        brotliSize: true,
        open: false
      }),
    ].filter(Boolean),

    // 路径别名：@ 指向 src
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // Cesium ESM 垫片：将 `import { ... } from "cesium"` 映射到 window.Cesium（CDN 全局变量）
        // 避免 npm cesium 包与 CDN cesium 产生双实例冲突
        'cesium': fileURLToPath(new URL('./src/cesium-shim.js', import.meta.url))
      }
    },

    // 开发服务器代理（解决高德 API 跨域）
    server: {
      proxy: {
        '/amap-api': {
          target: 'https://restapi.amap.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/amap-api/, '')
        }
      }
    },

    // 排除 Cesium npm 包的预构建，避免与 CDN Cesium 产生双实例
    optimizeDeps: {
      exclude: ['cesium']
    },

    // 生产环境代码压缩配置
    esbuild: isProductionLikeBuild
      ? {
        drop: ['console', 'debugger'],
        legalComments: 'none'
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
            'vendor-geotiff', 'vendor-lerc', 'vendor-jszip', 'vendor-shpjs',
            'vendor-proj4', 'vendor-codec', 'vendor-echarts-all',
            'vendor-three', 'vendor-rapier', 'vendor-hljs',
            'vendor-marked', 'vendor-lilgui', 'vendor-loaders',
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
            if (isNodeModulePackage(id, 'ol') && !id.includes('ol/source/GeoTIFF') && !id.includes('ol/source/DataTile')) return 'vendor-ol-all';
            // 图表库（~543KB）
            if (isNodeModulePackage(id, 'echarts') || isNodeModulePackage(id, 'zrender')) return 'vendor-echarts-all';
            // GeoTIFF 解析（~316KB）
            if (isNodeModulePackage(id, 'geotiff')) return 'vendor-geotiff';
            // OL 的 GeoTIFF/DataTile source 随 geotiff 一起懒加载（避免拉入首屏）
            if (id.includes('ol/source/GeoTIFF') || id.includes('ol/source/DataTile')) return 'vendor-geotiff';
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
            if (isNodeModulePackage(id, '@dimforge/rapier3d-compat')) return 'vendor-rapier';
            // highlight.js 代码高亮（仅 AI 聊天使用，~350KB）
            if (isNodeModulePackage(id, 'highlight.js')) return 'vendor-hljs';
            // Markdown 渲染（仅 AI 聊天使用）
            if (isNodeModulePackage(id, 'marked') || isNodeModulePackage(id, 'dompurify')) return 'vendor-marked';
            // 图标库（tree-shake 后仅保留使用到的图标）
            if (isNodeModulePackage(id, 'lucide-vue-next')) return 'vendor-lucide';
            // 压缩/解码（仅瓦片模块使用）
            if (isNodeModulePackage(id, 'pako') || isNodeModulePackage(id, 'protobufjs') || isNodeModulePackage(id, 'zstd-codec')) return 'vendor-codec';
            // lil-gui 控件（仅 Cesium 面板使用）
            if (isNodeModulePackage(id, 'lil-gui')) return 'vendor-lilgui';
            // 3D 模型加载器（仅 Cesium PlayerController 使用，~340KB）
            if (id.includes('@loaders.gl')) return 'vendor-loaders';
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
            if (isNodeModulePackage(id, 'vue-toastification') || isNodeModulePackage(id, 'vue3-toastify')) {
              return 'vendor-toast';
            }
            // 剩余 node_modules（小库合集）
            return 'vendor-libs';
          }
        }
      }
    }
  };
});