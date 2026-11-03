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
  | {
      /** A field to fix, or a webhook that has since been removed. */
      error: 'invalid';
      message: string;
    }
  | { error: 'scryfall-unavailable'; message: string }
  | {
      /** CubeCobra failed, or answered with something we can't read. */
      error: 'cubecobra-unavailable';
      message: string;
    };

/**
 * Why the organizer can't start the draft; sent to them as is. The api
 * passes on engine's StartProblem codes, so typecheck ties the two.
 */
export interface StartRefusal {
  error: 'player-count' | 'pool-too-small' | 'pool-not-ready';
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

/** Why a change to a draft's players, seats, pool or webhook was refused. */
export interface DraftChangeRefusal {
  error:
    | 'draft-started'
    | 'draft-full'
    | 'players-changed'
    | 'pool-frozen'
    | 'webhook-removed';
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

/** Why a card in a plan can't be moved; sent to the player as is. */
export interface PlanRefusal {
  /** The card isn't in the player's plan: its pick was undone. */
  error: 'not-in-plan';
  message: string;
}

/** Why a pick import's file can't be imported: a 422 listing all that's wrong with it. */
export interface PickImportRefusal {
  error: 'invalid-pick-import';
  message: string;
  problems: string[];
}

/**
 * Why the drafts API refused a request because the draft or queue has moved
 * on since the viewer last saw it: a 409, or a 404 for `not-in-pool`.
 */
export type DraftRefusal =
  | StartRefusal
  | PickRefusal
  | UndoRefusal
  | PauseRefusal
  | CloseRefusal
  | DraftChangeRefusal
  | QueueRefusal
  | PlanRefusal;
