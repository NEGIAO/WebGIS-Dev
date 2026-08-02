/**
 * vue-shims.d.ts — Vue 单文件组件模块声明
 *
 * 使 TypeScript 能够解析 .vue 文件的默认导出
 * （useLazyModules.ts 等 .ts 文件动态 import .vue 组件时需要）。
 */
declare module '*.vue' {
    import type { DefineComponent } from 'vue';
    const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
    export default component;
}
