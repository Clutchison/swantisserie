/**
 * The 400 any malformed request to the drafts api gets: a field is missing
 * or isn't one the route accepts. `message` says what to fix.
 */
export interface RequestProblem {
  error: 'invalid';
  message: string;
}

/** Some of a pool query's or cube's cards aren't on the draft's platform. */
export interface NotOnPlatformProblem {
  error: 'not-on-platform';
  message: string;
  /** Offending card names: a pool query's first page of them, or all of a cube's. */
  cards: string[];
  totalCards: number;
}

/** Why a pool query can't make a pool; sent to the organizer as is. */
export type PoolQueryProblem =
  | NotOnPlatformProblem
  | { error: 'no-cards'; message: string }
  | {
      /** Scryfall couldn't run the query, or ignored some of its terms. */
      error: 'query-rejected';
      message: string;
      warnings: string[];
    };

/** Why a cube link can't make a pool; sent to the organizer as is. */
export type CubeLinkProblem =
  | NotOnPlatformProblem
  | {
      /**
       * The link isn't to a CubeCobra cube, CubeCobra has no public cube
       * with its id, or the cube's mainboard is empty.
       */
      error: 'not-a-cube-link' | 'cube-not-found' | 'no-cards';
      message: string;
    };

/** The body of a failed POST /api/drafts: what to tell the organizer. */
export type DraftCreationProblem =
  | PoolQueryProblem
  | CubeLinkProblem
  /** A field to fix, or a webhook that has since been removed or gone. */
  | RequestProblem
  | { error: 'scryfall-unavailable'; message: string }
  | {
      /** CubeCobra failed, or answered with something we can't read. */
      error: 'cubecobra-unavailable';
      message: string;
    };

/**
 * Why the organizer can't start the draft; sent to them as is. The api
 * passes on engine's StartProblem codes, so typecheck ties the two.
 * `pool-not-ready` and `pool-snapshot-failed` come from the api's own
 * snapshot check: the snapshot is still running, or it failed and must
 * be retried.
 */
export interface StartRefusal {
  error:
    | 'player-count'
    | 'pool-too-small'
    | 'pool-not-ready'
    | 'pool-snapshot-failed';
  message: string;
}

/**
 * Why a player can't make a pick; sent to them as is. The api passes on
 * engine's PickProblem codes, so typecheck ties the two.
 */
export interface PickRefusal {
  error: 'not-your-turn' | 'already-picked' | 'not-drafting' | 'not-in-pool';
  message: string;
}

/** Why the organizer can't undo a pick; sent to them as is. */
export interface UndoRefusal {
  error: 'not-drafting' | 'not-latest';
  message: string;
}

/** Why the organizer can't pause or resume the draft; sent to them as is. */
export interface PauseRefusal {
  error: 'not-drafting' | 'not-paused';
  message: string;
}

/** Why the organizer can't close or reopen the draft; sent to them as is. */
export interface CloseRefusal {
  error: 'not-closable' | 'not-closed';
  message: string;
}

/**
 * The 404 adding or removing a bot gets when the bot named isn't one. Not a
 * DraftRefusal: the draft hasn't moved on, the request named nothing.
 */
export interface UnknownBotProblem {
  error: 'no-such-bot';
  message: string;
}

/** Why a change to a draft's players, seats, pool or webhook was refused. */
export interface DraftChangeRefusal {
  error:
    | 'draft-started'
    | 'draft-full'
    | 'players-changed'
    | 'pool-frozen'
    | 'webhook-removed'
    | 'webhook-gone';
  message: string;
}

/** Why a card can't be queued, or the queue reordered; sent to the player as is. */
export interface QueueRefusal {
  error:
    | 'not-in-pool'
    | 'already-picked'
    | 'draft-complete'
    | 'draft-closed'
    | 'your-turn'
    | 'queue-changed';
  message: string;
}

/** Why a plan can't be changed; sent to the player as is. */
export interface PlanRefusal {
  error:
    /** The card isn't in the player's plan: its pick was undone, or it was lost. */
    | 'not-in-plan'
    /** The card is one of the player's picks, so it can't be removed from the plan. */
    | 'a-pick'
    | 'not-in-pool'
    | 'already-picked'
    /** Every available copy of the card is in the plan already. */
    | 'no-copies-left'
    | 'draft-complete'
    | 'draft-closed'
    /** The player has joined a tournament in registration or playing, which locks their deck. */
    | 'deck-locked';
  message: string;
}

/**
 * Why a tournament can't be set up, joined, left, started, reported in,
 * completed or cancelled; sent as is. A report's game score is refused with
 * the engine's ReportProblem codes, `draw` and `not-best-of-three`, so
 * typecheck ties the two.
 */
export interface TournamentRefusal {
  error:
    /** Only a complete draft can have a tournament. */
    | 'draft-not-complete'
    /** A draft has at most one tournament. */
    | 'tournament-exists'
    /** Joining, leaving, starting and cancelling for now happen only during registration. */
    | 'not-in-registration'
    /** The mainboard, picks plus basic lands, holds fewer than MIN_MAINBOARD_CARDS. */
    | 'deck-too-small'
    | 'bots-cannot-join'
    | 'already-joined'
    | 'not-joined'
    /** Start needs at least 2 joined players. */
    | 'too-few-entries'
    /** Reporting, dropping and completing happen only while the tournament is playing. */
    | 'not-playing'
    /** Only a match's own players report it. */
    | 'not-your-match'
    /** A reported match is locked to its players. */
    | 'match-reported'
    | 'draw'
    | 'not-best-of-three'
    /** A dropped player can't drop again; only a drop can be taken back. */
    | 'already-dropped'
    | 'not-dropped';
  message: string;
}

/** The 404 a match request gets when the tournament has no such match. */
export interface NoMatchProblem {
  error: 'no-match';
  message: string;
}

/**
 * The 404 a tournament request gets when the draft has no tournament. Not a
 * DraftRefusal: there is nothing for the draft to have moved on from.
 */
export interface NoTournamentProblem {
  error: 'no-tournament';
  message: string;
}

/** Why a pick import's file can't be imported: a 422 listing all that's wrong with it. */
export interface PickImportRefusal {
  error: 'invalid-pick-import';
  message: string;
  problems: string[];
}

/** The 413 a pick import or its preview gets when the file is too long to be a sheet of picks. */
export interface PickImportTooLarge {
  error: 'file-too-large';
  message: string;
}

/**
 * The 403 a pick, queue or plan request gets from a signed-in viewer who
 * isn't a player in the draft. Not a DraftRefusal: it isn't a 409.
 */
export interface NotAPlayerProblem {
  error: 'not-a-player';
  message: string;
}

/**
 * Why the drafts API refused a request because the draft or queue has moved
 * on since the viewer last saw it. Refusals are 409s, except `not-in-pool`:
 * that one is a 404, and the web shows it as a generic failure. That's fine,
 * since a draft's pool is fixed once it starts, so only a stale or forged
 * card id can reach it.
 *
 * The web shows a refusal's `message`, and recognises a refusal by its 409
 * status, not by its `error` code. The codes are there for the api's specs
 * and for any branching the web may do later.
 */
export type DraftRefusal =
  | StartRefusal
  | PickRefusal
  | UndoRefusal
  | PauseRefusal
  | CloseRefusal
  | DraftChangeRefusal
  | QueueRefusal
  | PlanRefusal
  | TournamentRefusal;

/** Every error body a pick request can get, besides a 404 for a draft that is gone. */
export type PickFailure = PickRefusal | NotAPlayerProblem | RequestProblem;

/** Every error body a queue request can get, besides a 404 for a draft that is gone. */
export type QueueFailure = QueueRefusal | NotAPlayerProblem | RequestProblem;

/** Every error body a plan request can get, besides a 404 for a draft that is gone. */
export type PlanFailure = PlanRefusal | NotAPlayerProblem | RequestProblem;

/** Every error body a tournament request can get, besides a 404 for a draft that is gone or a 403 for a power the viewer lacks. */
export type TournamentFailure =
  | TournamentRefusal
  | NoTournamentProblem
  | NoMatchProblem
  | NotAPlayerProblem
  | RequestProblem;
