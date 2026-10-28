import type { Schema } from 'mongoose';

const QUERY_OPS = [
  'updateOne',
  'updateMany',
  'replaceOne',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
  'deleteOne',
  'deleteMany',
] as const;

/**
 * Makes a collection insert-only through Mongoose: updates and deletes throw.
 * This is a guard against accidental edits, not a security boundary
 * (the raw driver via `Model.collection` or `bulkWrite` can still modify data;
 * the seed script uses that on purpose to reset sample data).
 */
export function makeAppendOnly(schema: Schema, label: string): void {
  const fail = () => {
    throw new Error(`${label} are append-only: create a new record instead of changing one.`);
  };
  for (const op of QUERY_OPS) schema.pre(op, { document: false, query: true }, fail);
  schema.pre('deleteOne', { document: true, query: false }, fail);
  schema.pre('save', function () {
    if (!this.isNew) fail();
  });
}
