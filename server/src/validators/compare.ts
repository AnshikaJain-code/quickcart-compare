import { z } from 'zod';
import { pinCodeSchema } from './common';

export const MAX_BASKET_LINES = 25;
export const MAX_QUANTITY = 20;

const itemSchema = z
  .object({
    productId: z
      .string({ error: 'productId is required' })
      .regex(/^[0-9a-fA-F]{24}$/, 'productId must be a 24-character product id'),
    quantity: z
      .number({ error: 'quantity must be a number' })
      .int('quantity must be a whole number')
      .min(1, 'quantity must be at least 1')
      .max(MAX_QUANTITY, `quantity must be at most ${MAX_QUANTITY}`),
  })
  .strict();

const weightsSchema = z
  .object({
    priceWeight: z.number({ error: 'priceWeight must be a number' }).min(0).max(1),
    timeWeight: z.number({ error: 'timeWeight must be a number' }).min(0).max(1),
  })
  .strict()
  .refine((w) => Math.abs(w.priceWeight + w.timeWeight - 1) <= 1e-6, {
    message: 'priceWeight and timeWeight must add up to 1',
  });

export const compareBody = z
  .object({
    pinCode: pinCodeSchema,
    items: z
      .array(itemSchema, { error: 'items must be an array' })
      .min(1, 'the basket must contain at least one item')
      .max(MAX_BASKET_LINES, `the basket can contain at most ${MAX_BASKET_LINES} different items`),
    sortBy: z
      .enum(['total', 'eta', 'balance'], { error: 'sortBy must be total, eta or balance' })
      .default('total'),
    mode: z
      .enum(['full-basket', 'partial'], { error: 'mode must be full-basket or partial' })
      .default('full-basket'),
    allowSubstitutes: z.boolean({ error: 'allowSubstitutes must be true or false' }).default(false),
    weights: weightsSchema.optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    body.items.forEach((item, index) => {
      const key = item.productId.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'productId'],
          message: 'each product may appear only once; increase its quantity instead',
        });
      }
      seen.add(key);
    });
  });

export type CompareBody = z.infer<typeof compareBody>;
