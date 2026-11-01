import { MAX_PLAYERS, type PickProblem, type StartProblem } from 'engine';

/** Why a pool query can't make a pool; sent to the organizer as is. */
export type PoolQueryProblem =
  | {
      error: 'not-on-arena';
      message: string;
      /** The first page of offending card names. */
      cards: string[];
      totalCards: number;
    }
  | { error: 'no-cards'; message: string }
  | {
      /** Scryfall couldn't run the query, or ignored some of its terms. */
      error: 'query-rejected';
      message: string;
      warnings: string[];
    };

export class PoolQueryError extends Error {
  constructor(readonly problem: PoolQueryProblem) {
    super(problem.message);
  }
}

/** Thrown when a draft is given a webhook that doesn't exist, e.g. one just removed. */
export class UnknownWebhookError extends Error {
  constructor() {
    super('That webhook has been removed. Choose another.');
  }
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

/** Why the organizer can't start the draft; sent to them as is. */
export type StartRefusal =
  StartProblem | { error: 'pool-not-ready'; message: string };

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

/** Why a player can't make a pick; sent to them as is. */
export type PickRefusal =
  PickProblem | { error: 'not-drafting' | 'not-in-pool'; message: string };

export class PickRefusedError extends Error {
  constructor(readonly refusal: PickRefusal) {
    super(refusal.message);
  }
}

/** Why the organizer can't undo a pick; sent to them as is. */
export interface UndoRefusal {
  error: 'not-drafting' | 'not-latest';
  message: string;
}

export class UndoRefusedError extends Error {
  constructor(readonly refusal: UndoRefusal) {
    super(refusal.message);
  }
}

/** Why the organizer can't pause or resume the draft; sent to them as is. */
export interface PauseRefusal {
  error: 'not-drafting' | 'not-paused';
  message: string;
}

export class PauseRefusedError extends Error {
  constructor(readonly refusal: PauseRefusal) {
    super(refusal.message);
  }
}

/** Why the organizer can't close or reopen the draft; sent to them as is. */
export interface CloseRefusal {
  error: 'not-closable' | 'not-closed';
  message: string;
}

export class CloseRefusedError extends Error {
  constructor(readonly refusal: CloseRefusal) {
    super(refusal.message);
  }
}
