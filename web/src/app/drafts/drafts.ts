import { HttpErrorResponse } from '@angular/common/http';
import type { DraftState } from 'contract';

/** An active draft is any draft that is neither closed nor complete. */
export function isActive(state: DraftState): boolean {
  return state !== 'Complete' && state !== 'Closed';
}

/** Whether the API refused a request because the draft has moved on; its body says why. */
export function isRefusal(err: unknown): err is HttpErrorResponse {
  return err instanceof HttpErrorResponse && err.status === 409;
}

/** What a pick import's file would do to a draft in the lobby. */
export interface PickImportPreview {
  /** Each column of the file with the player in the seat it maps to. */
  seats: { column: string; userId: string; player: string }[];
  picks: number;
  next: { pick: number; player: string };
}

/** The body of a failed POST /api/drafts: what to tell the organizer. */
export type DraftProblem =
  | { error: 'not-on-platform'; message: string; cards: string[]; totalCards: number }
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

/** One card in a pool, with the printing on the draft's platform that the snapshot took. */
export interface PoolCardView {
  id: string;
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
  poolCardId: string;
  name: string;
  /** How the faces are laid out. Null only until a pool snapshotted before layout was stored is backfilled. */
  layout: string | null;
  set: string;
  collectorNumber: string;
}

/** A card in a queue, or lost or cleared from one. */
export interface QueuedCardView {
  poolCardId: string;
  name: string;
}

/** The signed-in player's queue, which only they may see. */
export interface QueueView {
  /** In the order they are to be picked. */
  cards: QueuedCardView[];
  /** Cards other players picked first, in the order they were lost. */
  lost: QueuedCardView[];
  /** Cards taken out because a card in the queue was lost, in the order they went. */
  cleared: QueuedCardView[];
}

/** A queue with no cards in it, and none lost or cleared. */
export const EMPTY_QUEUE: QueueView = { cards: [], lost: [], cleared: [] };
