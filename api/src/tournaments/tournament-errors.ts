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
 * Who a request on a tournament entry comes from, which decides a refusal's
 * wording: `self` when the signed-in player acts on their own entry (an
 * organizer included), `organizer` when an organizer acts on another
 * player's.
 */
export type EntryActor = 'self' | 'organizer';

/**
 * The refusal of taking a player out of the tournament, putting them back
 * in, or changing their ready, when they haven't joined it: worded to the
 * player for `self`, and to the organizer acting on them otherwise.
 */
export function notJoined(actor: EntryActor): TournamentRefusal {
  return {
    error: 'not-joined',
    message:
      actor === 'self'
        ? 'You haven’t joined this tournament.'
        : 'That player hasn’t joined this tournament.',
  };
}

/**
 * The refusal of dropping a player who has already dropped, worded as
 * `notJoined` is.
 */
export function alreadyDropped(actor: EntryActor): TournamentRefusal {
  return {
    error: 'already-dropped',
    message:
      actor === 'self'
        ? 'You’ve already dropped.'
        : 'That player has already dropped.',
  };
}

/**
 * The refusal of reinstating a player who hasn't dropped, worded as
 * `notJoined` is.
 */
export function notDropped(actor: EntryActor): TournamentRefusal {
  return {
    error: 'not-dropped',
    message:
      actor === 'self' ? 'You haven’t dropped.' : 'That player hasn’t dropped.',
  };
}

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
