import type { RequestHandler } from 'express';
import { z, type ZodType } from 'zod';

interface RequestSchemas {
  body?: ZodType;
  params?: ZodType;
}

// Express's router reassigns req.params while routing (for example on its way to the error
// handler), so the replaced properties must stay writable.
const WRITABLE_PROPERTY = { writable: true, enumerable: true, configurable: true };

/** For routes that accept no body: anything sent is rejected. */
export const emptyBodySchema = z.strictObject({});

/**
 * Validates the body and route params with strict zod schemas (unknown fields → 400) and
 * replaces them with the parsed values, so controllers can trust their types. A ZodError is
 * turned into 400 VALIDATION_ERROR by the error handler. Query strings are parsed in the
 * controllers that use them (Express's types don't allow a narrowed req.query).
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    if (schemas.body) {
      // Express 5 leaves req.body undefined when no body was sent.
      req.body = schemas.body.parse(req.body ?? {});
    }
    if (schemas.params) {
      Object.defineProperty(req, 'params', {
        value: schemas.params.parse(req.params),
        ...WRITABLE_PROPERTY,
      });
    }
    next();
  };
}
