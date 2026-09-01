import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from './errorHandler.js';

/**
 * Generic validation middleware factory.
 *
 * Pass a Zod schema and the source to validate (body, query, or params).
 * For query/params, the schema should expect the raw object; we cast
 * appropriately so callers can use one consistent interface.
 *
 * Usage:
 *   validate(loginSchema)               // body
 *   validate(listDealsQuerySchema, 'query')
 *   validate(idParamSchema, 'params')
 */
export const validate = (
  schema: ZodSchema,
  source: 'body' | 'query' | 'params' = 'body',
) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const data = source === 'body' ? req.body : source === 'query' ? req.query : req.params;
      const parsed = schema.parse(data);
      // Re-assign the parsed (and possibly coerced/transformed) data so
      // downstream handlers see the validated shape.
      if (source === 'body') {
        req.body = parsed;
      } else if (source === 'query') {
        // Express's req.query is read-only; mutate the underlying object's
        // properties instead of replacing it.
        Object.assign(req.query as Record<string, unknown>, parsed);
      } else {
        // params is also read-only, but Express 4 accepts assignment to it
        // on the request object (it stores them in `req.params`).
        (req as unknown as { params: Record<string, string> }).params = {
          ...(req.params as Record<string, string>),
          ...(parsed as Record<string, string>),
        };
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ');
        throw new ValidationError(message);
      }
      throw new ValidationError(`Invalid ${source}`);
    }
  };
};
