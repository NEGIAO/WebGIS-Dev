import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';
// import cesium from 'vite-plugin-cesium'; // 已移除，改用动态加载避免自动插入 index.html

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    // cesium(), // 已移除，改用动态加载
    !isProduction && vueDevTools()
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
});
