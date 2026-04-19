// 引入 Node.js 内置模块，用于处理文件路径
import { fileURLToPath, URL } from 'node:url';
// 引入 Vite 核心配置方法
import { defineConfig } from 'vite';
// 官方 Vue 插件，用于解析 .vue 单文件组件
import vue from '@vitejs/plugin-vue';
// Vue 开发者工具插件（仅开发环境使用）
import vueDevTools from 'vite-plugin-vue-devtools';
// 打包体积分析插件，用于生成打包分析报告
import { visualizer } from 'rollup-plugin-visualizer';
// 代码压缩插件，支持 gzip 和 brotli 压缩（生产环境使用）
// import viteCompression from 'vite-plugin-compression';

/**
 * 工具函数：判断当前模块是否来自指定的 node_modules 包
 * @param {string} id 模块路径
 * @param {string} pkgName 包名
 * @returns {boolean}
 */
function isNodeModulePackage(id, pkgName) {
  return id.includes(`/node_modules/${pkgName}/`) || id.includes(`\\node_modules\\${pkgName}\\`);
}

// /**
//  * 工具函数：判断路径中是否包含指定片段（兼容 Windows / Mac 路径）
//  * @param {string} id 模块路径
//  * @param {string} fragment 路径片段
//  * @returns {boolean}
//  */
// function hasPathFragment(id, fragment) {
//   return id.includes(fragment) || id.includes(fragment.replaceAll('/', '\\'));
// }

// Vite 配置主入口（支持根据命令/模式动态配置）
export default defineConfig(({ command, mode }) => {
  // 是否为生产构建（npm run build）
  const isBuild = command === 'build';
  // 是否为分析模式（用于打包体积分析）
  const isAnalyze = mode === 'analyze';
  // 是否为生产类构建（非开发环境的构建）
  const isProductionLikeBuild = isBuild && mode !== 'development';

  // ==================== 基础路径配置 ====================
  // 从环境变量读取 BASE_URL，支持自定义部署路径
  // 例如：VITE_BASE_URL=/WebGIS-Dev/ npm run build
  // 默认使用相对路径 './'，支持本地直接打开 dist
  const baseUrl = process.env.VITE_BASE_URL || './';

  return {
    // 项目基础路径（决定静态资源加载路径）
    base: baseUrl,

    // ==================== 插件配置 ====================
    plugins: [
      // 解析 Vue 单文件组件
      vue(),

      // 仅开发环境（serve）启用 Vue DevTools
      command === 'serve' && vueDevTools(),
      // isProductionLikeBuild && viteCompression({
      // threshold: 10240, // 超过 10kb 的文件才压缩
      // algorithm: 'gzip',
      // ext: '.gz',
      // }),

      // 仅分析模式启用打包体积分析插件
      isAnalyze && visualizer({
        filename: 'stats.html',        // 输出的分析报告文件名
        template: 'treemap',         // 图表形式：矩形树图
        gzipSize: true,              // 显示 gzip 压缩后大小
        brotliSize: true,            // 显示 brotli 压缩后大小
        open: false                  // 生成后不自动打开
      })
    ].filter(Boolean), // 过滤掉 false 值（条件插件）

    // ==================== 路径别名配置 ====================
    resolve: {
      alias: {
        // @ 符号指向 src 目录，方便导入文件
        // 例如 import xxx from '@/components/xxx'
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },

    // ==================== 开发服务器配置 ====================
    server: {
      // 代理配置（解决开发环境跨域问题）
      proxy: {
        '/amap-api': {
          target: 'https://restapi.amap.com',  // 高德地图 API 地址
          changeOrigin: true,                 // 开启跨域
          secure: true,                       // 支持 https
          rewrite: (path) => path.replace(/^\/amap-api/, '') // 路径重写
        }
      }
    },

    // ==================== 代码压缩/清除配置 ====================
    esbuild: isProductionLikeBuild
      ? {
          drop: ['console', 'debugger'],   // 生产环境删除所有 console 和 debugger
          legalComments: 'none'            // 删除所有版权注释
        }
      : undefined,

    // ==================== 构建配置 ====================
    build: {
      sourcemap: !isProductionLikeBuild,    // 开发环境生成 sourcemap，生产环境不生成
      minify: 'esbuild',                   // 使用 esbuild 压缩（速度最快）
      chunkSizeWarningLimit: 300,           // 打包超过 300KB 发出警告

      // Rollup 打包细粒度配置（代码分割、分包）
      rollupOptions: {
        output: {
          // 手动代码分割：将不同第三方库拆分为独立 chunk
          manualChunks(id) {
            // 只对 node_modules 中的库进行分包
            if (!id.includes('node_modules')) return undefined;

            //文件大小过大，480KB 的 ol，需要单独导入，避免
            // OpenLayers 地图库单独打包
            if (isNodeModulePackage(id, 'ol')) {
              return 'vendor-ol-all';
            }

            // ECharts 图表库单独打包
            if (isNodeModulePackage(id, 'echarts')) {
              return 'vendor-echarts-all';
            }

            // zrender 是 ECharts 依赖，一起打包
            if (isNodeModulePackage(id, 'zrender')) return 'vendor-echarts-all';

            // 地理相关库独立分包
            if (isNodeModulePackage(id, 'geotiff')) return 'vendor-geotiff';
            if (isNodeModulePackage(id, 'lerc')) return 'vendor-lerc';
            if (isNodeModulePackage(id, 'jszip')) return 'vendor-jszip';
            if (isNodeModulePackage(id, 'shpjs')) return 'vendor-shpjs';
            if (isNodeModulePackage(id, 'proj4')) return 'vendor-proj4';

            // 请求库独立分包
            if (isNodeModulePackage(id, 'axios')) return 'vendor-axios';

            // Vue 全家桶单独打包（vue、vue-router、pinia）
            if (
              isNodeModulePackage(id, 'vue') ||
              isNodeModulePackage(id, '@vue') ||
              isNodeModulePackage(id, 'vue-router') ||
              isNodeModulePackage(id, 'pinia')
            ) {
              return 'vendor-vue';
            }

            // 其余所有第三方库统一打包到 vendor-libs
            return 'vendor-libs';
          }
        }
      }
    }
  };
});