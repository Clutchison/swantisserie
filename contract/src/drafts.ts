/** Lobby → Drafting ⇄ Paused → Complete; Drafting or Paused → Closed → Drafting. */
export type DraftState =
  'Lobby' | 'Drafting' | 'Paused' | 'Complete' | 'Closed';

/** The game a draft is played on, by its short name. */
export type Platform = 'Arena' | 'MTGO';

/** How far the pool snapshot (copying the pool from Scryfall) has got. */
export type PoolSnapshotState = 'Running' | 'Complete' | 'Failed';

/** The pool snapshot's progress. */
export interface PoolSnapshotView {
  state: PoolSnapshotState;
  /** Cards snapshotted so far: the pool size once Complete. */
  cards: number;
  /** Cards the pool will hold, as Scryfall or the cube says; null until it is known. */
  total: number | null;
  /** Why the snapshot failed, when it has. */
  error?: string;
}

/** A guild member or bot who has joined a draft. */
export interface PlayerView {
  id: string;
  name: string;
  avatarUrl: string;
  /** A player the app controls, which an app admin added for testing. */
  isBot: boolean;
}

/** Whose turn it is in a started draft. */
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

/** A draft, as every viewer is sent it. */
export interface DraftView {
  id: string;
  name: string;
  poolSource: PoolSourceView;
  picksPerPlayer: number;
  platform: Platform;
  state: DraftState;
  organizer: { id: string; name: string };
  snapshot: PoolSnapshotView;
  /** In seat order. */
  players: PlayerView[];
  /** Null unless the draft is Drafting or Paused. */
  turn: TurnView | null;
  /** Where the draft's announcements are posted; null for none. */
  webhook: WebhookView | null;
  /** Higher for a newer copy of the draft; snapshot progress leaves it be. */
  version: number;
  /** ISO timestamp. */
  createdAt: string;
}

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

/** The seat order an organizer sets, as every player's user id. */
export interface SeatOrderRequest {
  userIds: string[];
}
