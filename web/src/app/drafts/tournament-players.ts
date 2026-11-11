import type { Signal } from '@angular/core';
import type { PlayerView } from 'contract';

/**
 * Who a tournament's players are, and whether the viewer may organize it,
 * as its standings, results grid and bracket read them: on a draft's page
 * its `DraftStore`; in the Tournament summary, the draft's players read
 * for it, with nobody organizing, so nothing there changes the tournament.
 */
export abstract class TournamentPlayers {
  /** A player in the draft, by their id; one who isn't gets a fallback name. */
  abstract player(id: string): PlayerView;
  /** Whether the viewer may report, correct and clear the tournament's matches. */
  abstract readonly canOrganize: Signal<boolean>;
}

/** How a player who isn't among a draft's players is named: "another player", with no avatar. */
export const anotherPlayer = (id: string): PlayerView => ({
  id,
  name: 'another player',
  avatarUrl: '',
  isBot: false,
});
