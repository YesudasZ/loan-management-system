import type { RequestHandler } from 'express';
import { z, type ZodType } from 'zod';

interface RequestSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

/** For routes that accept no body: anything sent is rejected. */
export const emptyBodySchema = z.strictObject({});

/**
 * Validates the request with strict zod schemas (unknown fields → 400) and replaces
 * body/params/query with the parsed values, so controllers can trust their types.
 * A ZodError is turned into 400 VALIDATION_ERROR by the error handler.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    if (schemas.body) {
      // Express 5 leaves req.body undefined when no body was sent.
      req.body = schemas.body.parse(req.body ?? {});
    }
    if (schemas.params) {
      Object.defineProperty(req, 'params', { value: schemas.params.parse(req.params) });
    }
    if (schemas.query) {
      // Express 5 exposes req.query as a getter; defining an own property shadows it
      // with the validated value (for example page numbers coerced from strings).
      Object.defineProperty(req, 'query', { value: schemas.query.parse(req.query) });
    }
    next();
  };
}
