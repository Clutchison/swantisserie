import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  type DecklistView,
  type PlanBoard,
  type PlannedCardView,
  type PoolCardView,
} from 'contract';
import { basicCards } from './basic-lands';
import { CardName } from './card-name';
import { basicsOn } from './plan-boards';

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
 * One decklist, read-only, under its player's name: its mainboard and its
 * sideboard, each with its basic lands last, as the player's own deck lists
 * them, every card name showing its Card preview. A basic land's shows the
 * decklist's preferred printing, or else its default printing. It opens no
 * Printing picker.
 *
 * It reads no draft store, so it works on any page; that page provides
 * `CardImageSource` and `CardPreviews`, as the draft page does.
 */
@Component({
  selector: 'app-decklist',
  imports: [CardName],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './decklist.html',
  styleUrls: ['../page.scss', './drafts.scss', './decklist.scss'],
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
  /**
   * What its element ids start with, followed by its player's id. A page
   * showing more than one decklist of a player gives each its own.
   */
  readonly idPrefix = input('decklist');

  protected readonly headingId = computed(() => `${this.idPrefix()}-${this.decklist().playerId}`);

  protected readonly boards = computed((): DecklistBoard[] => {
    const decklist = this.decklist();
    const cards = this.cards();
    const basics = basicCards(decklist.preferredPrintings);
    const basicLines = (planBoard: PlanBoard) =>
      basicsOn(decklist.basics, planBoard).map(({ land, count }): DecklistLine => ({
        // Stryker disable next-line StringLiteral: track keys only decide which views are reused, so equal keys render the same lines (and log a dev-mode warning).
        key: `basic ${land}`,
        name: land,
        count,
        card: basics.get(land),
      }));
    return [
      board('Mainboard', [...cardLines(decklist.mainboard, cards), ...basicLines('Mainboard')]),
      board('Sideboard', [...cardLines(decklist.sideboard, cards), ...basicLines('Sideboard')]),
    ];
  });
}

/** A board of `lines`, counting their copies. */
function board(name: DecklistBoard['name'], lines: DecklistLine[]): DecklistBoard {
  return { name, count: lines.reduce((total, line) => total + line.count, 0), lines };
}

/** One line per distinct card name, in the order given. */
function cardLines(
  planned: PlannedCardView[],
  cards: ReadonlyMap<string, PoolCardView>,
): DecklistLine[] {
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
  return [...byName.values()];
}
