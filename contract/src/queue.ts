/** A card in a queue, or lost from one. */
export interface QueuedCardView {
  poolCardId: string;
  name: string;
}

/**
 * A card lost from the queue, as the Queue notice names it, and what its
 * loss did to the queue. Neither flag is set when the queue was queue
 * paused already, or for a card lost before pause queue replaced clear
 * queue.
 */
export interface LostQueuedCardView extends QueuedCardView {
  /** Whether its loss paused the queue, under pause queue. */
  pausedQueue: boolean;
  /** Whether its loss left the queue picking, under pick next. */
  leftPicking: boolean;
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
 * either way: under pause queue the queue is queue paused; under pick next
 * it keeps picking.
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

/** Whether a player sets their queue to queue paused or queue picking. */
export interface QueuePausedRequest {
  queuePaused: boolean;
}
