import mongoose from 'mongoose';
import {
  DB_MAX_POOL_SIZE,
  DB_SERVER_SELECTION_TIMEOUT_MS,
  HEALTH_DB_PING_TIMEOUT_MS,
} from './constants.js';

// NoSQL-injection guard: any filter value containing `$` keys is wrapped in `$eq`.
// Operators the code writes on purpose must be wrapped in `mongoose.trusted()`.
mongoose.set('sanitizeFilter', true);
// A typo in a filter path throws instead of silently matching every document.
mongoose.set('strictQuery', 'throw');

export async function connectToDatabase(uri: string): Promise<void> {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: DB_SERVER_SELECTION_TIMEOUT_MS,
    maxPoolSize: DB_MAX_POOL_SIZE,
  });
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
}

/** Returns true when the database answers a ping within the health-check budget. */
export async function isDatabaseReachable(): Promise<boolean> {
  const database = mongoose.connection.db;
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected || !database) {
    return false;
  }

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), HEALTH_DB_PING_TIMEOUT_MS);
  });
  const ping = database
    .admin()
    .command({ ping: 1 })
    .then(() => true)
    .catch(() => false);

  try {
    return await Promise.race([ping, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
