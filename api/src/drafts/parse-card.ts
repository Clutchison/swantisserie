import { BadRequestException } from '@nestjs/common';

/** The pool card's id in a request body, or a 400 saying `ask` if there isn't one. */
export function parseCard(body: unknown, ask: string): string {
  const { poolCardId } = (body ?? {}) as Record<string, unknown>;
  if (typeof poolCardId !== 'string' || !poolCardId) {
    throw new BadRequestException({ error: 'invalid', message: ask });
  }
  return poolCardId;
}
