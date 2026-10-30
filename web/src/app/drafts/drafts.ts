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

/** A role-holder or bot who has joined a draft. */
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

/** A draft, as the drafts API reports it. */
export interface DraftView {
  id: string;
  name: string;
  poolQuery: string;
  picksPerPlayer: number;
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
  createdAt: string;
}

/** The body of a failed POST /api/drafts: what to tell the organizer. */
export type DraftProblem =
  | { error: 'not-on-arena'; message: string; cards: string[]; totalCards: number }
  | { error: 'query-rejected'; message: string; warnings: string[] }
  | { error: 'no-cards' | 'invalid' | 'scryfall-unavailable'; message: string }
  /** Set by the web app when the API gave no explanation, e.g. offline. */
  | { error: 'request-failed'; message: string };

/** Scryfall image URLs of one card face. */
export interface CardImages {
  small: string;
  normal: string;
  large: string;
}

/** https://scryfall.com/docs/api/cards#rarity */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'special' | 'mythic' | 'bonus';

/** One face's fields for the pool search. */
export interface CardFace {
  name: string;
  typeLine: string | null;
  oracleText: string | null;
  manaCost: string | null;
  /** Null when the card's colors apply, e.g. on adventures and split cards. */
  colors: string[] | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  defense: string | null;
}

/** One card in a pool, with the Arena printing the snapshot took. */
export interface PoolCardView {
  scryfallId: string;
  oracleId: string;
  name: string;
  set: string;
  collectorNumber: string;
  typeLine: string;
  colors: string[];
  manaValue: number;
  /** Null when the faces carry it, as on double-faced cards. */
  manaCost: string | null;
  /** Null when the faces carry it. */
  oracleText: string | null;
  colorIdentity: string[];
  keywords: string[];
  /** Null only until a pool snapshotted before rarity was stored is backfilled. */
  rarity: Rarity | null;
  /** How the faces are laid out, e.g. normal, split, transform, adventure. Null only until a pool snapshotted before layout was stored is backfilled. */
  layout: string | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  defense: string | null;
  /** Empty for single-faced cards. Null only until a pool snapshotted before faces were stored is backfilled. */
  faces: CardFace[] | null;
  /** One entry per face with its own image. */
  images: CardImages[];
}

/** One pick in a draft's pick log. */
export interface PickView {
  /** 1-based, counting every pick in the draft. */
  pick: number;
  playerId: string;
  oracleId: string;
  name: string;
}

/** A card in a queue, or lost from one. */
export interface QueuedCardView {
  oracleId: string;
  name: string;
}

/** The signed-in player's queue, which only they may see. */
export interface QueueView {
  /** In the order they are to be picked. */
  cards: QueuedCardView[];
  /** Cards other players picked first, in the order they were lost. */
  lost: QueuedCardView[];
}

/** A queue with no cards in it, and none lost. */
export const EMPTY_QUEUE: QueueView = { cards: [], lost: [] };
