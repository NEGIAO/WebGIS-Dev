import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import vue from 'eslint-plugin-vue';
// 建议安装并引入 ts-eslint 插件以支持 TS
// import tseslint from 'typescript-eslint';

export default [
    // 1. 全局忽略配置 (独立对象，不加 files)
    {
        ignores: ['dist/**', 'node_modules/**', 'public/**', 'docs/**'],
    },

    // 2. 基础推荐配置
    js.configs.recommended,
    ...vue.configs['flat/recommended'], // 建议从 essential 升级到 recommended，更严谨

    // 3. 针对特定文件的自定义规则
    {
        files: ['**/*.{js,jsx,ts,tsx,vue}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
        },
        rules: {
            // 控制台调试相关
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            'no-debugger': 'warn',

            // Vue 相关：为了 GIS 开发的灵活性关掉部分限制
            'vue/block-lang': 'off',
            'vue/multi-word-component-names': 'off',
            'vue/no-v-html': 'warn',
            'vue/require-explicit-emits': 'warn',

            // 代码质量相关
            'no-unused-vars': 'warn', // 提醒清理未使用的变量
            'prefer-const': 'error', // 强制使用 const 提高代码稳定性
        },
    },

    // 4. Prettier 永远放在最后，用于覆盖格式冲突
    prettier,
];
