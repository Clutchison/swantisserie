import type { TournamentRefusal } from 'contract';

/** Thrown when a tournament change is refused, with the refusal the web shows. */
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
 * The refusal of taking a player out of the tournament, putting them back
 * in, or changing their ready, when they haven't joined it.
 */
export const NOT_JOINED: TournamentRefusal = {
  error: 'not-joined',
  message: 'That player hasn’t joined this tournament.',
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
