import type { RequestHandler } from 'express';
import { getCoverage, validatePin } from '../services/coverageService';
import { providersQuery, validatePinQuery } from '../validators/locations';

export const validateLocation: RequestHandler = async (req, res) => {
  const { pinCode } = validatePinQuery.parse(req.query);
  res.json(await validatePin(pinCode));
};

export const listProviders: RequestHandler = async (req, res) => {
  const { pinCode } = providersQuery.parse(req.query);
  const { providers, isSampleData } = await getCoverage(pinCode);
  res.json({ pinCode, data: providers, isSampleData });
};
