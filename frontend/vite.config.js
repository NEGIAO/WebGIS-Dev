import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';
import { visualizer } from 'rollup-plugin-visualizer';

function isNodeModulePackage(id, pkgName) {
  return id.includes(`/node_modules/${pkgName}/`) || id.includes(`\\node_modules\\${pkgName}\\`);
}

function hasPathFragment(id, fragment) {
  return id.includes(fragment) || id.includes(fragment.replaceAll('/', '\\'));
}

export default defineConfig(({ command, mode }) => {
  const isBuild = command === 'build';
  const isAnalyze = mode === 'analyze';
  const isProductionLikeBuild = isBuild && mode !== 'development';

  return {
    base: './',
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
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
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
    esbuild: isProductionLikeBuild
      ? {
          drop: ['console', 'debugger'],
          legalComments: 'none'
        }
      : undefined,
    build: {
      sourcemap: !isProductionLikeBuild,
      minify: 'esbuild',
      chunkSizeWarningLimit: 300,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;

            if (isNodeModulePackage(id, 'ol')) {
              // Keep all OpenLayers internals in one chunk to avoid circular init order issues.
              return 'vendor-ol-all';
            }

            if (isNodeModulePackage(id, 'echarts')) {
              return 'vendor-echarts-all';
            }

            if (isNodeModulePackage(id, 'zrender')) return 'vendor-echarts-all';
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
