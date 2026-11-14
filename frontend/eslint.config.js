import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import vue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
    // 1. 全局忽略配置
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'public/**',
            'docs/**',
            // 第三方/预构建源码由上游维护，不纳入项目源码自动修复。
            'src/domains/cesium/vendors/**',
            'src/domains/cesium/modules/wind/index.mjs',
        ],
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
            globals: {
                ...globals.browser,
                __APP_VERSION__: 'readonly', // Vite define 注入，构建时从 README.md 自动提取
            },
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
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],

            // TypeScript：放宽部分限制
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },

    // 7. Node.js 脚本和配置文件
    {
        files: ['scripts/**/*.mjs', '**/*.cjs', 'vite.config.js', '*.config.{js,mjs,ts}', '.tmp-test/**/*.mjs'],
        languageOptions: {
            globals: { ...globals.node, ...globals.browser },
        },
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
        },
    },

    // 8. 领域单向依赖门禁（Docs/Refactor.md §3）
    //    允许：ol -> common、cesium -> common；禁止：common -> ol/cesium、ol <-> cesium。
    //    跨引擎互通必须经 common 的协议层（如 layer-tree/engineTreePort、basemap/catalogProjection）。
    //    等价的可执行审计脚本：python Scripts/CheckDomainDeps.py frontend/src
    {
        files: ['src/domains/common/**/*.{js,ts,vue}'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [{
                    group: ['@ol/*', '@cesium-domain/*', '**/domains/ol/**', '**/domains/cesium/**'],
                    message: 'common 不得依赖 ol / cesium 域：请改走 common 的协议层（engineTreePort / catalogProjection / data-protocol）。',
                }],
            }],
        },
    },
    {
        files: ['src/domains/cesium/**/*.{js,ts,vue}'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [{
                    group: ['@ol/*', '**/domains/ol/**'],
                    message: 'cesium 不得依赖 ol 域：共享能力请上移 common（如 basemap/catalogProjection）。',
                }],
            }],
        },
    },
    {
        files: ['src/domains/ol/**/*.{js,ts,vue}'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [{
                    group: ['@cesium-domain/*', '**/domains/cesium/**'],
                    message: 'ol 不得依赖 cesium 域：共享能力请上移 common（如 layer-tree/engineTreePort）。',
                }],
            }],
        },
    },

    // 9. 视图层范式完整性由 python Scripts/CheckVueParadigm.py 校验（ESLint 无法按内容判定）：
    //    已范式化组件（`X.vue` 内仅一行 `<script lang="ts" src="./X.ts">`）禁止出现任何 import，
    //    且模板引用的每个符号必须在 `X.ts` 中有同名 public 成员。
    //    存量未迁移组件不追溯（无 `src` 的 `<script setup>` 继续允许）。

    // 10. Prettier（最后）
    prettier,
];
