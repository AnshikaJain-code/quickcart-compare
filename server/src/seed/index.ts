/**
 * CLI: `npm run seed`. Clears and reloads the SAMPLE collections in the database named by
 * MONGODB_URI (works the same for local MongoDB and Atlas). Admin users are never touched.
 */
import { connectDb, connectErrorHint, describeUri, disconnectDb } from '../config/db';
import { EnvValidationError, loadEnv } from '../config/env';
import { loadDotenv } from '../config/loadDotenv';
import { seedDatabase } from './seed';

async function main(): Promise<void> {
  loadDotenv();
  const env = loadEnv();

  if (env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    console.error(
      'Refusing to seed with NODE_ENV=production. Set ALLOW_SEED=true if you really mean it.',
    );
    process.exit(1);
  }

  console.log(`Seeding SAMPLE data into ${describeUri(env.MONGODB_URI)} ...`);
  console.log('This replaces providers, service areas, products, listings and quotes.');
  await connectDb(env.MONGODB_URI);
  const summary = await seedDatabase();
  console.log('Done:', summary);
}

main()
  .catch((err: unknown) => {
    if (err instanceof EnvValidationError) {
      console.error(err.message);
    } else {
      console.error('Seed failed:', err instanceof Error ? err.message : err);
      console.error(connectErrorHint(err));
    }
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());
