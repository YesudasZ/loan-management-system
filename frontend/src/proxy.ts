import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME } from './lib/constants';
import { resolveRouteAccess } from './lib/route-access';
import { getRoleFromSessionToken } from './lib/session-token';

/**
 * Route guard (Next 16's renamed middleware). Redirects by session + role for a smooth UX;
 * the API enforces RBAC on every request regardless.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const role = await getRoleFromSessionToken(token);
  const decision = resolveRouteAccess(request.nextUrl.pathname, role);

  const response =
    decision.type === 'allow'
      ? NextResponse.next()
      : NextResponse.redirect(new URL(decision.to, request.url));

  // An invalid or expired cookie would otherwise bounce between pages; drop it.
  if (token && !role) {
    response.cookies.delete(AUTH_COOKIE_NAME);
  }
  return response;
}

export const config = {
  // Never run for the API proxy (uploads must not pass through a function) or static assets.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
