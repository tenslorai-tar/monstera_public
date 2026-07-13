// Flat ESLint config. Deliberately lenient to start: the rules that would fire
// hundreds of times on the existing code (explicit-any, empty catches) are set to
// "warn" so `npm run lint` reports them without blocking. Type-level correctness
// is already enforced separately by `npm run typecheck` (strict tsc). Tighten
// these to "error" as the codebase is cleaned up.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: [
      'dist/**', 'dist-electron/**', 'release/**', 'node_modules/**',
      'assets/**', 'scripts/**', '*.config.js', '*.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // React hook deps are worth knowing about but not worth blocking on.
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': 'off', // tsc's noUnusedLocals already covers this
      // The Electron main process legitimately uses require() for lazy/native loads.
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off', // ;(async()=>{})() render IIFEs
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-control-regex': 'off',
      'no-irregular-whitespace': 'off',
      'prefer-const': 'warn',
      'no-useless-escape': 'warn',
    },
  },
)
