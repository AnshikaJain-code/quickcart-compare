import { createApp } from './app';
import { connectDb, connectErrorHint, describeUri, disconnectDb } from './config/db';
import { EnvValidationError, loadEnv } from './config/env';
import { loadDotenv } from './config/loadDotenv';

loadDotenv();

async function main(): Promise<void> {
  const env = loadEnv();

  console.log(`Connecting to MongoDB at ${describeUri(env.MONGODB_URI)} ...`);
  await connectDb(env.MONGODB_URI);
  console.log('MongoDB connected.');

  const app = createApp(env);
  const server = app.listen(env.PORT, () => {
    console.log(`QuickCart Compare API listening on http://localhost:${env.PORT}/api/v1`);
  });

  const shutdown = () => {
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  if (err instanceof EnvValidationError) {
    console.error(err.message);
    console.error('\nCopy .env.example to .env and fill in the values.');
  } else {
    console.error('Startup failed:', err instanceof Error ? err.message : err);
    console.error(connectErrorHint(err));
  }
  process.exit(1);
});
