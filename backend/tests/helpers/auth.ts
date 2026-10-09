import bcrypt from 'bcrypt';
import type { Response } from 'supertest';
import { AUTH_COOKIE_NAME, type Role } from '../../src/config/constants.js';
import { env } from '../../src/config/env.js';
import { UserModel } from '../../src/models/user.model.js';
import { signAuthToken } from '../../src/utils/jwt.js';

export const TEST_PASSWORD = 'Password@123';
// Low cost keeps test setup fast; production hashes use BCRYPT_COST.
const TEST_BCRYPT_COST = 4;

export interface TestUser {
  id: string;
  email: string;
  role: Role;
  /** Ready-to-send `Cookie` header value for this user's session. */
  cookie: string;
}

export async function createTestUser(
  role: Role,
  email = `${role.toLowerCase()}@test.dev`,
): Promise<TestUser> {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, TEST_BCRYPT_COST);
  const user = await UserModel.create({ name: `Test ${role}`, email, passwordHash, role });
  const id = user._id.toString();
  const token = await signAuthToken({ userId: id, role }, env.JWT_SECRET);
  return { id, email, role, cookie: `${AUTH_COOKIE_NAME}=${token}` };
}

/** The `lms_token` Set-Cookie line of a response, if any. */
export function getAuthSetCookie(response: Response): string | undefined {
  const lines = response.get('Set-Cookie') ?? [];
  return lines.find((line) => line.startsWith(`${AUTH_COOKIE_NAME}=`));
}
