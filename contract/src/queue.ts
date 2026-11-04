/** A card in a queue, or lost or cleared from one. */
export interface QueuedCardView {
  poolCardId: string;
  name: string;
}

/** What every queue view shows, whether or not a card was lost. */
interface QueueFields {
  /** In the order they are to be picked. */
  cards: QueuedCardView[];
  /**
   * Cards taken out because a card in the queue was lost, in the order they
   * went.
   */
  cleared: QueuedCardView[];
  /** What a card lost from now on does to the rest of the queue. */
  stealBehavior: StealBehavior;
}

/**
 * The signed-in player's queue and steal behavior, which only they may see.
 * Only a lost card can have left the rest of the queue kept.
 */
export type QueueView = QueueFields &
  (
    | { lost: []; restKept: false }
    | {
        /** Cards other players picked first, in the order they were lost. */
        lost: [QueuedCardView, ...QueuedCardView[]];
        /**
         * Whether the latest lost card left the rest of the queue in place,
         * as it does under pick next.
         */
        restKept: boolean;
      }
  );

/**
 * What a lost card does to the rest of a player's queue: under clear queue
 * the rest is cleared; under pick next it stays, in order.
 */
export type StealBehavior = 'ClearQueue' | 'PickNext';
