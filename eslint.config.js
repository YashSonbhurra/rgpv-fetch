import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import stylistic from '@stylistic/eslint-plugin';
import css from '@eslint/css';
import html from '@html-eslint/eslint-plugin';
import jsonc from 'eslint-plugin-jsonc';

export default defineConfig([
  globalIgnores(['node_modules/**', '.rgpv_cache/**', 'dev/**', '.*.js']),

  {
    // Node.js code
    files: ['src/**/*.js', 'eslint.config.js'],
    ignores: ['src/web/public/**'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node
    }
  },
  {
    // Browser code
    files: ['src/web/public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: globals.browser
    }
  },
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/indent': [
        'warn',
        2,
        {
          SwitchCase: 1,
          flatTernaryExpressions: true,
          offsetTernaryExpressions: true
        }
      ],
      '@stylistic/linebreak-style': [
        'error',
        'unix'
      ],
      '@stylistic/quotes': [
        'warn',
        'single',
        { avoidEscape: true }
      ],
      '@stylistic/semi': [
        'error',
        'always',
        { omitLastInOneLineBlock: false }
      ],
      '@stylistic/no-extra-semi': 'warn',
      '@stylistic/comma-dangle': [
        'warn',
        'never'
      ],
      '@stylistic/no-trailing-spaces': 'warn',
      'block-scoped-var': 'error',
      'dot-notation': 'warn',
      eqeqeq: 'error',
      'func-names': [
        'error',
        'as-needed'
      ],
      'new-cap': 'error',
      'no-else-return': 'error',
      'no-unneeded-ternary': [
        'warn',
        { defaultAssignment: false }
      ],
      'no-unused-expressions': 'error',
      'no-use-before-define': [
        'error',
        {
          functions: false,
          classes: false,
          variables: true
        }
      ],
      'no-var': 'error',
      'operator-assignment': [
        'error',
        'always'

      ],
      'prefer-const': [
        'error',
        { destructuring: 'all' }
      ],
      'prefer-template': 'warn',
      'require-await': 'error'
    }
  },

  {
    files: ['**/*.css'],
    plugins: { css },
    extends: ['css/recommended'],
    language: 'css/css',
    rules: {
      // The UI leans on !important for theme and performance-mode overrides.
      'css/no-important': 'off',
      'css/use-baseline': [
        'error',
        {
          available: 'newly',
          allowProperties: ['user-select', 'accent-color']
        }
      ]
    }
  },

  {
    files: ['**/*.html'],
    plugins: { html },
    extends: ['html/recommended'],
    language: 'html/html',
    rules: {
      'html/attrs-newline': ['error', { ifAttrsMoreThan: 4 }],
      'html/indent': ['warn', 2],
      'html/no-ineffective-attrs': 'error',
      'html/require-button-type': 'error',
      'html/no-target-blank': 'error',
      'html/require-input-label': 'error',
      'html/id-naming-convention': ['error', 'camelCase']
    }
  },

  {
    files: ['**/*.json'],
    ignores: ['package-lock.json'],
    plugins: { jsonc },
    extends: ['jsonc/flat/recommended-with-json'],
    rules: {
      'jsonc/indent': ['warn', 2]
    }
  }
]);