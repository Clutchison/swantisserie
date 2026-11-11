import type { PoolCardView } from './pool.js';
import type { DecklistView, PlaceView } from './tournaments.js';

/** A set or sublist in a Trophy Hall group's set list, with its name. */
export interface NamedSetView {
  code: string;
  /** Its name on Scryfall, or its code in capitals when Scryfall can't name it. */
  name: string;
}

/** A set in a Trophy Hall group's set list, with its name and the sublists it includes. */
export interface NamedSetListEntryView extends NamedSetView {
  sublists: NamedSetView[];
}

/**
 * The pool source a Trophy Hall group is headed by, as its latest draft
 * has it: a cube by its CubeCobra id, name and link; a pool query; or the
 * sets of a set list, oldest first, with their names.
 */
export type TrophyHallPoolSourceView =
  | { kind: 'cube'; cube: { id: string; name: string; url: string } }
  | { kind: 'pool-query'; poolQuery: string }
  | { kind: 'set-list'; setList: NamedSetListEntryView[] };

/** One trophy on the Trophy Hall: a complete tournament and one of its trophy holders. */
export interface TrophyHallRowView {
  /** The trophy holder's Discord user id. */
  playerId: string;
  /** Their user's current name. */
  name: string;
  /** How many trophies they hold across the Trophy Hall. */
  trophies: number;
  /** The tournament's draft. */
  draftId: string;
  /** Its draft's name. */
  draftName: string;
  /** When the tournament completed, ISO; null for one completed before completion times were kept. */
  completedAt: string | null;
  /** Their deck as it was locked at Start, as the Lists tab reads it. */
  decklist: DecklistView;
  /** The pool cards of its mainboard and sideboard, for their mana costs and Card previews. */
  cards: PoolCardView[];
}

/** The trophies won from one pool source. */
export interface TrophyHallGroupView {
  poolSource: TrophyHallPoolSourceView;
  /** Newest first. */
  rows: TrophyHallRowView[];
}

/** A trophy holder in the trophy ranking. */
export interface TrophyRankingEntryView {
  /** Their Discord user id. */
  playerId: string;
  /** Their user's current name. */
  name: string;
  /** How many trophies they hold across the Trophy Hall. */
  trophies: number;
  /** Shared with every player holding as many trophies, such as =2nd. */
  place: PlaceView;
}

/**
 * The Trophy Hall, from `GET /api/trophy-hall`, which every signed-in user
 * may read: the trophies of complete tournaments whose decklists were kept,
 * leaving out any a bot played in.
 */
export interface TrophyHallView {
  /** Every trophy holder, most trophies first; of those with as many, the newest trophy first. */
  ranking: TrophyRankingEntryView[];
  /** The group of the newest trophy first. */
  groups: TrophyHallGroupView[];
}
