import type { TournamentRefusal } from 'contract';

/** Thrown when a tournament can't be set up, joined, left or cancelled. */
export class TournamentRefusedError extends Error {
  constructor(readonly refusal: TournamentRefusal) {
    super(refusal.message);
  }
}

/** Thrown for a tournament request on a draft that has no tournament. */
export class NoTournamentError extends Error {
  constructor() {
    super('This draft has no tournament.');
  }
}
