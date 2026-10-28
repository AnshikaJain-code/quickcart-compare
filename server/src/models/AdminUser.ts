import { model, Schema, type InferSchemaType } from 'mongoose';
import { ADMIN_ROLES } from './enums';

const adminUserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    /** bcrypt hash only. Never selected by default and never returned by the API. */
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ADMIN_ROLES, required: true, default: 'reviewer' },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type AdminUserDoc = InferSchemaType<typeof adminUserSchema>;
export const AdminUser = model('AdminUser', adminUserSchema);
