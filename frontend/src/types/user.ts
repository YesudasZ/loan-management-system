import type { Role } from '@/lib/constants';

/** The logged-in user as returned by the API (`GET /api/v1/auth/me`). */
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}
