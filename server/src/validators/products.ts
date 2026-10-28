import { z } from 'zod';
import { CATEGORIES } from '../models/enums';

export const productsQuery = z.object({
  query: z.string().trim().max(64, 'query must be at most 64 characters').optional(),
  category: z.enum(CATEGORIES).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ProductsQuery = z.infer<typeof productsQuery>;
