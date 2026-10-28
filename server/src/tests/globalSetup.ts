import { MongoMemoryServer } from 'mongodb-memory-server-core';

/**
 * Starts ONE in-memory MongoDB for the whole run; each test file uses its own database on it.
 * First run downloads a mongod binary (cached afterwards). Set MONGOMS_SYSTEM_BINARY to use one you have.
 */
let mongod: MongoMemoryServer | undefined;

export default async function setup(project: {
  provide: (key: 'mongoUri', value: string) => void;
}) {
  mongod = await MongoMemoryServer.create();
  project.provide('mongoUri', mongod.getUri());
  return async () => {
    await mongod?.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
