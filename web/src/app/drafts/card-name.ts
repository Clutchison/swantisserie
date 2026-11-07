import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { PoolCardView } from 'contract';
import { CardPreviewName } from './card-preview';
import { manaCostOf } from './mana-cost';

/**
 * A card's name, which shows its Card preview, with its mana cost before it.
 * Both wait for the name's pool card: until it has loaded, or if it has none,
 * the name is plain text on its own.
 *
 * With `opensDetail`, a name with a pool card is a button that asks for its
 * Card detail (`opened`) when pressed, a tap included, which then shows no
 * Card preview.
 *
 * In a list of card rows (`card-rows` in drafts.scss) the cost and name fill
 * the list's cost and name columns; anywhere else they run inline.
 */
@Component({
  selector: 'app-card-name',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardPreviewName],
  template: `<span class="cost">
      @for (symbol of symbols(); track $index) {
        @if (symbol.src) {
          <img
            [src]="symbol.src"
            [alt]="symbol.description"
            [title]="symbol.description"
            width="16"
            height="16"
          />
        } @else {
          <span>{{ symbol.text }}</span>
        }
      }
    </span>
    @if (opensDetail() && card()) {
      <button
        type="button"
        class="name"
        aria-haspopup="dialog"
        [appCardPreview]="card()"
        [appCardPreviewOnTap]="false"
        (click)="opened.emit($event)"
      >
        {{ name() }}
      </button>
    } @else {
      <span class="name" [appCardPreview]="card()">{{ name() }}</span>
    }`,
  styleUrl: './card-name.scss',
})
export class CardName {
  /** The name's pool card, if it has one. */
  readonly card = input.required<PoolCardView | undefined>();
  readonly name = input.required<string>();
  /** Whether pressing the name opens its Card detail, which `opened` asks for. */
  readonly opensDetail = input(false);
  readonly opened = output<MouseEvent>();

  protected readonly symbols = computed(() => {
    const card = this.card();
    return card ? manaCostOf(card) : [];
  });
}
