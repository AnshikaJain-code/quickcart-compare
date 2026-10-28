import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, beforeAll, inject } from 'vitest';
import { connectDb, disconnectDb } from '../config/db';

/** Connects this test file to its own throwaway database and drops it afterwards. */
export function useTestDb(): void {
  beforeAll(async () => {
    await connectDb(inject('mongoUri'), { dbName: `test_${randomUUID().replace(/-/g, '')}` });
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDb();
  });
}
