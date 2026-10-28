import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { AppError } from './errors';

export interface LimitOptions {
  windowMs: number;
  limit: number;
}

export interface RateLimitConfig {
  /** Applied to every /api/v1 route except /health. */
  general: LimitOptions;
  /** Extra, stricter limit on POST /compare (it fans out to every provider). */
  compare: LimitOptions;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  general: { windowMs: 60_000, limit: 300 },
  compare: { windowMs: 60_000, limit: 60 },
};

/** Returns 429 in the standard error shape, with a Retry-After header. */
export function createLimiter(
  opts: LimitOptions,
  skip?: (path: string) => boolean,
): RequestHandler {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: skip ? (req) => skip(req.path) : undefined,
    handler: (_req, res, next) => {
      res.setHeader('Retry-After', String(Math.ceil(opts.windowMs / 1000)));
      next(
        new AppError(429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.'),
      );
    },
  });
}
