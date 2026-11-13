import type { SeatOrderRequest, TurnView } from './drafts.js';

/** One pick in a draft's pick log. */
export interface PickView {
  /** 1-based, counting every pick in the draft. */
  pick: number;
  playerId: string;
  /** The pool card picked: the pool holds its name and printing. */
  poolCardId: string;
}

/** What a pick import's file would do to a draft in the lobby. */
export interface PickImportPreview {
  /** Each column of the file with the player in the seat it maps to. */
  seats: { column: string; playerId: string; player: string }[];
  picks: number;
  /** The turn once the picks are made, with its player's name. */
  next: Pick<TurnView, 'pick' | 'round' | 'picksBeforeTurnPasses'> & {
    player: string;
  };
}

/** A file of picks to preview importing into a draft in the lobby. */
export interface PickImportPreviewRequest {
  csv: string;
}

/** A file of picks to import, with the seat order its preview showed. */
export interface PickImportRequest
  extends PickImportPreviewRequest, SeatOrderRequest {}
