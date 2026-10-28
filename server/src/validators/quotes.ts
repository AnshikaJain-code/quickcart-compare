import { z } from 'zod';

export const quoteParams = z.object({
  quoteId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'quoteId must be a 24-character id'),
});
