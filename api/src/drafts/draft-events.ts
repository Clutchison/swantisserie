/** A player as a draft event names them. */
export interface EventPlayer {
  /** Their Discord user id, or a bot's synthetic one. */
  id: string;
  name: string;
  /** Bots are named, never pinged: they have no Discord account. */
  isBot: boolean;
}

/** Something that happened to a draft, for announcing once it is saved. */
export type DraftEvent =
  | {
      type: 'started';
      /** In seat order. */
      seats: EventPlayer[];
    }
  | {
      type: 'picked';
      /** 1-based, counting every pick in the draft. */
      number: number;
      player: EventPlayer;
      card: string;
      /** Whose turn it now is; null after the last pick. */
      next: EventPlayer | null;
    }
  | { type: 'completed' };
