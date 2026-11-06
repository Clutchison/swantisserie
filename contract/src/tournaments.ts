/**
 * How a tournament pairs its players, chosen once at tournament setup. Only
 * round robin for now: Swiss and single elimination come with their specs.
 */
export type TournamentFormat = 'RoundRobin';

/** Registration → Playing → Complete. The glossary has the long form. */
export type TournamentState = 'Registration' | 'Playing' | 'Complete';

/**
 * What every viewer of a draft is told of its tournament, on `DraftView`:
 * enough to show the Tournament tab and know to read the tournament.
 */
export interface TournamentSummaryView {
  state: TournamentState;
}

/** A player who has joined a tournament. */
export interface TournamentEntryView {
  /** The player's Discord user id: a `PlayerView.id`. */
  playerId: string;
}

/**
 * A draft's tournament, from `GET /api/drafts/:id/tournament`, which
 * everyone who sees the draft may read once it exists.
 */
export interface TournamentView {
  format: TournamentFormat;
  state: TournamentState;
  /** In join order. */
  entries: TournamentEntryView[];
}

/** Tournament setup, as the organizer chooses it: all at once, never changed. */
export interface TournamentSetupRequest {
  format: TournamentFormat;
}

/** The fewest cards a deck's mainboard, picks plus basic lands, holds to join a tournament. */
export const MIN_MAINBOARD_CARDS = 40;
