import { Router, type RequestHandler } from 'express';
import type { CompareDeps } from '../services/compareService';
import { createCompareRouter } from './compare';
import { healthRouter } from './health';
import { locationsRouter } from './locations';
import { productsRouter } from './products';

/** Mounted at /api/v1 */
export function createApiRouter(deps: CompareDeps, compareLimiter: RequestHandler): Router {
  const api = Router();
  api.use(healthRouter);
  api.use(locationsRouter);
  api.use(productsRouter);
  api.use(createCompareRouter(deps, compareLimiter));
  return api;
}
