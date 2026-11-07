import type { BasicLandPrintingsView, PlanView } from 'contract';
import {
  accessibleName,
  bob,
  http,
  namedList,
  openTab,
  tabButton,
  type AppFixture,
  type NamedPoolCard,
} from './harness';
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
  preferredPrintings: {},
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

/** The control inside `root` that opens a plan card's Card detail, by its accessible name, as `Lightning Bolt (unpicked)` for a stacked unpicked card. */
export const detailOpener = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll<HTMLElement>('[aria-haspopup="dialog"]')].find(
    (control) => accessibleName(control) === name,
  );

/** The names of a stack's cards: each the button that opens its Card detail, or a basic land's image. */
const stackedCards = (stack: Element) =>
  [...stack.querySelectorAll('[aria-haspopup="dialog"], [role="img"]')].map(accessibleName);

/** The cards of the stack inside `root` named `name`, by their accessible names, with ` (unpicked)` after an unpicked card. */
export const stack = (root: HTMLElement, name: string) => stackedCards(namedList(root, name));

/** Each plan board's stacks as `name: card, card`, by the names a screen reader gives them. */
export const stacksOf = (plan: HTMLElement) =>
  [...plan.querySelectorAll('section')].map((planBoard) =>
    [...planBoard.querySelectorAll('ul[aria-label]')].map(
      (list) => `${list.getAttribute('aria-label')}: ${stackedCards(list).join(', ')}`,
    ),
  );

/** The API request the Printing picker sends for the stored printings of `land`. */
export const printingsRequest = (land: string) => `/api/basic-land-printings/${land}`;

/** Answers the open Printing picker's request for `land` with one printing, Onslaught's #1. */
export async function answerPrintingsRequest(land: string) {
  const id = 'f0000000-0000-4000-8000-000000000001';
  const image = (version: string) => `https://cards.scryfall.io/${version}/front/f/0/${id}.jpg`;
  (await vi.waitFor(() => http.expectOne(printingsRequest(land)))).flush({
    sets: [
      {
        code: 'ons',
        name: 'Onslaught',
        releasedAt: '2002-10-07',
        printings: [
          {
            scryfallId: id,
            set: 'ons',
            collectorNumber: '1',
            images: { small: image('small'), normal: image('normal'), large: image('large') },
          },
        ],
      },
    ],
  } satisfies BasicLandPrintingsView);
}
