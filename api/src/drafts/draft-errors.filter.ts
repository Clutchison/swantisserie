import {
  type ArgumentsHost,
  Catch,
  ConflictException,
  ForbiddenException,
  type HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type {
  DraftChangeRefusal,
  NotAPlayerProblem,
  PickImportRefusal,
  QueueRefusal,
  UnknownBotProblem,
} from 'contract';
import {
  CloseRefusedError,
  DraftFullError,
  DraftGoneError,
  CannotSeeDraftError,
  DraftStartedError,
  GoneWebhookChosenError,
  NoDraftPowerError,
  NotAPlayerError,
  PauseRefusedError,
  PickImportRefusedError,
  PickRefusedError,
  PlayersChangedError,
  StartRefusedError,
  UndoRefusedError,
  UnknownBotError,
  UnknownWebhookError,
} from './draft-errors.js';
import { PlanRefusedError } from './plans.service.js';
import { PoolFrozenError } from './pool-snapshot.service.js';
import { QueueChangedError, QueueRefusedError } from './queues.service.js';

/**
 * Answers the drafts module's domain errors over HTTP, for the drafts,
 * queues and plans routes, so each error class has one mapping here. The
 * tournament routes answer theirs with TournamentErrorsFilter, which falls
 * back on this mapping. A route
 * may still answer an error its own way before it reaches here, as draft
 * creation does UnknownWebhookError. Anything else, HTTP exceptions
 * included, is answered as Nest would without it.
 */
@Catch()
export class DraftErrorsFilter extends BaseExceptionFilter {
  override catch(err: unknown, host: ArgumentsHost): void {
    super.catch(toHttpError(err) ?? err, host);
  }
}

/**
 * The HTTP answer to a drafts module domain error: 404 for a draft that is
 * gone or one the viewer can't see, for `not-in-pool` and `no-such-bot`; 403 for a power
 * the viewer lacks and for `not-a-player`; 422 for a pick import refusal;
 * 409 for every other refusal. Undefined for any other error.
 */
export function toHttpError(err: unknown): HttpException | undefined {
  if (err instanceof DraftGoneError || err instanceof CannotSeeDraftError) {
    return new NotFoundException();
  }
  if (err instanceof NoDraftPowerError) return new ForbiddenException();
  if (err instanceof NotAPlayerError) {
    return new ForbiddenException({
      error: 'not-a-player',
      message: err.message,
    } satisfies NotAPlayerProblem);
  }
  if (
    err instanceof PickRefusedError ||
    err instanceof QueueRefusedError ||
    err instanceof PlanRefusedError
  ) {
    return err.refusal.error === 'not-in-pool'
      ? new NotFoundException(err.refusal)
      : new ConflictException(err.refusal);
  }
  if (
    err instanceof StartRefusedError ||
    err instanceof UndoRefusedError ||
    err instanceof PauseRefusedError ||
    err instanceof CloseRefusedError
  ) {
    return new ConflictException(err.refusal);
  }
  if (err instanceof PickImportRefusedError) {
    return new UnprocessableEntityException({
      error: 'invalid-pick-import',
      message: err.message,
      problems: err.problems,
    } satisfies PickImportRefusal);
  }
  if (err instanceof UnknownBotError) {
    return new NotFoundException({
      error: 'no-such-bot',
      message: err.message,
    } satisfies UnknownBotProblem);
  }
  if (err instanceof QueueChangedError) {
    return new ConflictException({
      error: 'queue-changed',
      message: err.message,
    } satisfies QueueRefusal);
  }
  for (const [type, error] of DRAFT_CHANGE_REFUSALS) {
    if (err instanceof type) {
      return new ConflictException({
        error,
        message: err.message,
      } satisfies DraftChangeRefusal);
    }
  }
  return undefined;
}

/** The changes the draft's state no longer allows, by the error that says so. */
const DRAFT_CHANGE_REFUSALS: [
  new (...args: never[]) => Error,
  DraftChangeRefusal['error'],
][] = [
  [PoolFrozenError, 'pool-frozen'],
  [PlayersChangedError, 'players-changed'],
  [DraftStartedError, 'draft-started'],
  [DraftFullError, 'draft-full'],
  [UnknownWebhookError, 'webhook-removed'],
  [GoneWebhookChosenError, 'webhook-gone'],
];
