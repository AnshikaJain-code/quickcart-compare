import { Router, type RequestHandler } from 'express';
import { getQuote, postCompare } from '../controllers/compareController';
import type { CompareDeps } from '../services/compareService';

export function createCompareRouter(deps: CompareDeps, compareLimiter: RequestHandler): Router {
  const router = Router();
  router.post('/compare', compareLimiter, postCompare(deps));
  router.get('/quotes/:quoteId', getQuote(deps));
  return router;
}
