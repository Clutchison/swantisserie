import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** The letter a type letter shows: its card type's initial, or O for Other. */
export type Letter = 'C' | 'P' | 'I' | 'S' | 'A' | 'E' | 'B' | 'L' | 'O';

/** The shields P and B sit on, drawn by hand: a loyalty shield and an upright defense shield. */
const SHIELDS: Partial<Record<Letter, string>> = {
  P: 'M2 2.5 Q11 0.5 20 2.5 L20 12 Q20 18.5 11 22.8 Q2 18.5 2 12 Z',
  B: 'M6 1.5 H16 L20.5 5 V13.5 L11 22.8 L1.5 13.5 V5 Z',
};

/**
 * A type letter, drawn in a 22px box: most on a tile whose fill is the type's
 * treatment, P and B on a shield, O plain. Decorative, hidden from a
 * screen reader: the stack header it labels carries the stack's name.
 */
@Component({
  selector: 'app-type-letter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (shield()) {
      <svg viewBox="0 0 22 24"><path [attr.d]="shield()" /></svg>
    }
    <span>{{ letter() }}</span>`,
  styleUrl: './type-letter.scss',
  host: { '[attr.data-letter]': 'letter()', 'aria-hidden': 'true' },
})
export class TypeLetter {
  readonly letter = input.required<Letter>();

  protected readonly shield = computed(() => SHIELDS[this.letter()]);
}
