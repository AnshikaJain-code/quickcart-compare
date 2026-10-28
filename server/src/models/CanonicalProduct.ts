import { model, Schema, type InferSchemaType } from 'mongoose';
import { formatPackLabel, toBaseQuantity } from '../services/units';
import { CATEGORIES, isHttpsUrlOrNull, QUANTITY_UNITS, type QuantityUnit } from './enums';

const canonicalProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    brand: { type: String, required: true, trim: true, maxlength: 80 },
    category: { type: String, enum: CATEGORIES, required: true },
    variant: { type: String, default: '', trim: true, maxlength: 80 },
    quantityValue: { type: Number, required: true, min: 0, validate: (v: number) => v > 0 },
    quantityUnit: { type: String, enum: QUANTITY_UNITS, required: true },
    // Derived on validate: normalised size (ml / g / pcs) and a display label.
    quantityBase: { type: Number, required: true },
    baseUnit: { type: String, enum: ['ml', 'g', 'pcs'], required: true },
    packLabel: { type: String, required: true },
    identifiers: {
      gtin: { type: String, default: null, match: /^\d{8,14}$/ },
      sku: { type: String, default: null, trim: true },
    },
    imageUrl: {
      type: String,
      default: null,
      validate: { validator: isHttpsUrlOrNull, message: 'must be a valid https URL or null' },
    },
  },
  { timestamps: true },
);

canonicalProductSchema.pre('validate', function () {
  if (typeof this.quantityValue === 'number' && this.quantityUnit) {
    const unit = this.quantityUnit as QuantityUnit;
    const base = toBaseQuantity(this.quantityValue, unit);
    this.quantityBase = base.value;
    this.baseUnit = base.unit;
    this.packLabel = formatPackLabel(this.quantityValue, unit);
  }
});

// Same brand + name + variant + normalised size is the same product (500 ml equals 0.5 l).
canonicalProductSchema.index(
  { brand: 1, name: 1, variant: 1, baseUnit: 1, quantityBase: 1 },
  { unique: true },
);
canonicalProductSchema.index({ category: 1, name: 1 });
canonicalProductSchema.index(
  { name: 'text', brand: 'text', variant: 'text', packLabel: 'text' },
  { weights: { name: 10, brand: 5, variant: 3, packLabel: 1 } },
);
canonicalProductSchema.index({ 'identifiers.gtin': 1 }, { sparse: true });

export type CanonicalProductDoc = InferSchemaType<typeof canonicalProductSchema>;
export const CanonicalProduct = model('CanonicalProduct', canonicalProductSchema);
