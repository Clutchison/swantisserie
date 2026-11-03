/** One pick in a draft's pick log. */
export interface PickView {
  /** 1-based, counting every pick in the draft. */
  pick: number;
  playerId: string;
  poolCardId: string;
  name: string;
  /** How the faces are laid out. */
  layout: string;
  typeLine: string;
  set: string;
  collectorNumber: string;
}

/** What a pick import's file would do to a draft in the lobby. */
export interface PickImportPreview {
  /** Each column of the file with the player in the seat it maps to. */
  seats: { column: string; userId: string; player: string }[];
  picks: number;
  next: { pick: number; player: string };
}
