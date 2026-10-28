import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { DefaultAdapterRegistry, type AdapterRegistry } from './adapters/registry';
import type { Env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { createLimiter, DEFAULT_RATE_LIMITS, type RateLimitConfig } from './middleware/rateLimit';
import { createApiRouter } from './routes';
import type { CompareDeps } from './services/compareService';

export type AppEnv = Pick<Env, 'CLIENT_ORIGIN'> &
  Partial<Pick<Env, 'TRUST_PROXY' | 'ADAPTER_TIMEOUT_MS' | 'QUOTE_STALE_AFTER_MINUTES'>>;

/** Everything that can be swapped in tests. All fields are optional. */
export interface AppDeps {
  registry?: AdapterRegistry;
  now?: () => Date;
  adapterTimeoutMs?: number;
  staleAfterMinutes?: number;
  rateLimits?: Partial<RateLimitConfig>;
  log?: CompareDeps['log'];
}

export function createApp(env: AppEnv, deps: AppDeps = {}): Express {
  const app = express();

  if (env.TRUST_PROXY && env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN }));
  app.use(express.json({ limit: '100kb' }));

  const limits: RateLimitConfig = { ...DEFAULT_RATE_LIMITS, ...deps.rateLimits };
  const compareDeps: CompareDeps = {
    registry: deps.registry ?? new DefaultAdapterRegistry(),
    now: deps.now ?? (() => new Date()),
    adapterTimeoutMs: deps.adapterTimeoutMs ?? env.ADAPTER_TIMEOUT_MS ?? 3000,
    staleAfterMinutes: deps.staleAfterMinutes ?? env.QUOTE_STALE_AFTER_MINUTES,
    log: deps.log,
  };

  app.use(
    '/api/v1',
    createLimiter(limits.general, (path) => path === '/health'),
  );
  app.use('/api/v1', createApiRouter(compareDeps, createLimiter(limits.compare)));

  app.use(notFoundHandler);
  app.use(errorHandler());

  return app;
}
