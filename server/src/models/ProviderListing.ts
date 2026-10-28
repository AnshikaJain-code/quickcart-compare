import { model, Schema, type InferSchemaType } from 'mongoose';
import { isHttpsUrlOrNull, MATCH_STATUSES } from './enums';

const providerListingSchema = new Schema(
  {
    providerId: { type: Schema.Types.ObjectId, ref: 'Provider', required: true },
    providerProductId: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    brand: { type: String, default: '', trim: true },
    packSize: { type: String, required: true, trim: true },
    canonicalProductId: { type: Schema.Types.ObjectId, ref: 'CanonicalProduct', default: null },
    matchStatus: { type: String, enum: MATCH_STATUSES, required: true, default: 'UNMATCHED' },
    matchConfidence: { type: Number, min: 0, max: 1, default: null },
    productUrl: {
      type: String,
      default: null,
      validate: { validator: isHttpsUrlOrNull, message: 'must be a valid https URL or null' },
    },
    source: { type: String, required: true, default: 'seed', trim: true },
  },
  { timestamps: true },
);

providerListingSchema.index({ providerId: 1, providerProductId: 1 }, { unique: true });
providerListingSchema.index({ canonicalProductId: 1, providerId: 1 });
providerListingSchema.index({ matchStatus: 1 });

// A listing is either mapped (with a confidence) or UNMATCHED (with neither).
providerListingSchema.pre('validate', function () {
  if (this.matchStatus === 'UNMATCHED') {
    if (this.canonicalProductId) {
      this.invalidate(
        'canonicalProductId',
        'an UNMATCHED listing must not have a canonical product',
      );
    }
    this.matchConfidence = null;
  } else {
    if (!this.canonicalProductId) {
      this.invalidate(
        'canonicalProductId',
        `a ${this.matchStatus} listing needs a canonical product`,
      );
    }
    if (this.matchConfidence === null || this.matchConfidence === undefined) {
      this.invalidate('matchConfidence', `a ${this.matchStatus} listing needs a matchConfidence`);
    }
  }
});

export type ProviderListingDoc = InferSchemaType<typeof providerListingSchema>;
export const ProviderListing = model('ProviderListing', providerListingSchema);
