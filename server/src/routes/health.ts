import { Router } from 'express';
import { dbState } from '../config/db';
import { getVersion } from '../config/version';

export const healthRouter = Router();

/** Liveness: always "ok" if the process is up. `database` reports the DB link for diagnostics. */
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: getVersion(), database: dbState() });
});
