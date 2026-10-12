/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-app-imports',
      comment: 'Apps should not directly import from other apps; share code through packages instead.',
      severity: 'error',
      from: { path: '^apps/([^/]+)' },
      to: {
        path: '^apps/(?!$1)',
      },
    },
    {
      name: 'no-circular',
      comment: 'Circular dependencies are not allowed.',
      severity: 'error',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'packages-dont-depend-on-apps',
      comment: 'Shared packages must not import from apps.',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.base.json',
    },
  },
};
