import type { Mock } from 'vitest';
import { DRAFT_CREATION_DEADLINE_MS } from '../drafts/draft-lobby.service.js';
import { pastDeadline } from './deadlines.js';

/**
 * What `create` answers when the outside call `waitedOn` doesn't answer
 * within the draft creation deadline.
 */
export function createPastDeadline<T>(
  create: () => PromiseLike<T>,
  waitedOn: Mock,
): Promise<T> {
  return pastDeadline(create, waitedOn, DRAFT_CREATION_DEADLINE_MS);
}
