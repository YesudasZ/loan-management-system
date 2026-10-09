import { jwtVerify } from 'jose';
import { ROLES, type Role } from './constants';

const MIN_SECRET_LENGTH = 32;

/**
 * Reads the role from the session cookie, for the route guard only (the API re-checks
 * everything). Fails closed: a missing secret or an invalid/expired token means "anonymous".
 */
export async function getRoleFromSessionToken(token: string | undefined): Promise<Role | null> {
  const secret = process.env.JWT_SECRET;
  if (!token || !secret || secret.length < MIN_SECRET_LENGTH) {
    return null;
  }
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
    });
    return ROLES.find((role) => role === payload.role) ?? null;
  } catch {
    return null;
  }
}
