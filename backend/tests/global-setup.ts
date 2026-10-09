import { MongoBinary } from 'mongodb-memory-server';

/**
 * Downloads the MongoDB test binary once, before the test files run in parallel.
 * Otherwise every file races for the same download lock on a cold cache (e.g. in CI).
 */
export default async function setup(): Promise<void> {
  await MongoBinary.getPath();
}
