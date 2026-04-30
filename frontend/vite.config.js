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
      })
    ].filter(Boolean),

    // 路径别名：@ 指向 src
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
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

    // 生产环境代码压缩配置
    esbuild: isProductionLikeBuild
      ? {
        drop: ['console', 'debugger'],
        legalComments: 'none'
      }
      : undefined,

    // 构建配置
    build: {
      sourcemap: !isProductionLikeBuild,
      minify: 'esbuild',
      chunkSizeWarningLimit: 300,
      modulePreload: false,

      // Rollup 分包策略
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('vite/preload-helper')) return 'vendor-runtime';
            if (!id.includes('node_modules')) return undefined;

            if (isNodeModulePackage(id, 'ol')) return 'vendor-ol-all';
            if (isNodeModulePackage(id, 'echarts') || isNodeModulePackage(id, 'zrender')) return 'vendor-echarts-all';
            if (isNodeModulePackage(id, 'geotiff')) return 'vendor-geotiff';
            if (isNodeModulePackage(id, 'lerc')) return 'vendor-lerc';
            if (isNodeModulePackage(id, 'jszip')) return 'vendor-jszip';
            if (isNodeModulePackage(id, 'shpjs')) return 'vendor-shpjs';
            if (isNodeModulePackage(id, 'proj4')) return 'vendor-proj4';
            if (isNodeModulePackage(id, 'axios')) return 'vendor-axios';
            if (
              isNodeModulePackage(id, 'vue') ||
              isNodeModulePackage(id, '@vue') ||
              isNodeModulePackage(id, 'vue-router') ||
              isNodeModulePackage(id, 'pinia')
            ) {
              return 'vendor-vue';
            }

            return 'vendor-libs';
          }
        }
      }
    }
  };
});