import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/app-error.js';

// Errors raised by express.json() carry one of these `type` values.
const bodyParserErrorSchema = z.object({
  type: z.enum(['entity.parse.failed', 'entity.too.large']),
});

// Other library errors that are the client's fault say so with a 4xx `status` (the http-errors
// convention used by body-parser and Express's router): an unsupported charset or
// Content-Encoding, a corrupt compressed body, a badly %-encoded path. They must not be 500s.
const clientErrorSchema = z.object({ status: z.number().int().min(400).max(499) });

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Route not found'));
};

/** A generic message per status: the library's own message can reveal internals. */
function toClientAppError(status: number): AppError {
  if (status === 413) {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  if (status === 415) {
    return new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported content type or encoding');
  }
  return new AppError(400, 'BAD_REQUEST', 'The request could not be understood');
}

/** Maps any thrown value to a client-safe AppError. Unknown errors never leak their details. */
function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details);
  }
  const bodyParserError = bodyParserErrorSchema.safeParse(error);
  if (bodyParserError.success) {
    return bodyParserError.data.type === 'entity.too.large'
      ? new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large')
      : new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  }
  const clientError = clientErrorSchema.safeParse(error);
  if (clientError.success) {
    return toClientAppError(clientError.data.status);
  }
  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again later.');
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  // A streamed response that fails halfway can't get a JSON body any more.
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = toAppError(error);
  if (appError.statusCode >= 500) {
    logger.error({ err: error }, 'Unhandled error');
  }

  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined && { details: appError.details }),
    },
  });
};
