import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { BCRYPT_COST } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { UserModel, type UserDocument } from '../../models/user.model.js';
import { AppError } from '../../utils/app-error.js';
import { isDuplicateKeyError } from '../../utils/duplicate-key.js';
import { signAuthToken } from '../../utils/jwt.js';
import type { LoginBody, SignupBody } from './auth.schema.js';
import type { AuthUser } from './auth.types.js';

interface Session {
  user: AuthUser;
  token: string;
}

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

let dummyPasswordHash: Promise<string> | undefined;

/**
 * A hash of a random password, made once with the real cost. Comparing against it when the
 * email is unknown makes "unknown email" and "wrong password" take the same time.
 */
function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= bcrypt.hash(crypto.randomUUID(), BCRYPT_COST);
  return dummyPasswordHash;
}

function toAuthUser(user: UserDocument): AuthUser {
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
}

async function startSession(user: UserDocument): Promise<Session> {
  const authUser = toAuthUser(user);
  const token = await signAuthToken({ userId: authUser.id, role: authUser.role }, env.JWT_SECRET);
  return { user: authUser, token };
}

/** Public sign-up. Always creates a BORROWER; staff accounts come from an admin or the seed. */
export async function signup(input: SignupBody): Promise<Session> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  try {
    const user = await UserModel.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: 'BORROWER',
    });
    return await startSession(user);
  } catch (error) {
    if (isDuplicateKeyError(error, 'email')) {
      throw new AppError(
        409,
        'EMAIL_ALREADY_REGISTERED',
        'An account with this email already exists',
      );
    }
    throw error;
  }
}

/** Checks the credentials. The error never reveals whether the email exists. */
export async function login(input: LoginBody): Promise<Session> {
  const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');
  const hashToCompare = user?.passwordHash ?? (await getDummyPasswordHash());
  const isPasswordCorrect = await bcrypt.compare(input.password, hashToCompare);

  if (!user || !isPasswordCorrect) {
    throw new AppError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE);
  }
  return startSession(user);
}

export async function findAuthUserById(userId: string): Promise<AuthUser | null> {
  if (!mongoose.isObjectIdOrHexString(userId)) {
    return null;
  }
  const user = await UserModel.findById(userId);
  return user ? toAuthUser(user) : null;
}
