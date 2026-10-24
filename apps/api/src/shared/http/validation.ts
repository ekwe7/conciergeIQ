import type { z } from 'zod';
import { ValidationError } from '../errors/app-error.js';

/** Parses untrusted input with a Zod schema, or throws a 400 listing what is wrong. */
export function parseInput<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError('The request is not valid', result.error.flatten());
  }
  return result.data;
}
