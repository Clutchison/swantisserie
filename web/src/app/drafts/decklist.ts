import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  type BasicLand,
  type DecklistView,
  type PlannedBasicView,
  type PlannedCardView,
  type PoolCardView,
} from 'contract';
import { basicCards } from './basic-lands';
import { CardName } from './card-name';

/** One line of a decklist's mainboard or sideboard: a card, or a basic land, and its copies. */
interface DecklistLine {
  key: string;
  name: string;
  count: number;
  /** Its card, for its mana cost and Card preview; undefined when it isn't among the cards given. */
  card: PoolCardView | undefined;
}

/** A decklist's mainboard or sideboard as it is listed. */
interface DecklistBoard {
  name: 'Mainboard' | 'Sideboard';
  /** How many cards it holds, basic lands included. */
  count: number;
  lines: DecklistLine[];
}

/**
 * One decklist, read-only, under its player's name: its mainboard, basic
 * lands last, and its sideboard, as the player's own deck lists them, every
 * card name showing its Card preview. A basic land's shows the decklist's
 * preferred printing, or else its default printing. It opens no Printing
 * picker.
 *
 * It reads no draft store, so it works on any page; that page provides
 * `CardImageSource` and `CardPreviews`, as the draft page does.
 */
@Component({
  selector: 'app-decklist',
  imports: [CardName],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './decklist.html',
  styleUrls: ['./drafts.scss', './decklist.scss'],
})
export class Decklist {
  readonly decklist = input.required<DecklistView>();
  /** Its player's name, which heads it. */
  readonly playerName = input.required<string>();
  /**
   * The pool cards its cards are, by id, for their mana costs and Card
   * previews. A card missing from it is listed by name alone.
   */
  readonly cards = input.required<ReadonlyMap<string, PoolCardView>>();

  protected readonly boards = computed(() => {
    const decklist = this.decklist();
    const cards = this.cards();
    return [
      board(
        'Mainboard',
        decklist.mainboard,
        decklist.basics,
        cards,
        basicCards(decklist.preferredPrintings),
      ),
      board('Sideboard', decklist.sideboard, [], cards, new Map()),
    ];
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
