import { z } from 'zod';
import { PIN_CODE_REGEX } from '../models/enums';

/** Query params can arrive as arrays or objects (?a[$ne]=1). z.string() rejects those with a 400. */
export const pinCodeSchema = z
  .string({ error: 'pinCode is required' })
  .trim()
  .regex(PIN_CODE_REGEX, 'pinCode must be a 6-digit PIN code that does not start with 0');
