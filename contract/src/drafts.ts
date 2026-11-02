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
  /** Cards Scryfall says the pool query matches; null until the first page arrives. */
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

/** A draft, as every viewer is sent it. */
export interface DraftView {
  id: string;
  name: string;
  poolQuery: string;
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
