import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** Parses an untrusted HTTP body, answering 400 with the field errors when it does not match. */
export function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new BadRequestException(z.flattenError(result.error));
  return result.data;
}
