/** A card in a queue, or lost or cleared from one. */
export interface QueuedCardView {
  poolCardId: string;
  name: string;
}

/** The signed-in player's queue and steal behavior, which only they may see. */
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
  /**
   * Whether the latest of the `lost` cards left the rest of the queue in
   * place, as it does under pick next.
   */
  restKept: boolean;
  /** What a card lost from now on does to the rest of the queue. */
  stealBehavior: StealBehavior;
}

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
