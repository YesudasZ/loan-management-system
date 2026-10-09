import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { JWT_EXPIRY, ROLES, type Role } from '../config/constants.js';

const ALGORITHM = 'HS256';

export interface AuthTokenClaims {
  userId: string;
  role: Role;
}

const payloadSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(ROLES),
});

function toKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** Signs a session token for the given user. */
export async function signAuthToken(claims: AuthTokenClaims, secret: string): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(toKey(secret));
}

/**
 * Verifies a session token. The algorithm is pinned, so a token signed with
 * another algorithm (or `none`) is rejected. Throws if the token is invalid or expired.
 */
export async function verifyAuthToken(token: string, secret: string): Promise<AuthTokenClaims> {
  const { payload } = await jwtVerify(token, toKey(secret), { algorithms: [ALGORITHM] });
  const claims = payloadSchema.parse(payload);
  return { userId: claims.sub, role: claims.role };
}
