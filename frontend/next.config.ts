import type { NextConfig } from 'next';

// The /api rewrite to the backend and the security headers are added in feat/frontend-foundation.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    // The repo root has its own lockfile (tooling only); this app's root is this folder.
    root: __dirname,
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
