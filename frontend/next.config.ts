import type { NextConfig } from 'next';
import { z } from 'zod';

// Checked at build time: rewrites are compiled into the build, and the route guard needs the
// same JWT secret as the API. A missing value fails the build instead of a broken deploy.
const buildEnv = z
  .object({
    BACKEND_URL: z.url('BACKEND_URL must be the API base URL, e.g. http://localhost:4000'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  })
  .parse(process.env);

const backendUrl = buildEnv.BACKEND_URL.replace(/\/+$/, '');

const pageSecurityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Stops `next dev` writing an AGENTS.md into the repo when it detects an AI coding agent;
  // the project's own rules live in CLAUDE.md.
  agentRules: false,
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
  // Same-origin API: the browser only talks to this app, so the auth cookie stays first-party.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backendUrl}/api/:path*` }];
  },
  // Pages only: API responses keep the backend's own headers (e.g. the salary slip viewer's).
  async headers() {
    return [{ source: '/((?!api/).*)', headers: pageSecurityHeaders }];
  },
};

export default nextConfig;
