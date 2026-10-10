import type { Role } from '../../config/constants.js';
import type { UserDocument } from '../../models/user.model.js';

/** A user as the admin's staff page shows them. Never includes the password hash. */
export interface AdminUserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
}

export function toAdminUserDto(user: UserDocument): AdminUserDto {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}
