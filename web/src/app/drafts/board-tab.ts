import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LoadingAnimation } from '../loading/loading-animation';
import { CardPreviewName } from './card-preview';
import { type PickView, type PlayerView, type PoolCardView } from './drafts';

/** The draft view's Board tab: every player's picks, in seat order, and the pick log. */
@Component({
  selector: 'app-board-tab',
  imports: [CardPreviewName, LoadingAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './board-tab.html',
  styleUrls: ['./drafts.scss', './draft-panels.scss', './board-tab.scss'],
})
export class BoardTab {
  /** The draft's players, in seat order. */
  readonly players = input.required<PlayerView[]>();
  /** The pick log, in pick order. */
  readonly picks = input.required<PickView[]>();
  /** The pool's cards by oracle id, for the Card previews of the names here. */
  readonly poolCardsById = input.required<ReadonlyMap<string, PoolCardView>>();
  /** Whether the picks are still on their way. */
  readonly loading = input(false);
  /** Whether the picks couldn't be loaded. */
  readonly failed = input(false);
  /** A player's name was chosen, to open their picks. */
  readonly playerChosen = output<string>();

  /** Each player, in seat order, with their picks in pick order. */
  protected readonly board = computed(() =>
    this.players().map((player) => ({
      ...player,
      picks: this.picks().filter((pick) => pick.playerId === player.id),
    })),
  );

  /** A player, by their id. */
  protected player(id: string): PlayerView | undefined {
    return this.players().find((player) => player.id === id);
  }
}
