import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv } from '../config/env';

const valid = {
  MONGODB_URI: 'mongodb://localhost:27017/x',
  CLIENT_ORIGIN: 'http://localhost:5173',
  JWT_SECRET: 'a'.repeat(32),
};

describe('loadEnv', () => {
  it('applies defaults and accepts a valid config', () => {
    const env = loadEnv(valid);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.GEOCODING_API_KEY).toBeUndefined();
  });

  it('treats blank optional keys as unset', () => {
    expect(loadEnv({ ...valid, PROVIDER_API_KEY: '' }).PROVIDER_API_KEY).toBeUndefined();
  });

  it('rejects a short JWT secret and a bad origin, listing every problem', () => {
    expect(() => loadEnv({ ...valid, JWT_SECRET: 'short', CLIENT_ORIGIN: 'nope' })).toThrow(
      EnvValidationError,
    );
    try {
      loadEnv({ ...valid, JWT_SECRET: 'short', CLIENT_ORIGIN: 'nope' });
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('JWT_SECRET');
      expect(msg).toContain('CLIENT_ORIGIN');
    }
  });

  it('rejects a missing MONGODB_URI', () => {
    expect(() => loadEnv({ ...valid, MONGODB_URI: undefined })).toThrow(/MONGODB_URI/);
  });
});
