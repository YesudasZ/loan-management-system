import type { Role } from './constants';

export type DashboardModuleKey = 'sales' | 'sanction' | 'disbursement' | 'collection';

export interface DashboardModule {
  key: DashboardModuleKey;
  label: string;
  path: string;
  /** The executive role that owns the module. ADMIN can open every module. */
  ownerRole: Role;
}

export const DASHBOARD_MODULES: readonly DashboardModule[] = [
  { key: 'sales', label: 'Sales', path: '/dashboard/sales', ownerRole: 'SALES' },
  { key: 'sanction', label: 'Sanction', path: '/dashboard/sanction', ownerRole: 'SANCTION' },
  {
    key: 'disbursement',
    label: 'Disbursement',
    path: '/dashboard/disbursement',
    ownerRole: 'DISBURSEMENT',
  },
  {
    key: 'collection',
    label: 'Collection',
    path: '/dashboard/collection',
    ownerRole: 'COLLECTION',
  },
];

export const LOGIN_PATH = '/login';
export const FORBIDDEN_PATH = '/forbidden';
/** The borrower's loan history (inside /apply, so the borrower-only rule covers it). */
export const MY_LOANS_PATH = '/apply/loans';
const AUTH_PAGES = new Set(['/login', '/signup']);

export type RouteDecision = { type: 'allow' } | { type: 'redirect'; to: string };

const ALLOW: RouteDecision = { type: 'allow' };
const redirectTo = (to: string): RouteDecision => ({ type: 'redirect', to });

/** The modules a role may open, in sidebar order. */
export function getAllowedModules(role: Role): DashboardModule[] {
  if (role === 'ADMIN') {
    return [...DASHBOARD_MODULES];
  }
  return DASHBOARD_MODULES.filter((dashboardModule) => dashboardModule.ownerRole === role);
}

/** Where a role lands after login, or when it opens `/`. */
export function getHomePath(role: Role): string {
  if (role === 'BORROWER') return '/apply';
  if (role === 'ADMIN') return '/dashboard';
  return getAllowedModules(role)[0]?.path ?? FORBIDDEN_PATH;
}

export function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

function loginRedirect(pathname: string): RouteDecision {
  return redirectTo(`${LOGIN_PATH}?next=${encodeURIComponent(pathname)}`);
}

function decideDashboardAccess(pathname: string, role: Role): RouteDecision {
  if (role === 'BORROWER') return redirectTo(FORBIDDEN_PATH);
  if (role === 'ADMIN') return ALLOW;
  if (pathname === '/dashboard') return redirectTo(getHomePath(role));

  const isOwnModule = getAllowedModules(role).some((dashboardModule) =>
    isUnder(pathname, dashboardModule.path),
  );
  return isOwnModule ? ALLOW : redirectTo(FORBIDDEN_PATH);
}

/**
 * Decides what the route guard does for a page request. This is UX only: the API checks
 * every request again. `role` is null for anonymous visitors.
 */
export function resolveRouteAccess(pathname: string, role: Role | null): RouteDecision {
  if (AUTH_PAGES.has(pathname)) {
    return role ? redirectTo(getHomePath(role)) : ALLOW;
  }
  if (pathname === '/') {
    return redirectTo(role ? getHomePath(role) : LOGIN_PATH);
  }

  const isApplyPath = isUnder(pathname, '/apply');
  const isDashboardPath = isUnder(pathname, '/dashboard');
  if (!isApplyPath && !isDashboardPath) {
    return ALLOW; // /forbidden, unknown pages (Next renders 404), static files.
  }
  if (!role) {
    return loginRedirect(pathname);
  }
  if (isApplyPath) {
    return role === 'BORROWER' ? ALLOW : redirectTo(FORBIDDEN_PATH);
  }
  return decideDashboardAccess(pathname, role);
}

// Control characters and backslashes have no place in an internal path.
const UNSAFE_PATH_CHARACTERS = /[\u0000-\u001f\u007f\\]/;
const PROBE_ORIGIN = 'https://x.invalid';

/**
 * Returns `next` only if it is a same-site path the role may open; otherwise the role's home.
 * Blocks open redirects such as `//evil.com`, `/\evil.com` and `https://evil.com`.
 */
export function getSafeNextPath(next: string | null | undefined, role: Role): string {
  const home = getHomePath(role);
  if (
    !next ||
    !next.startsWith('/') ||
    next.startsWith('//') ||
    UNSAFE_PATH_CHARACTERS.test(next)
  ) {
    return home;
  }

  let url: URL;
  try {
    url = new URL(next, PROBE_ORIGIN);
  } catch {
    return home;
  }
  if (url.origin !== PROBE_ORIGIN) {
    return home;
  }

  const decision = resolveRouteAccess(url.pathname, role);
  return decision.type === 'allow' ? `${url.pathname}${url.search}` : home;
}
