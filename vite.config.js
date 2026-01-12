import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';
import cesium from 'vite-plugin-cesium';

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    // Cesium 插件配置：禁止自动插入脚本到 index.html
    cesium({
      rebuildCesium: true, // 重新构建 Cesium 以支持按需加载
    }),
    !isProduction && vueDevTools()
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    rollupOptions: {
      output: {
        // 将 Cesium 单独打包，避免混入主包
        manualChunks: {
          'cesium-vendor': ['cesium']
        }
      }
    }
  }
});
