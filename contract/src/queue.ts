/** A card in a queue, or lost from one. */
export interface QueuedCardView {
  poolCardId: string;
  name: string;
}

/**
 * What losing a card did to its queue: set it queue paused, under pause
 * queue; or left it as it was, so it stayed queue picking, under pick next,
 * or stayed queue paused.
 */
export type QueueLoss =
  'QueuePaused' | 'StayedQueuePicking' | 'StayedQueuePaused';

/** A card lost from the queue, as the Queue notice names it. */
export interface LostQueuedCardView extends QueuedCardView {
  /**
   * What its loss did to the queue; null for a card lost before pause
   * queue replaced clear queue.
   */
  queueLoss: QueueLoss | null;
}

/** The signed-in player's queue and steal behavior, which only they may see. */
export interface QueueView {
  /** In the order they are to be picked. */
  cards: QueuedCardView[];
  /** Cards other players picked first, in the order they were lost. */
  lost: LostQueuedCardView[];
  /** What a card lost from now on does to the queue. */
  stealBehavior: StealBehavior;
  /**
   * Whether the queue is queue paused, making no queued picks, rather than
   * queue picking, as every queue starts.
   */
  queuePaused: boolean;
}

/**
 * What a lost card does to a player's queue, whose rest stays in order
 * either way: under pause queue the queue is set to queue paused; under
 * pick next it stays queue picking.
 */
export type StealBehavior = 'PauseQueue' | 'PickNext';

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
