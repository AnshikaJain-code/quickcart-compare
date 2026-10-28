import { model, Schema, type InferSchemaType } from 'mongoose';
import { DATA_SOURCE_TYPES, isHttpsUrlOrNull } from './enums';

const httpsOrNull = {
  type: String,
  default: null,
  trim: true,
  validate: { validator: isHttpsUrlOrNull, message: 'must be a valid https URL or null' },
};

const providerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9]+(-[a-z0-9]+)*$/,
    },
    logoUrl: httpsOrNull,
    officialBaseUrl: httpsOrNull,
    active: { type: Boolean, default: true },
    dataSourceType: { type: String, enum: DATA_SOURCE_TYPES, required: true, default: 'SEED' },
  },
  { timestamps: true },
);

export type ProviderDoc = InferSchemaType<typeof providerSchema>;
export const Provider = model('Provider', providerSchema);
