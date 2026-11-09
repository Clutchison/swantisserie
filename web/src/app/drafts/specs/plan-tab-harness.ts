import { TestBed } from '@angular/core/testing';
import type { BasicLandPrintingsView, BasicLandPrintingView, PlanView } from 'contract';
import { openDialog } from '../../specs-harness';
import {
  accessibleName,
  bob,
  button,
  comboboxOptions,
  editableCombobox,
  http,
  image,
  namedList,
  openTab,
  tabButton,
  text,
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

const ONS_1 = 'f0000000-0000-4000-8000-000000000001';

/** An English printing of a basic land as the API shows it: set `set`, collector number `number`. */
export const printing = (id: string, set: string, number: string): BasicLandPrintingView => ({
  scryfallId: id,
  set,
  collectorNumber: number,
  images: { small: image('small', id), normal: image('normal', id), large: image('large', id) },
});

/** Onslaught's #1, as the API shows a basic land's printing: the one `answerPrintingsRequest` offers. */
export const onsPrinting = printing(ONS_1, 'ons', '1');

/** Answers the open Printing picker's request for `land` with one printing, `onsPrinting`. */
export async function answerPrintingsRequest(land: string) {
  (await vi.waitFor(() => http.expectOne(printingsRequest(land)))).flush({
    sets: [{ code: 'ons', name: 'Onslaught', releasedAt: '2002-10-07', printings: [onsPrinting] }],
  } satisfies BasicLandPrintingsView);
}

/** Scryfall's API image of a printing's face in `version`, which an image falls back to once its CDN URL fails. */
export const apiImage = (version: string, id: string, face: 'front' | 'back' = 'front') =>
  `https://api.scryfall.com/cards/${id}?format=image&version=${version}${face === 'back' ? '&face=back' : ''}`;

/**
 * Each basic land's default printing, by its Scryfall id and the label the
 * Printing picker gives it: Onslaught's first of each, and Oath of the
 * Gatewatch's plain Wastes.
 */
export const defaultPrintings = {
  Plains: { id: '7bf7d68a-dbd0-45f3-acbb-59ee38e6057e', label: 'ONS #331' },
  Island: { id: '36e062ec-df51-40c0-ad8a-2ee1cb8f8f17', label: 'ONS #335' },
  Swamp: { id: '0356ae45-e5ca-46b9-8ebc-42bf4776e89c', label: 'ONS #339' },
  Mountain: { id: '05f9bdca-0d54-46c7-b803-9083dfc9ee24', label: 'ONS #343' },
  Forest: { id: 'b361b42d-401f-440a-bae9-35338b5dde0e', label: 'ONS #347' },
  Wastes: { id: '9cc070d3-4b83-4684-9caf-063e5c473a77', label: 'OGW #183a' },
} as const;

/**
 * Opens the Printing picker of the basic land `land` inside `root` from its
 * name, answers its request as `answerPrintingsRequest` does, and returns
 * the picker once it shows its Set field.
 */
export async function openPrintingPicker(root: HTMLElement, land: string) {
  detailOpener(root, land)!.click();
  await answerPrintingsRequest(land);
  return vi.waitFor(() => {
    TestBed.tick();
    const picker = openDialog();
    if (!picker || !editableCombobox(picker, 'Set')) throw new Error('No Printing picker shows');
    return picker;
  });
}

/**
 * Chooses Onslaught in the open Printing picker of `land` and saves
 * `onsPrinting`, the API answering that it is now the land's preferred printing.
 */
export async function useOnsPrinting(land: string) {
  const setField = editableCombobox(openDialog()!, 'Set')!;
  setField.focus();
  TestBed.tick();
  comboboxOptions(setField)
    .find((option) => text(option) === 'Onslaught · ONS')!
    .click();
  TestBed.tick();
  button(openDialog()!, 'Use this printing')!.click();
  (await vi.waitFor(() => http.expectOne(`/api/preferred-printings/${land}`))).flush({
    [land]: onsPrinting,
  });
}
