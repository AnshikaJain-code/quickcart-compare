import { z } from 'zod';
import { pinCodeSchema } from './common';

export const validatePinQuery = z.object({ pinCode: pinCodeSchema });
export const providersQuery = z.object({ pinCode: pinCodeSchema });
