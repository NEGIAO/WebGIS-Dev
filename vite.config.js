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
    cesium(),
    !isProduction && vueDevTools()
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url'))
    }
  }
});
