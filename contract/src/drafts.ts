/**
 * Lobby → Drafting, or → Paused by a pick import; Drafting ⇄ Paused; Drafting → Complete;
 * Drafting or Paused → Closed → Drafting. The glossary has the long form.
 */
export type DraftState =
  'Lobby' | 'Drafting' | 'Paused' | 'Complete' | 'Closed';

/** The states a draft has a turn in: a Closed one keeps none until reopened. */
export type TurnState = 'Drafting' | 'Paused';

/** The game a draft is played on, by its short name. */
export type Platform = 'Arena' | 'MTGO';

/** How far the pool snapshot (copying the pool from Scryfall) has got. */
export type PoolSnapshotState = 'Running' | 'Complete' | 'Failed';

/**
 * The pool snapshot's progress. `cards` is how many are snapshotted so far:
 * the pool size once Complete. `total` is how many the pool will hold, as
 * Scryfall or the cube says, known once Complete. Only a Failed one says why.
 */
export type PoolSnapshotView = { cards: number } & (
  | { state: 'Running'; total: number | null }
  | { state: 'Complete'; total: number }
  | { state: 'Failed'; total: number | null; error: string }
);

/** A guild member or bot who has joined a draft. */
export interface PlayerView {
  /**
   * The player's Discord user id. Every `playerId` in the contract, and
   * `LostCardView.pickedBy`, is one of these.
   */
  id: string;
  name: string;
  avatarUrl: string;
  /** A player the app controls, which an app admin added for testing. */
  isBot: boolean;
}

/** Whose turn it is in a Drafting or Paused draft. */
export interface TurnView {
  /** 1-based, counting every pick in the draft. */
  pick: number;
  round: number;
  playerId: string;
}

/** A webhook as organizers choose it: by name, its URL kept secret. */
export interface WebhookView {
  id: string;
  name: string;
}

/** The CubeCobra cube a draft's pool was made from. */
export interface CubeView {
  /** As it was when the draft was created. */
  name: string;
  /** The cube's page on CubeCobra. */
  url: string;
}

/** What defines a draft's pool, chosen once when the draft is created. */
export type PoolSourceView =
  { kind: 'pool-query'; poolQuery: string } | { kind: 'cube'; cube: CubeView };

/** What every draft shows, whatever its state. */
export interface DraftBase {
  id: string;
  name: string;
  poolSource: PoolSourceView;
  picksPerPlayer: number;
  platform: Platform;
  organizer: { id: string; name: string };
  snapshot: PoolSnapshotView;
  /** In seat order. */
  players: PlayerView[];
  /** Where the draft's announcements are posted; null for none. */
  webhook: WebhookView | null;
  /** Higher for a newer copy of the draft; snapshot progress leaves it be. */
  version: number;
  /** ISO timestamp. */
  createdAt: string;
}

/** A draft, as every viewer is sent it: with a turn only while Drafting or Paused. */
export type DraftView = DraftBase &
  (
    | { state: TurnState; turn: TurnView }
    | { state: Exclude<DraftState, TurnState>; turn: null }
  );

/**
 * What the api pushes over Socket.IO to everyone viewing a draft, by event
 * name.
 */
export interface DraftSocketEvents {
  /** The draft changed: here it is as it now is. */
  changed: (draft: DraftView) => void;
  /** The draft was cancelled, so it no longer exists. */
  cancelled: () => void;
}

/** The most characters in a draft's name. */
export const MAX_DRAFT_NAME_LENGTH = 100;
/** The most characters in a pool query: Scryfall takes up to 1000, and the api wraps the query in more terms. */
export const MAX_POOL_QUERY_LENGTH = 900;
/** The most characters in a cube link: far longer than any CubeCobra cube URL. */
export const MAX_CUBE_LINK_LENGTH = 300;
/** The picks per player of a draft created without choosing them. */
export const DEFAULT_PICKS_PER_PLAYER = 40;
/** The fewest picks per player a draft can have. */
export const MIN_PICKS_PER_PLAYER = 1;
/** The most picks per player a draft can have. */
export const MAX_PICKS_PER_PLAYER = 100;

/**
 * The create form's fields, as the web sends them to create a draft: a pool
 * query or a cube link, not both.
 */
export interface NewDraftRequest {
  name: string;
  poolQuery?: string;
  cubeLink?: string;
  /** Missing: the default. Null: a field left blank, which is refused. */
  picksPerPlayer?: number | null;
  /** Missing: Arena. */
  platform?: Platform;
  /** Missing or null: the draft posts nowhere. */
  webhookId?: string | null;
}

/** Where an organizer chooses a draft's later announcements to be posted. */
export interface WebhookChoiceRequest {
  /** Null for none. */
  webhookId: string | null;
}

/** The seat order an organizer sets, as every player's id. */
export interface SeatOrderRequest {
  playerIds: string[];
}
