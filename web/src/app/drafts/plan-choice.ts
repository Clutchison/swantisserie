import type { Grouping } from './plan-stacks';

/** How a plan board shows: as stacks of card images, or as a list of names. */
export type PlanMode = 'stacks' | 'list';

/** The mode and grouping a viewer chose, kept in their browser. */
export interface PlanChoice {
  mode: PlanMode;
  grouping: Grouping;
}
const CHOICE_KEY = 'plan-view';
/** The grouping when none is kept. A new viewer's mode follows the stacks area's width: see `PlanTab`'s `measured`. */
const DEFAULT_GROUPING: Grouping = 'manaValue';
const MODES: PlanMode[] = ['stacks', 'list'];

/** The groupings, in the order the control offers them, as it names them. */
export const GROUPINGS: { grouping: Grouping; name: string }[] = [
  { grouping: 'manaValue', name: 'Mana value' },
  { grouping: 'color', name: 'Color' },
  { grouping: 'type', name: 'Type' },
];

/**
 * The mode and grouping the viewer last chose, one choice for every screen;
 * if none is kept or storage is refused, no mode, grouped by mana value.
 */
export function readChoice(): Partial<PlanChoice> & Pick<PlanChoice, 'grouping'> {
  const defaults = { mode: undefined, grouping: DEFAULT_GROUPING };
  try {
    // Stryker disable next-line StringLiteral: JSON.parse("") throws into the catch, which returns the same defaults.
    const kept: unknown = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? 'null');
    const { mode, grouping } = (kept ?? {}) as Record<string, unknown>;
    return {
      mode: isMode(mode) ? mode : defaults.mode,
      grouping: isGrouping(grouping) ? grouping : defaults.grouping,
    };
  } catch {
    // Storage may be refused, as in a private window, or hold something that isn't a choice.
    return defaults;
  }
}

const isMode = (value: unknown): value is PlanMode => MODES.includes(value as PlanMode);
const isGrouping = (value: unknown): value is Grouping =>
  GROUPINGS.some((option) => option.grouping === value);

/** Keeps `choice`, the chosen mode and grouping, for next time, if the browser allows. */
export function saveChoice(choice: PlanChoice) {
  try {
    localStorage.setItem(CHOICE_KEY, JSON.stringify(choice));
  } catch {
    // Storage may be full or refused, as in a private window: the choice holds for this page.
  }
}
