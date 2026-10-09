import { model, Schema, type HydratedDocument } from 'mongoose';
import { ROLES, type Role } from '../config/constants.js';

export interface User {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;

const userSchema = new Schema<User>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Never returned by default; login selects it explicitly with `+passwordHash`.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: [...ROLES], required: true, default: 'BORROWER' },
  },
  { collection: 'users', timestamps: true },
);

// Sales lists borrowers newest first.
userSchema.index({ role: 1, createdAt: -1, _id: -1 });

export const UserModel = model<User>('User', userSchema);
