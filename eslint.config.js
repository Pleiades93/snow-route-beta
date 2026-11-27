const rules = {
  'no-debugger': 'error',
  'no-dupe-args': 'error',
};

module.exports = [
  {
    files: ['parts/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script' },
    rules,
  },
  {
    files: ['{scripts,tests}/**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules,
  },
  {
    files: ['{scripts,tests}/**/*.{js,cjs}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs' },
    rules,
  },
];
