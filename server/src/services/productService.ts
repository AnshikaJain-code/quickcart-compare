import type { QueryFilter } from 'mongoose';
import { CanonicalProduct, type CanonicalProductDoc } from '../models/CanonicalProduct';
import type { ProductsQuery } from '../validators/products';

export interface ProductDto {
  id: string;
  name: string;
  brand: string;
  category: string;
  variant: string;
  quantityValue: number;
  quantityUnit: string;
  packLabel: string;
  imageUrl: string | null;
  identifiers: { gtin: string | null; sku: string | null };
}

export interface ProductPage {
  data: ProductDto[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "milk 500ml" becomes ["milk", "500", "ml"]; every token must match somewhere (AND). */
export function tokenise(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/(\d)([a-z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
}

export async function listProducts(q: ProductsQuery): Promise<ProductPage> {
  const filter: QueryFilter<CanonicalProductDoc> = {};
  if (q.category) filter.category = q.category;

  const tokens = q.query ? tokenise(q.query) : [];
  if (tokens.length > 0) {
    filter.$and = tokens.map((t) => {
      const re = new RegExp(escapeRegex(t), 'i');
      return { $or: [{ name: re }, { brand: re }, { variant: re }, { packLabel: re }] };
    });
  }

  const [total, docs] = await Promise.all([
    CanonicalProduct.countDocuments(filter),
    CanonicalProduct.find(filter)
      .sort({ name: 1, brand: 1, variant: 1, baseUnit: 1, quantityBase: 1, _id: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
  ]);

  return {
    data: docs.map((d) => ({
      id: String(d._id),
      name: d.name,
      brand: d.brand,
      category: d.category,
      variant: d.variant ?? '',
      quantityValue: d.quantityValue,
      quantityUnit: d.quantityUnit,
      packLabel: d.packLabel,
      imageUrl: d.imageUrl ?? null,
      identifiers: { gtin: d.identifiers?.gtin ?? null, sku: d.identifiers?.sku ?? null },
    })),
    page: q.page,
    limit: q.limit,
    total,
    totalPages: Math.ceil(total / q.limit),
  };
}
