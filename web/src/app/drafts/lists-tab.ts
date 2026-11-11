import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { type DecklistView } from 'contract';
import { LoadingAnimation } from '../loading/loading-animation';
import { Decklist } from './decklist';
import { DraftStore } from './draft-store';

/**
 * The Lists tab: each joined player's decklist, in join order, read-only,
 * as the tournament locked it at its start, each under its player's name
 * and previewing its cards from the draft's pool.
 */
@Component({
  selector: 'app-lists-tab',
  imports: [Decklist, LoadingAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lists-tab.html',
  styleUrls: ['../page.scss', './drafts.scss', './lists-tab.scss'],
})
export class ListsTab {
  private readonly store = inject(DraftStore);

  protected readonly loading = this.store.decklists.loading;
  protected readonly missing = this.store.decklists.missing;
  protected readonly decklists = this.store.decklists.value;
  protected readonly cards = this.store.poolCardsById;

  /** The decklist's player's name. */
  protected playerName(decklist: DecklistView): string {
    return this.store.player(decklist.playerId).name;
  }
}
