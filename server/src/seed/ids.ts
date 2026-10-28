import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import type { ProviderKey } from './data';

/** Same key always gives the same ObjectId, so reseeding keeps ids stable (baskets survive). */
export function stableId(namespace: string, key: string): Types.ObjectId {
  const hex = createHash('sha1').update(`${namespace}:${key}`).digest('hex').slice(0, 24);
  return new Types.ObjectId(hex);
}

export const ids = {
  provider: (k: ProviderKey) => stableId('provider', k),
  product: (key: string) => stableId('product', key),
  listing: (k: ProviderKey, productKey: string) => stableId('listing', `${k}:${productKey}`),
  quote: (k: ProviderKey, pin: string, tag: string) => stableId('quote', `${k}:${pin}:${tag}`),
};
