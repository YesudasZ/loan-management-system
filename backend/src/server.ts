import { createApp } from './app.js';

// Replaced by zod-validated env config in feat/backend-foundation.
const DEFAULT_PORT = 4000;
const port = Number(process.env.PORT ?? DEFAULT_PORT);

createApp().listen(port);
