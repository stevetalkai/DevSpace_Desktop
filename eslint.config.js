import eslint from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['node_modules/**', 'out/**', 'release/**', 'artifacts/**', 'vendor/**'] },
  {
    ...eslint.configs.recommended,
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: globals.node }
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx']
  })),
  {
    files: ['src/renderer/**/*.ts', 'src/renderer/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: reactHooks.configs.recommended.rules
  }
)
