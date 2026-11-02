/** One pick in a draft's pick log. */
export interface PickView {
  /** 1-based, counting every pick in the draft. */
  pick: number;
  playerId: string;
  poolCardId: string;
  name: string;
  /**
   * How the faces are laid out. Null only until a pool snapshotted before
   * layout was stored is backfilled.
   */
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
  /**
   * Cards taken out because a card in the queue was lost, in the order they
   * went.
   */
  cleared: QueuedCardView[];
}

/** What a pick import's file would do to a draft in the lobby. */
export interface PickImportPreview {
  /** Each column of the file with the player in the seat it maps to. */
  seats: { column: string; userId: string; player: string }[];
  picks: number;
  next: { pick: number; player: string };
}
