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
              if (hasPathFragment(id, '/ol/source/')) return 'vendor-ol-source';
              if (hasPathFragment(id, '/ol/layer/')) return 'vendor-ol-layer';
              if (hasPathFragment(id, '/ol/control/')) return 'vendor-ol-control';
              if (hasPathFragment(id, '/ol/proj/')) return 'vendor-ol-proj';
              if (hasPathFragment(id, '/ol/interaction/')) return 'vendor-ol-interaction';
              // Split style, geom, render into separate chunks to avoid circular dependencies
              if (hasPathFragment(id, '/ol/style/')) return 'vendor-ol-style';
              if (hasPathFragment(id, '/ol/geom/')) return 'vendor-ol-geom';
              if (hasPathFragment(id, '/ol/render/')) return 'vendor-ol-render';
              return 'vendor-ol-core';
            }

            if (isNodeModulePackage(id, 'echarts')) {
              if (hasPathFragment(id, '/echarts/lib/chart/')) return 'vendor-echarts-charts';
              if (hasPathFragment(id, '/echarts/lib/component/')) return 'vendor-echarts-components';
              return 'vendor-echarts-core';
            }

            if (isNodeModulePackage(id, 'zrender')) return 'vendor-zrender';
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
