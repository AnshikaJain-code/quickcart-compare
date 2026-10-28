import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

/** Standard error body for every API error (CLAUDE.md "API"). */
export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`));
};

interface HttpLikeError {
  status?: number;
  statusCode?: number;
  type?: string;
}

function body(code: string, message: string, details?: unknown): ErrorBody {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

/**
 * Central error handler. Never leaks stack traces or internals to the client;
 * unexpected errors are logged server-side and returned as a generic 500.
 */
export const errorHandler =
  (opts: { log?: (err: unknown) => void } = {}): ErrorRequestHandler =>
  (err, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    if (err instanceof AppError) {
      res.status(err.status).json(body(err.code, err.message, err.details));
      return;
    }

    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      res.status(400).json(body('VALIDATION_ERROR', 'Request validation failed', details));
      return;
    }

    const http = err as HttpLikeError;
    if (http?.type === 'entity.too.large') {
      res.status(413).json(body('PAYLOAD_TOO_LARGE', 'Request body is too large'));
      return;
    }
    if (http?.type === 'entity.parse.failed') {
      res.status(400).json(body('INVALID_JSON', 'Request body is not valid JSON'));
      return;
    }

    (opts.log ?? ((e) => console.error('[unhandled error]', e)))(err);
    res.status(500).json(body('INTERNAL_ERROR', 'Something went wrong on our side'));
  };
