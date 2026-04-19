// 代码质检员，检查代码质量，提供改进建议
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import vue from 'eslint-plugin-vue';

export default [
  {
    files: ['**/*.{js,jsx,ts,tsx,vue}'],
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'warn',
      'vue/block-lang': 'off',
      'vue/multi-word-component-names': 'off'
    }
  },
  prettier
];
