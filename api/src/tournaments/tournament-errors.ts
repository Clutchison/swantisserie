import type { TournamentRefusal } from 'contract';

/** Thrown when a tournament can't be set up, joined, left or cancelled. */
export class TournamentRefusedError extends Error {
  constructor(readonly refusal: TournamentRefusal) {
    super(refusal.message);
  }
}

/**
 * The refusal of taking a bot out of its tournament, by leaving, removal or
 * a drop, or of reinstating one: a bot stays in from setup to the end.
 */
export const BOT_ENTRY: TournamentRefusal = {
  error: 'bot-entry',
  message:
    'A bot stays in its tournament: it can’t leave, be removed, drop or be reinstated.',
};

/**
 * Thrown for a tournament request whose body names something it can't: a
 * 400, as a body that isn't the request's shape is.
 */
export class InvalidTournamentRequestError extends Error {}

/** Thrown for a match request naming a match the tournament doesn't have. */
export class NoMatchError extends Error {
  constructor() {
    super('This tournament has no such match.');
  }
}

/** Thrown for a tournament request on a draft that has no tournament. */
export class NoTournamentError extends Error {
  constructor() {
    super('This draft has no tournament.');
  }
}
