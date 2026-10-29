/** Lobby → Drafting ⇄ Paused → Complete. */
export type DraftState = 'Lobby' | 'Drafting' | 'Paused' | 'Complete';

/** How far the pool snapshot (copying the pool from Scryfall) has got. */
export interface PoolSnapshotView {
  state: 'Running' | 'Complete' | 'Failed';
  /** Cards snapshotted so far: the pool size once Complete. */
  cards: number;
  /** Cards Scryfall says the pool query matches; null until the first page arrives. */
  total: number | null;
  /** Why the snapshot failed, when it has. */
  error?: string;
}

/** A role-holder who has joined a draft. */
export interface PlayerView {
  id: string;
  name: string;
  avatarUrl: string;
}

/** A draft, as the drafts API reports it. */
export interface DraftView {
  id: string;
  name: string;
  poolQuery: string;
  picksPerPlayer: number;
  state: DraftState;
  organizer: { id: string; name: string };
  snapshot: PoolSnapshotView;
  /** In join order. */
  players: PlayerView[];
  createdAt: string;
}

/** The body of a failed POST /api/drafts: what to tell the organizer. */
export type DraftProblem =
  | { error: 'not-on-arena'; message: string; cards: string[]; totalCards: number }
  | { error: 'query-rejected'; message: string; warnings: string[] }
  | { error: 'no-cards' | 'invalid' | 'scryfall-unavailable'; message: string }
  /** Set by the web app when the API gave no explanation, e.g. offline. */
  | { error: 'request-failed'; message: string };
