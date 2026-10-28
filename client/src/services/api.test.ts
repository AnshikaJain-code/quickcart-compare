import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from './api';

afterEach(() => vi.unstubAllGlobals());

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    }),
  );
}

describe('apiRequest', () => {
  it('parses an error body into an ApiError', async () => {
    mockFetch(400, { error: { code: 'VALIDATION_ERROR', message: 'Bad PIN' } });
    await expect(apiRequest('/x')).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Bad PIN',
    });
  });

  it('falls back to HTTP_ERROR when the error body is not the standard shape', async () => {
    mockFetch(502, { oops: true });
    await expect(apiRequest('/x')).rejects.toMatchObject({ status: 502, code: 'HTTP_ERROR' });
  });

  it('maps network failures to NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')));
    const err = await apiRequest('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('NETWORK_ERROR');
  });
});
