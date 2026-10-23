import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

// npm run lint : จับตัวแปร/คอมโพเนนต์ที่ไม่ได้ประกาศหรือ import (no-undef, react/jsx-no-undef)
// และการใช้ hook ผิดกติกา ; กฎความสวยงามไม่บังคับ
export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: '18.2' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      'react/jsx-no-undef': 'error',
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
      'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true, caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // โค้ดเดิมตั้งใจเขียนแบบนี้ (regex ตัดอักขระควบคุม, Boolean(...) ซ้อน) : ไม่ใช่บั๊ก
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
      'no-extra-boolean-cast': 'off',
    },
  },
  {
    files: ['**/*.test.{js,jsx}', 'vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
