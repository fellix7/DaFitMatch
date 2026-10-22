import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/node_modules/**',
      'packages/shared/src/db.types.ts',
      'workers/**',
      'supabase/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['apps/api/**/*.{ts,mjs}', '**/*.mjs', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // The Playwright specs run in Node (they drive a browser), so they need Node globals too.
    files: ['apps/web/e2e/**/*.{ts,tsx}', 'apps/web/playwright.config.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // Guardrail: user-facing API code queries through the user-scoped client so RLS applies.
    // The service-role client is for src/jobs/** (and future admin routes) only.
    files: [
      'apps/api/src/routes/**/*.ts',
      'apps/api/src/plugins/**/*.ts',
      'apps/api/src/services/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/lib/supabase-admin', '**/lib/supabase-admin.ts'],
              message: 'Service-role client is for jobs/admin only. Use request.supabase (RLS).',
            },
          ],
        },
      ],
    },
  },
  {
    // Guardrail: the browser must never import server-only modules or the service-role key.
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@fal-ai/*', 'pg', 'pg-boss', 'ai', '@ai-sdk/*', 'serpapi'] },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/SERVICE_ROLE|SECRET_KEY/]',
          message: 'The browser must never reference service-role / secret keys.',
        },
      ],
    },
  },
  prettier,
);
