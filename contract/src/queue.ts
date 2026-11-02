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
