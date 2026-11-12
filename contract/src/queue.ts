/** A card in a queue, or lost or cleared from one. */
export interface QueuedCardView {
  poolCardId: string;
  name: string;
}

/** What every queue view shows, whether or not a card was lost. */
interface QueueBase {
  /** In the order they are to be picked. */
  cards: QueuedCardView[];
  /**
   * Cards taken out because a card in the queue was lost, in the order they
   * went.
   */
  cleared: QueuedCardView[];
  /** What a card lost from now on does to the rest of the queue. */
  stealBehavior: StealBehavior;
  /**
   * Whether the queue is queue paused, making no queued picks, rather than
   * queue picking, as every queue starts.
   */
  queuePaused: boolean;
}

/**
 * The signed-in player's queue and steal behavior, which only they may see.
 * Only a lost card can have left the rest of the queue kept.
 */
export type QueueView = QueueBase &
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

/** The queue's order, as every queued card's pool card id. */
export interface QueueOrderRequest {
  poolCardIds: string[];
}

/** Whether queuing the plan's unpicked cards takes the sideboard's too. */
export interface QueueUnpickedRequest {
  includeSideboard: boolean;
}

/** The steal behavior a player sets for their queue. */
export interface StealBehaviorRequest {
  stealBehavior: StealBehavior;
}

/**
 * Whether a player sets their queue to queue paused or queue picking. Only
 * setting it queue picking lists cards.
 */
export type QueuePausedRequest =
  | { queuePaused: true }
  | {
      queuePaused: false;
      /**
       * The pool card ids, in order, that the player confirmed their queue
       * picks before the turn passes, as `queuePicksBeforeTurnPasses` names
       * them. Left out, none.
       */
      poolCardIds?: string[];
    };
