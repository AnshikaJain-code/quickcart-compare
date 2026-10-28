import { model, Schema, type InferSchemaType } from 'mongoose';
import { makeAppendOnly } from './appendOnly';

const adminAuditLogSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', required: true },
    action: { type: String, required: true, trim: true },
    entityType: { type: String, required: true, trim: true },
    entityId: { type: String, required: true, trim: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    timestamp: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: false },
);

adminAuditLogSchema.index({ timestamp: -1 });
adminAuditLogSchema.index({ entityType: 1, entityId: 1 });
adminAuditLogSchema.index({ adminId: 1, timestamp: -1 });

makeAppendOnly(adminAuditLogSchema, 'Audit log entries');

export type AdminAuditLogDoc = InferSchemaType<typeof adminAuditLogSchema>;
export const AdminAuditLog = model('AdminAuditLog', adminAuditLogSchema);
