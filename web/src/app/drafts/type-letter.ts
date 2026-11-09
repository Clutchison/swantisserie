import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Grouping } from './plan-stacks';

/** A card type's stylized capital letter, as a stack header shows it. */
export type TypeLetter = 'C' | 'P' | 'I' | 'S' | 'A' | 'E' | 'B' | 'L' | 'O';

/** The letter of each stack under card type, by the stack's name. */
const BY_TYPE: Record<string, TypeLetter> = {
  Creature: 'C',
  Planeswalker: 'P',
  Instant: 'I',
  Sorcery: 'S',
  Artifact: 'A',
  Enchantment: 'E',
  Battle: 'B',
  Land: 'L',
  Other: 'O',
};

/**
 * The type letter that labels the stack named `stack` under `grouping`, if
 * any: each stack's under card type, and L for the lands under every other
 * grouping, as the Land stack's under card type.
 */
export function typeLetterOf(stack: string, grouping: Grouping): TypeLetter | undefined {
  if (grouping === 'type') return BY_TYPE[stack];
  return stack === 'Lands' ? 'L' : undefined;
}

/** The shields P and B sit on, drawn by hand: a loyalty shield and an upright defense shield. */
const SHIELDS: Partial<Record<TypeLetter, string>> = {
  P: 'M2 2.5 Q11 0.5 20 2.5 L20 12 Q20 18.5 11 22.8 Q2 18.5 2 12 Z',
  B: 'M6 1.5 H16 L20.5 5 V13.5 L11 22.8 L1.5 13.5 V5 Z',
};

/**
 * A type letter, drawn in a 22px box: most on a tile whose fill is the type's
 * treatment, P and B on a shield, O plain. Presentation only: the stack
 * header it labels carries the stack's name for a screen reader.
 */
@Component({
  selector: 'app-type-letter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // No whitespace around the letter, so the header reads as the letter then its count.
  template: `@if (shield()) {
      <svg viewBox="0 0 22 24" aria-hidden="true"><path [attr.d]="shield()" /></svg>
    }
    <span>{{ letter() }}</span>`,
  styleUrl: './type-letter.scss',
  host: { '[attr.data-letter]': 'letter()' },
})
export class TypeLetterLabel {
  readonly letter = input.required<TypeLetter>();

  protected readonly shield = computed(() => SHIELDS[this.letter()]);
}
