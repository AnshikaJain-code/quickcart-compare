import { model, Schema, type InferSchemaType } from 'mongoose';
import {
  DISCOUNT_TYPES,
  isHttpsUrlOrNull,
  isMoneyOrNull,
  PIN_CODE_REGEX,
  SOURCE_STATUSES,
} from './enums';
import { makeAppendOnly } from './appendOnly';

/** Optional money: null means UNKNOWN, 0 means a confirmed zero. They are never interchangeable. */
const moneyOrNull = {
  type: Number,
  default: null,
  validate: {
    validator: isMoneyOrNull,
    message: 'must be null or a non-negative amount with at most 2 decimals',
  },
};

const quoteItemSchema = new Schema(
  {
    listingId: { type: Schema.Types.ObjectId, ref: 'ProviderListing', required: true },
    canonicalProductId: { type: Schema.Types.ObjectId, ref: 'CanonicalProduct', default: null },
    unitPrice: {
      type: Number,
      required: true,
      validate: { validator: isMoneyOrNull, message: 'invalid price' },
    },
    inStock: { type: Boolean, required: true },
  },
  { _id: false },
);

const discountSchema = new Schema(
  {
    code: { type: String, default: null, trim: true },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: DISCOUNT_TYPES, required: true },
    value: { type: Number, required: true, min: 0, validate: (v: number) => v > 0 },
    minOrderValue: moneyOrNull,
    maxDiscount: moneyOrNull,
  },
  { _id: false },
);

discountSchema.pre('validate', function () {
  if (this.type === 'PERCENT' && typeof this.value === 'number' && this.value > 100) {
    this.invalidate('value', 'a PERCENT discount cannot exceed 100');
  }
});

/**
 * A quote is an immutable price-and-fee snapshot for one provider and one PIN code.
 * `items` is the provider's price sheet at that moment; `estimatedTotal` is only set when
 * a snapshot is for a specific basket (the compare endpoint computes totals per basket).
 */
const quoteSchema = new Schema(
  {
    providerId: { type: Schema.Types.ObjectId, ref: 'Provider', required: true },
    pinCode: { type: String, required: true, match: PIN_CODE_REGEX },
    items: { type: [quoteItemSchema], default: [] },
    currency: { type: String, enum: ['INR'], default: 'INR' },
    deliveryFee: moneyOrNull,
    platformFee: moneyOrNull,
    smallOrderFee: moneyOrNull,
    otherFees: moneyOrNull,
    taxes: moneyOrNull,
    discounts: { type: [discountSchema], default: [] },
    etaMinutes: {
      type: Number,
      default: null,
      validate: {
        validator: (v: number | null) => v === null || (Number.isInteger(v) && v >= 1 && v <= 1440),
        message: 'etaMinutes must be null or a whole number between 1 and 1440',
      },
    },
    estimatedTotal: moneyOrNull,
    sourceStatus: { type: String, enum: SOURCE_STATUSES, required: true },
    retrievedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    officialCheckoutUrl: {
      type: String,
      default: null,
      validate: { validator: isHttpsUrlOrNull, message: 'must be a valid https URL or null' },
    },
    source: { type: String, required: true, default: 'seed', trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

quoteSchema.index({ providerId: 1, pinCode: 1, retrievedAt: -1 });
quoteSchema.index({ 'items.canonicalProductId': 1 });

quoteSchema.pre('validate', function () {
  if (this.retrievedAt && this.expiresAt && this.expiresAt < this.retrievedAt) {
    this.invalidate('expiresAt', 'expiresAt cannot be before retrievedAt');
  }
});

makeAppendOnly(quoteSchema, 'Quotes');

export type QuoteDoc = InferSchemaType<typeof quoteSchema>;
export const Quote = model('Quote', quoteSchema);
