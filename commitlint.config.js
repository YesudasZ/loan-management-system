// Enforces the Conventional Commits rules from CLAUDE.md section 5.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 72],
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'chore', 'docs', 'test', 'refactor', 'perf', 'ci', 'style'],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'backend',
        'frontend',
        'auth',
        'bre',
        'loan',
        'payment',
        'rbac',
        'upload',
        'seed',
        'ci',
        'docs',
        'deps',
      ],
    ],
  },
};
