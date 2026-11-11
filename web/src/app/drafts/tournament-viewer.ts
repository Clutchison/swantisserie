import type { Signal } from '@angular/core';
import type { PlayerView } from 'contract';

/**
 * What a tournament's viewer sees of it beyond its read: who its players
 * are, and whether they may organize it. Its standings, results grid and
 * bracket read this: on a draft's page from its `DraftStore`; in the
 * Tournament summary from the draft's players read for it, with nobody
 * organizing, so nothing there changes the tournament.
 */
export abstract class TournamentViewer {
  /** A player in the draft, by their id; one who isn't gets a fallback name. */
  abstract player(id: string): PlayerView;
  /** Whether the viewer may report, correct and clear the tournament's matches. */
  abstract readonly canOrganize: Signal<boolean>;
}

/**
 * The player `id` among `players`, a draft's; one who isn't is named
 * "another player", with no avatar.
 */
export function playerIn(players: readonly PlayerView[], id: string): PlayerView {
  return (
    players.find((player) => player.id === id) ?? {
      id,
      name: 'another player',
      avatarUrl: '',
      isBot: false,
    }
  );
}
