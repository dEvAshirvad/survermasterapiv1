import antfu from '@antfu/eslint-config';

export default antfu(
  {
    type: 'app',
    typescript: true,
    formatters: true,
    stylistic: {
      indent: 2,
      semi: true,
      quotes: 'single',
    },
    ignores: ['**/migrations/*'],
  },
  {
    rules: {
      'no-console': ['warn'],
      'antfu/no-top-level-await': ['off'],
      'node/prefer-global/process': ['off'],
      'node/no-process-env': ['error'],
      'unicorn/throw-new-error': ['off'],
      'perfectionist/sort-imports': [
        'error',
        {
          tsconfig: {
            rootDir: '.',
          },
        },
      ],
      'unicorn/filename-case': [
        'off',
        {
          case: 'kebabCase',
          ignore: ['README.md'],
        },
      ],
    },
  }
);
