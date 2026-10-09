import { createApp } from './app.js';
import { connectToDatabase, disconnectFromDatabase } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { initModels } from './models/index.js';

async function start(): Promise<void> {
  await connectToDatabase(env.MONGODB_URI);
  await initModels();

  const server = createApp().listen(env.PORT, () => {
    logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, 'API listening');
  });

  // Render sends SIGTERM before replacing an instance; finish in-flight requests first.
  const shutdown = (signal: NodeJS.Signals) => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      disconnectFromDatabase()
        .then(() => process.exit(0))
        .catch((error: unknown) => {
          logger.error({ err: error }, 'Error while disconnecting from the database');
          process.exit(1);
        });
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

start().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Failed to start the API');
  process.exit(1);
});
