import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const mobileDesignSystemOwnedComponents = [
  'GlassSurface',
  'NemuPressable',
  'NemuNativeSwitch',
  'NemuNativeProgressView',
  'PageHeader',
  'PageScaffold',
  'MobileNativeSheetScaffold',
  'MobileSheetScaffold',
  'MobileSheetBackdrop',
  'MangaCard',
  'SourceCard',
]

const legacyWarningRules = {
  '@typescript-eslint/ban-ts-comment': 'warn',
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-unused-vars': 'warn',
  'no-case-declarations': 'warn',
  'no-control-regex': 'warn',
  'no-empty': 'warn',
  'no-useless-escape': 'warn',
  'prefer-const': 'warn',
  'react-hooks/immutability': 'warn',
  'react-hooks/preserve-manual-memoization': 'warn',
  'react-hooks/purity': 'warn',
  'react-hooks/refs': 'warn',
  'react-hooks/set-state-in-effect': 'warn',
  'react-hooks/set-state-in-render': 'warn',
  'react-hooks/static-components': 'warn',
  'react-refresh/only-export-components': 'warn',
}

export default defineConfig([
  globalIgnores([
    'android',
    'dist',
    'vendor',
    'convex/_generated',
    'apps/mobile/.expo',
    'apps/mobile/android',
    'apps/mobile/dist',
    'apps/mobile/ios',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: legacyWarningRules,
  },
  {
    files: ['apps/mobile/app/**/*.{ts,tsx}', 'apps/mobile/src/**/*.{ts,tsx}'],
    ignores: ['apps/mobile/src/design-system/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: mobileDesignSystemOwnedComponents.map((component) => ({
            name: `@/components/${component}`,
            message: 'Import shared mobile UI from @/design-system.',
          })),
          patterns: [
            {
              group: ['@/design/*'],
              message: 'Import mobile design tokens, typography, theme, and navigation helpers from @/design-system.',
            },
            {
              group: ['@/design-system/components/*'],
              message: 'Use the public @/design-system entry point instead of deep component imports.',
            },
          ],
        },
      ],
    },
  },
])
