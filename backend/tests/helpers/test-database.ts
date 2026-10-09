import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectToDatabase, disconnectFromDatabase } from '../../src/config/db.js';
import { initModels } from '../../src/models/index.js';

let replicaSet: MongoMemoryReplSet | undefined;

/** Starts a one-node replica set (transactions need one) and connects mongoose to it. */
export async function startTestDatabase(): Promise<void> {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await connectToDatabase(replicaSet.getUri('lms_test'));
  await initModels();
}

/** Empties every collection but keeps the indexes (dropDatabase would remove them). */
export async function clearTestDatabase(): Promise<void> {
  const collections = await mongoose.connection.db?.collections();
  await Promise.all((collections ?? []).map((collection) => collection.deleteMany({})));
}

export async function stopTestDatabase(): Promise<void> {
  await disconnectFromDatabase();
  await replicaSet?.stop();
  replicaSet = undefined;
}
