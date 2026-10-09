import type { Role } from '../../config/constants.js';

/** The logged-in user as the API exposes it. Never contains the password hash. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}
