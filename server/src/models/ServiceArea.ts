import { model, Schema, type InferSchemaType } from 'mongoose';
import { PIN_CODE_REGEX, SERVICEABILITY } from './enums';

const serviceAreaSchema = new Schema(
  {
    providerId: { type: Schema.Types.ObjectId, ref: 'Provider', required: true },
    pinCode: { type: String, required: true, match: PIN_CODE_REGEX },
    status: { type: String, enum: SERVICEABILITY, required: true },
    /** When coverage was last checked. Null only while status is UNKNOWN. */
    verifiedAt: { type: Date, default: null },
    source: { type: String, required: true, default: 'seed', trim: true },
  },
  { timestamps: true },
);

serviceAreaSchema.index({ providerId: 1, pinCode: 1 }, { unique: true });
serviceAreaSchema.index({ pinCode: 1 });

// Claiming AVAILABLE/UNAVAILABLE without saying when it was checked is not allowed.
serviceAreaSchema.pre('validate', function () {
  if (this.status !== 'UNKNOWN' && !this.verifiedAt) {
    this.invalidate('verifiedAt', 'verifiedAt is required unless status is UNKNOWN');
  }
});

export type ServiceAreaDoc = InferSchemaType<typeof serviceAreaSchema>;
export const ServiceArea = model('ServiceArea', serviceAreaSchema);
