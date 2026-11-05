import type {
  CloseRefusal,
  CubeLinkProblem,
  PauseRefusal,
  PickRefusal,
  PoolQueryProblem,
  StartRefusal,
  UndoRefusal,
} from 'contract';
import { MAX_PLAYERS } from 'engine';
import { Prisma } from '../generated/prisma/client.js';

export class PoolQueryError extends Error {
  constructor(readonly problem: PoolQueryProblem) {
    super(problem.message);
  }
}

export class CubeLinkError extends Error {
  constructor(readonly problem: CubeLinkProblem) {
    super(problem.message);
  }
}

/**
 * Says how many of a pool source's cards (`where`, e.g. "in this cube")
 * aren't on the platform, without a closing full stop.
 */
export function notOnPlatformSentence(
  count: number,
  where: string,
  platform: string,
): string {
  return count === 1
    ? `1 card ${where} is not on ${platform}`
    : `${count} cards ${where} are not on ${platform}`;
}

/** Thrown when a draft is given a webhook that doesn't exist, e.g. one just removed. */
export class UnknownWebhookError extends Error {
  constructor() {
    super('That webhook has been removed. Choose another.');
  }
}

/** Rethrows a failed save of a draft, as UnknownWebhookError if its webhook doesn't exist. */
export function rethrowMissingWebhook(err: unknown): never {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2003'
  ) {
    throw new UnknownWebhookError();
  }
  throw err;
}

/** Thrown when a change only allowed in Lobby is tried after the draft started. */
export class DraftStartedError extends Error {
  constructor() {
    super('This draft has started.');
  }
}

/** Thrown when a change only allowed in Lobby finds the draft was just cancelled. */
export class DraftGoneError extends Error {
  constructor() {
    super('This draft was cancelled.');
  }
}

/**
 * Thrown when a viewer asks for a draft they may not see: for now, one that
 * doesn't exist.
 */
export class DraftHiddenError extends Error {
  constructor() {
    super('There is no such draft.');
  }
}

/** Thrown when a viewer asks to do something their draft powers don't allow. */
export class NoDraftPowerError extends Error {
  constructor() {
    super('You can’t do that in this draft.');
  }
}

/** Thrown when someone who isn't playing in a draft asks to pick, or for a queue or plan, in it. */
export class NotAPlayerError extends Error {
  constructor(what: 'queues' | 'plans' | 'picks') {
    super(
      what === 'picks'
        ? 'Only the draft’s players can pick.'
        : `Only the draft’s players have ${what}.`,
    );
  }
}

/** Thrown when a seat order doesn't list exactly the draft's players. */
export class PlayersChangedError extends Error {
  constructor() {
    super('The players have changed. Reload and try again.');
  }
}

/** Thrown when a player is added to a draft that has as many as it can. */
export class DraftFullError extends Error {
  constructor() {
    super(`A draft can have at most ${MAX_PLAYERS} players.`);
  }
}

/** Thrown when removing a bot the draft doesn't have. */
export class UnknownBotError extends Error {
  constructor() {
    super('That bot isn’t in this draft.');
  }
}

export class StartRefusedError extends Error {
  constructor(readonly refusal: StartRefusal) {
    super(refusal.message);
  }
}

/** Thrown when a pick import's file can't be imported, with all that's wrong with it. */
export class PickImportRefusedError extends Error {
  constructor(readonly problems: string[]) {
    super('This file can’t be imported.');
  }
}

export class PickRefusedError extends Error {
  constructor(readonly refusal: PickRefusal) {
    super(refusal.message);
  }
}

export class UndoRefusedError extends Error {
  constructor(readonly refusal: UndoRefusal) {
    super(refusal.message);
  }
}

export class PauseRefusedError extends Error {
  constructor(readonly refusal: PauseRefusal) {
    super(refusal.message);
  }
}

export class CloseRefusedError extends Error {
  constructor(readonly refusal: CloseRefusal) {
    super(refusal.message);
  }
}
