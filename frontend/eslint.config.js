import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import vue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';

export default [
    // 1. 全局忽略配置
    {
        ignores: ['dist/**', 'node_modules/**', 'public/**', 'docs/**'],
    },

    // 2. JS 基础推荐
    js.configs.recommended,

    // 3. TypeScript 推荐（ts 文件的 parser）
    ...tseslint.configs.recommended,

    // 4. Vue 推荐（放在 tseslint 之后，.vue 文件的 vue-eslint-parser 覆盖 tseslint parser）
    ...vue.configs['flat/recommended'],

    // 5. Vue 文件中使用 TypeScript 解析器处理 <script>
    {
        files: ['**/*.vue'],
        languageOptions: {
            parserOptions: {
                parser: tseslint.parser,
            },
        },
    },

    // 6. 自定义规则
    {
        files: ['**/*.{js,jsx,ts,tsx,vue}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
        },
        rules: {
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            'no-debugger': 'warn',

            // Vue
            'vue/block-lang': 'off',
            'vue/multi-word-component-names': 'off',
            'vue/no-v-html': 'warn',
            'vue/require-explicit-emits': 'warn',

            // 代码质量
            'prefer-const': 'error',

            // TypeScript：放宽部分限制
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },

    // 7. Prettier（最后）
    prettier,
];
