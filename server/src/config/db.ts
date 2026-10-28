import mongoose from 'mongoose';

export type DbState = 'connected' | 'connecting' | 'disconnecting' | 'disconnected';

const STATES: Record<number, DbState> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export function dbState(): DbState {
  return STATES[mongoose.connection.readyState] ?? 'disconnected';
}

export interface ConnectOptions {
  /** Test helper: use a specific database name on the given server. */
  dbName?: string;
}

export async function connectDb(uri: string, opts: ConnectOptions = {}): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 10,
    appName: 'quickcart-compare',
    ...(opts.dbName ? { dbName: opts.dbName } : {}),
  });
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

/** Host and database only. Never print the full URI: it contains the password. */
export function describeUri(uri: string): string {
  const m = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)\/?([^?]*)/.exec(uri);
  if (!m) return '(unparseable URI)';
  return `${m[1]}/${m[2] ?? ''}`;
}

/** Turns a driver error into a next-step hint, mostly for first-time Atlas setup. */
export function connectErrorHint(err: unknown): string {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  if (/bad auth|authentication failed|auth failed/i.test(msg)) {
    return 'Authentication failed. Check the database user and password in MONGODB_URI (URL-encode special characters in the password, e.g. @ becomes %40) and that the user has read/write access.';
  }
  if (/ENOTFOUND|querySrv|EAI_AGAIN/i.test(msg)) {
    return 'The cluster host could not be resolved. Check the host in MONGODB_URI (copy it again from Atlas > Connect > Drivers) and your internet/DNS.';
  }
  if (/ssl|tls|certificate/i.test(msg)) {
    return 'A TLS error occurred. Check your system date/time and any VPN or proxy that may intercept TLS.';
  }
  if (/server selection|ECONNREFUSED|timed out|ETIMEDOUT/i.test(msg)) {
    return 'Could not reach the cluster. In Atlas open Security > Network Access and add your current IP address (or 0.0.0.0/0 for a throwaway demo), then retry.';
  }
  return 'See docs/atlas-setup.md for troubleshooting.';
}
