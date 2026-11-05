import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { PlayerView } from 'contract';
import { LoadingAnimation } from '../loading/loading-animation';
import { CardName } from './card-name';
import { DraftStore } from './draft-store';

/** The draft view's Board tab: every player's picks, in seat order, and the pick log. */
@Component({
  selector: 'app-board-tab',
  imports: [CardName, LoadingAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './board-tab.html',
  styleUrls: ['../page.scss', './drafts.scss', './draft-panels.scss', './board-tab.scss'],
})
export class BoardTab {
  private readonly store = inject(DraftStore);

  /** The draft's players, in seat order. */
  private readonly players = computed(() => this.store.shown().players);
  /** The pick log, in pick order. */
  protected readonly picks = this.store.picks.value;
  /** The pool's cards by id, for the Card previews of the names here. */
  protected readonly poolCardsById = this.store.poolCardsById;
  /** Whether the picks are still on their way. */
  protected readonly loading = this.store.picks.loading;
  /** Whether the picks couldn't be loaded. A failed re-read keeps the last ones loaded. */
  protected readonly failed = this.store.picks.missing;

  /** Each player, in seat order, with their picks in pick order. */
  protected readonly board = computed(() =>
    this.players().map((player) => ({
      ...player,
      picks: this.picks().filter((pick) => pick.playerId === player.id),
    })),
  );

  /** A player, by their id; "another player" for one no longer in the draft. */
  protected player(id: string): PlayerView {
    return this.store.player(id);
  }
}
