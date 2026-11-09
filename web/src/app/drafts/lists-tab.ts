import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  type BasicLand,
  type DecklistView,
  type PlannedBasicView,
  type PlannedCardView,
  type PoolCardView,
} from 'contract';
import { LoadingAnimation } from '../loading/loading-animation';
import { basicCards } from './basic-lands';
import { CardName } from './card-name';
import { DraftStore } from './draft-store';

/** One line of a decklist's mainboard or sideboard: a card, or a basic land, and its copies. */
interface DecklistLine {
  key: string;
  name: string;
  count: number;
  /** Its card, for its mana cost and Card preview; undefined until the pool has loaded. */
  card: PoolCardView | undefined;
}

/** A decklist's mainboard or sideboard as the tab lists it. */
interface DecklistBoard {
  name: 'Mainboard' | 'Sideboard';
  /** How many cards it holds, basic lands included. */
  count: number;
  lines: DecklistLine[];
}

/**
 * The Lists tab: each joined player's decklist, in join order, read-only,
 * as the tournament locked it at its start. Each lists its mainboard, basic
 * lands last, and its sideboard, as the player's own deck does, every card
 * name showing its Card preview: a basic land's shows its player's preferred
 * printing as it is now, or else its default printing. It opens no Printing
 * picker.
 */
@Component({
  selector: 'app-lists-tab',
  imports: [CardName, LoadingAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lists-tab.html',
  styleUrls: ['../page.scss', './drafts.scss', './lists-tab.scss'],
})
export class ListsTab {
  private readonly store = inject(DraftStore);

  protected readonly loading = this.store.decklists.loading;
  protected readonly missing = this.store.decklists.missing;

  /** Each decklist with its player's name and its boards' lines. */
  protected readonly decklists = computed(() => {
    const cards = this.store.poolCardsById();
    return this.store.decklists.value().map((decklist: DecklistView) => ({
      playerId: decklist.playerId,
      name: this.store.player(decklist.playerId).name,
      boards: [
        board(
          'Mainboard',
          decklist.mainboard,
          decklist.basics,
          cards,
          basicCards(decklist.preferredPrintings),
        ),
        board('Sideboard', decklist.sideboard, [], cards, new Map()),
      ],
    }));
  });
}

/** A board's lines: one per distinct card name, in the order given, then each basic land's. */
function board(
  name: DecklistBoard['name'],
  planned: PlannedCardView[],
  basics: PlannedBasicView[],
  cards: ReadonlyMap<string, PoolCardView>,
  basicCardsByLand: ReadonlyMap<BasicLand, PoolCardView>,
): DecklistBoard {
  const byName = new Map<string, DecklistLine>();
  for (const card of planned) {
    const line = byName.get(card.name);
    if (line) line.count++;
    else {
      byName.set(card.name, {
        // Stryker disable next-line StringLiteral: track keys only decide which views are reused, so equal keys render the same lines (and log a dev-mode warning).
        key: `card ${card.name}`,
        name: card.name,
        count: 1,
        card: cards.get(card.poolCardId),
      });
    }
  }
  const basicLines = basics.map(({ land, count }): DecklistLine => ({
    // Stryker disable next-line StringLiteral: track keys only decide which views are reused, so equal keys render the same lines (and log a dev-mode warning).
    key: `basic ${land}`,
    name: land,
    count,
    card: basicCardsByLand.get(land),
  }));
  const lines = [...byName.values(), ...basicLines];
  return { name, count: lines.reduce((total, line) => total + line.count, 0), lines };
}
