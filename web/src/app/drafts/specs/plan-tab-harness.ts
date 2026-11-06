import type { PlanView } from 'contract';
import { bob, openTab, tabButton, type AppFixture, type NamedPoolCard } from './harness';
import { card, shivan, brightclimb } from './pool-tab-harness';

/** Bob's turn, on the draft's third pick. */
export const bobsTurn = { pick: 3, round: 2, playerId: bob.id };
export const bolt = card({
  id: 'bolt-card',
  name: 'Lightning Bolt',
  manaValue: 1,
  typeLine: 'Instant',
});
export const boltAgain = card({ ...bolt, id: 'bolt-card-2' });
export const cards = [shivan, brightclimb, bolt, boltAgain];
export const planned = (card: NamedPoolCard, picked = true) => ({
  poolCardId: card.id,
  name: card.name,
  picked,
});
export const unpicked = (card: NamedPoolCard) => planned(card, false);
/** As the API sorts it: by mana value, then name. */
export const planOf = (fields: Partial<PlanView> = {}): PlanView => ({
  mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain), planned(shivan)],
  sideboard: [],
  basics: [],
  lost: [],
  ...fields,
});

/** Opens the Plan tab, called Deck once the draft is complete, and returns its panel. */
export const openPlan = (fixture: AppFixture, page: HTMLElement) =>
  openTab(fixture, page, tabButton(page, 'Deck') ? 'Deck' : 'Plan');

/** Each plan board's heading, and its lines as `count name`, with ` (unpicked)` after a line marked Unpicked. */
export function planBoards(plan: HTMLElement) {
  return [...plan.querySelectorAll('section')].map((planBoard) => ({
    heading: planBoard.querySelector('h3')?.textContent?.replace(/\s+/g, ' ').trim(),
    lines: [...planBoard.querySelectorAll('li:not(.empty)')].map(
      (line) =>
        `${line.querySelector('.count')?.textContent?.trim()} ${line.querySelector('.name')?.textContent?.trim()}` +
        (line.textContent?.includes('Unpicked') ? ' (unpicked)' : ''),
    ),
  }));
}
