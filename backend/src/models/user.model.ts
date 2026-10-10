import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { ROLES, type Role } from '../config/constants.js';

/** One role assignment: who gave this user which role, and when (from is null on creation). */
export interface RoleChange {
  from: Role | null;
  to: Role;
  by: Types.ObjectId;
  at: Date;
}

export interface User {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  roleHistory: RoleChange[]; // set only by admin actions; self sign-up and the seeds leave it empty
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;

const roleChangeSchema = new Schema<RoleChange>(
  {
    from: { type: String, enum: [...ROLES], default: null },
    to: { type: String, enum: [...ROLES], required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new Schema<User>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Never returned by default; login selects it explicitly with `+passwordHash`.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: [...ROLES], required: true, default: 'BORROWER' },
    roleHistory: { type: [roleChangeSchema], default: [] },
  },
  { collection: 'users', timestamps: true },
);

// Sales lists borrowers newest first.
userSchema.index({ role: 1, createdAt: -1, _id: -1 });

export const UserModel = model<User>('User', userSchema);
