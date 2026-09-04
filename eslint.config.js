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

// Downgrades for ported/legacy code that has not been through these rules yet:
// the mobile app (`apps/mobile`, lands in a follow-up PR) and the specific
// legacy web modules below. Everything else must keep failing on them, so the
// downgrades are scoped rather than applied to every `**/*.{ts,tsx}` file.
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

// Web modules carried over from before these rules were enforced (ported
// dual-reader code, vendored shadcn/ai-elements UI, one-off scripts). New web
// code must not be added to this list.
const webLegacyWarningFiles = [
  'convex/nemu_chat.ts',
  'convex/r2.ts',
  'packages/core/src/dual-reader/**/*.ts',
  'scripts/**/*.ts',
  'services/**/*.ts',
  'src/components/ai-elements/**/*.tsx',
  'src/components/ui/**/*.tsx',
  'src/components/chapter-grid.tsx',
  'src/components/cloudflare-bypass-dialog.tsx',
  'src/components/cover-image.tsx',
  'src/components/filters/**/*.tsx',
  'src/components/metadata-edit-dialog.tsx',
  'src/components/metadata-match-drawer.tsx',
  'src/components/page-title.tsx',
  'src/components/plugin-settings.tsx',
  'src/components/reader/ScrollingGallery.tsx',
  'src/components/source-add-drawer.tsx',
  'src/components/welcome-wizard.tsx',
  'src/data/context.tsx',
  'src/data/indexeddb.ts',
  'src/data/services-provider.tsx',
  'src/hooks/use-mobile.ts',
  'src/hooks/use-source-image.tsx',
  'src/lib/chapter-recognition.ts',
  'src/lib/dual-reader/**/*.ts',
  'src/lib/metadata/translations/**/*.ts',
  'src/lib/plugins/components.tsx',
  'src/lib/plugins/context.tsx',
  'src/lib/plugins/builtin/dual-reader/**/*.tsx',
  'src/lib/plugins/builtin/japanese-learning/**/*.{ts,tsx}',
  'src/main.tsx',
  'src/pages/debug-popover-drawer.tsx',
  'src/pages/reader.tsx',
  'src/router.tsx',
  'src/stores/library.test.ts',
  'src/sync/hooks.ts',
]

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
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    rules: legacyWarningRules,
  },
  {
    files: webLegacyWarningFiles,
    rules: legacyWarningRules,
  },
  {
    files: ['apps/mobile/app/**/*.{ts,tsx}', 'apps/mobile/src/**/*.{ts,tsx}'],
    ignores: ['apps/mobile/src/design-system/**/*.{ts,tsx}'],
    rules: {
      // Dynamic Type ratchet: a bare react-native `Text` ships without a
      // `maxFontSizeMultiplier`, so enlarged type escapes measured native
      // chrome. `NemuText` bounds it by default. Kept at `warn` because ~380
      // pre-existing nodes are still unmigrated; `src/lib/mobileTextCoverageBudget.test.ts`
      // is the hard gate that stops the count from growing.
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            'ImportDeclaration[source.value="react-native"] > ImportSpecifier[imported.name="Text"]',
          message:
            'Import NemuText from @/design-system instead of react-native Text so Dynamic Type stays bounded (maxFontSizeMultiplier).',
        },
      ],
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
