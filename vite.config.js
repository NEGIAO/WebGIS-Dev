import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';

const isProduction = process.env.NODE_ENV === 'production';
const baseFromEnv = process.env.VITE_APP_BASE_URL;

export default defineConfig({
  base: baseFromEnv ?? '/',
  plugins: [
    vue(),
    !isProduction && vueDevTools()
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
});
