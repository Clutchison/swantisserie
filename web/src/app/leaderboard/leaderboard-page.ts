import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import type { LeaderboardView } from 'contract';
import { LoadingAnimation } from '../loading/loading-animation';
import { record } from '../record';

/**
 * The leaderboard: every player with a played match, ranked by trophies,
 * then matches won, and the head-to-head records of the player selected.
 * Fetched afresh on each visit.
 */
@Component({
  selector: 'app-leaderboard-page',
  imports: [LoadingAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './leaderboard-page.html',
  styleUrls: ['../page.scss', './leaderboard-page.scss'],
})
export class LeaderboardPage {
  protected readonly leaderboard = httpResource<LeaderboardView>(() => '/api/leaderboard');
  /** The id of the player whose head-to-head records show, if any. */
  protected readonly selectedId = signal<string | null>(null);
  protected readonly record = record;

  /** The selected player, if any. */
  protected readonly selected = computed(
    // Stryker disable next-line OptionalChaining: the page reads `selected()` only once the leaderboard has loaded.
    () => this.leaderboard.value()?.find((p) => p.playerId === this.selectedId()) ?? null,
  );
  /** Each player's name by their id, for naming opponents, once the leaderboard has loaded. */
  protected readonly nameOf = computed(
    () => new Map(this.leaderboard.value()!.map((p) => [p.playerId, p.name])),
  );

  /** Selects the player, or deselects them when they are selected already. */
  protected toggle(playerId: string) {
    this.selectedId.update((id) => (id === playerId ? null : playerId));
  }
}
