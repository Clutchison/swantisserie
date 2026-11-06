import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import type { LeaderboardView, TallyView } from 'contract';

/** A record as the page shows it: won–lost–drawn. */
function record({ won, lost, drawn }: TallyView): string {
  return `${won}–${lost}–${drawn}`;
}

/**
 * The leaderboard: every player with a played match, ranked by trophies, and
 * the head-to-head records of the player selected. Fetched afresh on each
 * visit.
 */
@Component({
  selector: 'app-leaderboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './leaderboard-page.html',
  styleUrls: ['../page.scss', './leaderboard-page.scss'],
})
export class LeaderboardPage {
  protected readonly leaderboard = httpResource<LeaderboardView>(() => '/api/leaderboard');
  /** The id of the player whose head-to-head records show, if any. */
  protected readonly selectedId = signal<string | null>(null);

  protected readonly players = computed(() =>
    (this.leaderboard.value() ?? []).map((player) => ({
      id: player.playerId,
      name: player.name,
      trophies: player.trophies,
      tournamentsPlayed: player.tournamentsPlayed,
      matches: record(player.matches),
      games: record(player.games),
    })),
  );

  /** The selected player's name and head-to-head records, opponents in leaderboard order. */
  protected readonly selected = computed(() => {
    const board = this.leaderboard.value() ?? [];
    const player = board.find((p) => p.playerId === this.selectedId());
    if (!player) return null;
    const nameOf = new Map(board.map((p) => [p.playerId, p.name]));
    return {
      name: player.name,
      opponents: player.opponents.map((opponent) => ({
        id: opponent.playerId,
        name: nameOf.get(opponent.playerId) ?? '',
        matches: record(opponent.matches),
        games: record(opponent.games),
      })),
    };
  });

  /** Selects the player, or deselects them when they are selected already. */
  protected toggle(playerId: string) {
    this.selectedId.update((id) => (id === playerId ? null : playerId));
  }
}
