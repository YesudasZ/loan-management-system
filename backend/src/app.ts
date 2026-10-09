import express, { type Express, type Request, type Response } from 'express';

/**
 * Builds the Express app without starting a server, so tests can call it directly.
 * Middleware, routes and the central error handler are added in later branches.
 */
export function createApp(): Express {
  const app = express();

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  return app;
}
