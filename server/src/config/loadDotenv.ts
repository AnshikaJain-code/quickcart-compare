import dotenv from 'dotenv';
import path from 'node:path';

/**
 * Loads the single .env at the repo root (server/src/config or server/dist/config -> ../../../.env).
 * Real environment variables always win over the file.
 */
export function loadDotenv(): void {
  dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
}
