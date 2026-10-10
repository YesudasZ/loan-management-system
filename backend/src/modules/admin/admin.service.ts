import bcrypt from 'bcrypt';
import mongoose, { type Types } from 'mongoose';
import { BCRYPT_COST, type Role } from '../../config/constants.js';
import { LoanModel } from '../../models/loan.model.js';
import { UserModel } from '../../models/user.model.js';
import { AppError } from '../../utils/app-error.js';
import { isDuplicateKeyError } from '../../utils/duplicate-key.js';
import { toPaginated, toSkip, type Paginated } from '../../utils/pagination.js';
import type { AuthUser } from '../auth/auth.types.js';
import { toAdminUserDto, type AdminUserDto } from './admin.dto.js';
import type { CreateStaffBody, ListUsersQuery } from './admin.schema.js';

const LAST_ADMIN_MESSAGE = 'There must always be at least one admin.';

/** Escapes regex characters, so a search for "a.b" or "(" matches that text literally. */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Users newest first, optionally filtered by role and a name/email search. */
export async function listUsers(query: ListUsersQuery): Promise<Paginated<AdminUserDto>> {
  const pattern = query.search ? new RegExp(escapeRegex(query.search), 'i') : null;
  const filter = {
    ...(query.role ? { role: query.role } : {}),
    ...(pattern ? { $or: [{ name: pattern }, { email: pattern }] } : {}),
  };
  const [users, totalItems] = await Promise.all([
    UserModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(toSkip(query.page, query.limit))
      .limit(query.limit),
    UserModel.countDocuments(filter),
  ]);
  return toPaginated(users.map(toAdminUserDto), totalItems, query.page, query.limit);
}

/** Creates a staff account with a temporary password. 409 if the email is already taken. */
export async function createStaffUser(
  admin: AuthUser,
  input: CreateStaffBody,
): Promise<AdminUserDto> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  try {
    const user = await UserModel.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      roleHistory: [{ from: null, to: input.role, by: admin.id, at: new Date() }],
    });
    return toAdminUserDto(user);
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

function countOtherAdmins(userId: Types.ObjectId): Promise<number> {
  // A server-built operator, so it is marked trusted for sanitizeFilter.
  return UserModel.countDocuments({ role: 'ADMIN', _id: mongoose.trusted({ $ne: userId }) });
}

/**
 * Changes a user's role and records who did it in their roleHistory. Refuses (409) to change
 * the admin's own role, to remove the last admin, and to make a borrower with loans staff
 * (segregation of duties: staff must not have loans of their own in the system).
 */
export async function changeUserRole(
  admin: AuthUser,
  userId: string,
  role: Role,
): Promise<AdminUserDto> {
  if (userId === admin.id) {
    throw new AppError(409, 'CANNOT_CHANGE_OWN_ROLE', 'You cannot change your own role.');
  }
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }
  if (user.role === role) {
    return toAdminUserDto(user); // nothing to change
  }
  const from = user.role;
  if (from === 'BORROWER' && (await LoanModel.exists({ borrowerId: user._id }))) {
    throw new AppError(
      409,
      'BORROWER_HAS_LOANS',
      'This borrower has loans, so they cannot be given a staff role.',
    );
  }
  const isRemovingAnAdmin = from === 'ADMIN';
  if (isRemovingAnAdmin && (await countOtherAdmins(user._id)) === 0) {
    throw new AppError(409, 'LAST_ADMIN', LAST_ADMIN_MESSAGE);
  }

  // Conditional on the role we checked, so a concurrent change can't be overwritten.
  const updated = await UserModel.findOneAndUpdate(
    { _id: user._id, role: from },
    {
      $set: { role },
      $push: { roleHistory: { from, to: role, by: admin.id, at: new Date() } },
    },
    { returnDocument: 'after', runValidators: true },
  );
  if (!updated) {
    throw new AppError(
      409,
      'ROLE_CHANGED',
      'This user’s role just changed. Refresh and try again.',
    );
  }

  // Two admins demoting each other at the same moment could both pass the check above. If no
  // admin is left now, undo this change, so the system can never be locked out.
  if (isRemovingAnAdmin && (await UserModel.countDocuments({ role: 'ADMIN' })) === 0) {
    await UserModel.updateOne(
      { _id: user._id },
      { $set: { role: from }, $pop: { roleHistory: 1 } },
    );
    throw new AppError(409, 'LAST_ADMIN', LAST_ADMIN_MESSAGE);
  }
  return toAdminUserDto(updated);
}
