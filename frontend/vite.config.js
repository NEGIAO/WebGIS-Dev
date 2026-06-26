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
      modulePreload: true,

      // Rollup 分包策略：按功能拆分，避免单个 chunk 过大
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('vite/preload-helper')) return 'vendor-runtime';
            if (!id.includes('node_modules')) return undefined;

            // 地图引擎（最大 chunk，~524KB）
            if (isNodeModulePackage(id, 'ol')) return 'vendor-ol-all';
            // 图表库（~543KB）
            if (isNodeModulePackage(id, 'echarts') || isNodeModulePackage(id, 'zrender')) return 'vendor-echarts-all';
            // GeoTIFF 解析（~316KB）
            if (isNodeModulePackage(id, 'geotiff')) return 'vendor-geotiff';
            // LERC 栅格解码
            if (isNodeModulePackage(id, 'lerc')) return 'vendor-lerc';
            // 压缩库
            if (isNodeModulePackage(id, 'jszip')) return 'vendor-jszip';
            if (isNodeModulePackage(id, 'shpjs')) return 'vendor-shpjs';
            // 坐标投影
            if (isNodeModulePackage(id, 'proj4')) return 'vendor-proj4';
            // HTTP 客户端
            if (isNodeModulePackage(id, 'axios')) return 'vendor-axios';
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