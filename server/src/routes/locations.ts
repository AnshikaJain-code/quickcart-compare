import { Router } from 'express';
import { listProviders, validateLocation } from '../controllers/locationsController';

export const locationsRouter = Router();
locationsRouter.get('/locations/validate', validateLocation);
locationsRouter.get('/providers', listProviders);
