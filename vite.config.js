import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    !isProduction && vueDevTools()
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
  build: {
    sourcemap: !isProduction,
    minify:"esbuild"
  }
});
