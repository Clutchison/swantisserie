import { BadRequestException } from '@nestjs/common';
import type { PoolCardRequest } from 'contract';
import { bodyFields } from '../request-body.js';

/** The pool card's id in a request body, or a 400 saying `ask` if there isn't one. */
export function parseCard(body: unknown, ask: string): string {
  const { poolCardId } = bodyFields<PoolCardRequest>(body);
  if (typeof poolCardId !== 'string' || !poolCardId) {
    throw new BadRequestException({ error: 'invalid', message: ask });
  }
  return poolCardId;
}
