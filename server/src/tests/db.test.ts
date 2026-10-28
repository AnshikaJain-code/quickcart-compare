import { describe, expect, it } from 'vitest';
import { connectErrorHint, describeUri } from '../config/db';
import { loadEnv } from '../config/env';

describe('describeUri', () => {
  it('never includes the password', () => {
    const uri =
      'mongodb+srv://appuser:s3cr%40t@cluster0.ab1cd.mongodb.net/quickcart-compare?retryWrites=true&w=majority';
    const shown = describeUri(uri);
    expect(shown).toBe('cluster0.ab1cd.mongodb.net/quickcart-compare');
    expect(shown).not.toMatch(/s3cr|appuser/);
  });
  it('handles local URIs', () => {
    expect(describeUri('mongodb://127.0.0.1:27017/x')).toBe('127.0.0.1:27017/x');
  });
});

describe('connectErrorHint', () => {
  it('points to the right Atlas fix for common failures', () => {
    expect(connectErrorHint(new Error('bad auth : Authentication failed.'))).toMatch(/password/i);
    expect(connectErrorHint(new Error('querySrv ENOTFOUND _mongodb._tcp.cluster0.x'))).toMatch(
      /host/i,
    );
    expect(connectErrorHint(new Error('Server selection timed out after 10000 ms'))).toMatch(
      /Network Access/,
    );
    expect(connectErrorHint(new Error('weird'))).toMatch(/atlas-setup/);
  });
});

describe('MONGODB_URI validation (Atlas-friendly)', () => {
  const rest = { CLIENT_ORIGIN: 'http://localhost:5173', JWT_SECRET: 'a'.repeat(32) };
  const ok = (uri: string) => () => loadEnv({ ...rest, MONGODB_URI: uri });

  it('accepts Atlas SRV and local URIs that name a database', () => {
    expect(
      ok(
        'mongodb+srv://u:p@cluster0.ab1cd.mongodb.net/quickcart-compare?retryWrites=true&w=majority',
      ),
    ).not.toThrow();
    expect(ok('mongodb://127.0.0.1:27017/quickcart-compare')).not.toThrow();
  });
  it('rejects a URI that still has <placeholders> (the usual first-time mistake)', () => {
    expect(
      ok('mongodb+srv://<db-user>:<db-password>@cluster0.ab1cd.mongodb.net/quickcart-compare'),
    ).toThrow(/placeholders/);
    expect(
      ok('mongodb+srv://user:<password>@cluster0.ab1cd.mongodb.net/quickcart-compare'),
    ).toThrow(/placeholders/);
  });
  it('rejects a pasted https link, and a URI without a database name', () => {
    expect(ok('https://cloud.mongodb.com/v2/abc')).toThrow(/mongodb:\/\//);
    expect(ok('mongodb+srv://u:p@cluster0.ab1cd.mongodb.net/?retryWrites=true')).toThrow(
      /database name/,
    );
    expect(ok('mongodb+srv://u:p@cluster0.ab1cd.mongodb.net')).toThrow(/database name/);
  });
});
