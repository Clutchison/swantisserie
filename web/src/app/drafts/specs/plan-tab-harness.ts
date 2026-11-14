import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import type { DebugElement } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { BasicLandPrintingsView, BasicLandPrintingView, PlanView } from 'contract';
import {
  byAriaLabel,
  collapseWhitespace,
  openDialog,
  stubScrollIntoView,
} from '../../specs-harness';
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
  tabPanel,
  text,
  type AppFixture,
  type NamedPoolCard,
} from './harness';
import { card, shivan, brightclimb } from './pool-tab-harness';

/** Bob's turn, on the draft's third pick. */
export const bobsTurn = { pick: 3, round: 2, playerId: bob.id };
/** A width in px of the Deck tab's stacks area with room for the wide stacks layout, as a desktop's has. */
export const WIDE_STACKS_AREA = 800;
/** A width in px of the stacks area too narrow for the wide stacks layout, as a phone's is. */
export const NARROW_STACKS_AREA = 360;
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
  readyNotice: false,
  preferredPrintings: {},
  ...fields,
});

/** The Ready notice inside `root`: the status telling the player they are no longer ready; undefined if none shows. */
export const readyNotice = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[role="status"]')].find((status) =>
    text(status).startsWith('You’re no longer ready'),
  );

/** The Deck tab's panel, even while it's hidden behind another tab. */
export const planPanel = (page: HTMLElement) => tabPanel(page, 'Deck');

/** Arena's sideboard-cap notice on the Deck tab: the status saying Arena may keep only 15; undefined if none shows. */
export const sideboardNotice = (page: HTMLElement) =>
  [...planPanel(page).querySelectorAll<HTMLElement>('[role="status"]')].find((status) =>
    text(status).startsWith('Your sideboard has'),
  );

/** The Deck tab's Export button, whether it shows its label or its confirmation. */
export const exportButton = (page: HTMLElement) =>
  [...planPanel(page).querySelectorAll('button')].find((candidate) =>
    ['Export', 'Copied'].includes(accessibleName(candidate)),
  );

/** Opens the Deck tab and returns its panel. */
export const openPlan = (fixture: AppFixture, page: HTMLElement) => openTab(fixture, page, 'Deck');

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
    [...planBoard.querySelectorAll('[role="group"] ul[aria-label]')].map(
      (list) => `${list.getAttribute('aria-label')}: ${stackedCards(list).join(', ')}`,
    ),
  );

/**
 * The stack headers above the strip, one per stack in it, each by its
 * accessible name, with ` (current)` after the one marked as the player's
 * location in the strip. Null with no stack headers.
 */
export function stackHeaders(plan: HTMLElement) {
  return stackHeadersNavigation(plan)
    ? stackHeaderButtons(plan).map(
        (header) =>
          accessibleName(header) +
          (header.getAttribute('aria-current') === 'location' ? ' (current)' : ''),
      )
    : null;
}

/** The stack header inside `plan` named `name`, as `Lands, 1 card`. */
export const stackHeader = (plan: HTMLElement, name: string) =>
  stackHeaderButtons(plan).find((header) => accessibleName(header) === name);

/**
 * What each stack header shows: its images by alt text, `''` for a
 * decorative one, as a symbol is; how many other parts it hides from a screen
 * reader, as a type letter; and the runs of text a screen reader finds, e.g.
 * `{ images: [''], hiddenParts: 0, text: ['+'] }` for a 7+ symbol.
 */
export const stackHeaderContents = (plan: HTMLElement) =>
  stackHeaderButtons(plan).map((header) => ({
    images: [...header.querySelectorAll('img')].map((image) => image.alt),
    hiddenParts: header.querySelectorAll('[aria-hidden="true"]').length,
    text: textRuns(header),
  }));

/**
 * The runs of text inside `element` outside any part hidden from a screen
 * reader, each with its whitespace collapsed, leaving out empty ones.
 */
function textRuns(element: Element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const runs: string[] = [];
  while (walker.nextNode()) {
    if (walker.currentNode.parentElement?.closest('[aria-hidden="true"]')) continue;
    runs.push(walker.currentNode.textContent ?? '');
  }
  return runs.map(collapseWhitespace).filter((run) => run !== '');
}

/** The stack headers inside `plan`, in order: none without the navigation. */
const stackHeaderButtons = (plan: HTMLElement) => [
  ...(stackHeadersNavigation(plan)?.querySelectorAll('button') ?? []),
];

/** The navigation named Stack headers inside `plan`, if any. */
const stackHeadersNavigation = (plan: HTMLElement) =>
  byAriaLabel(plan, 'nav, [role="navigation"]', 'Stack headers');

/**
 * Stands in for the browser's scrolling, which jsdom lacks, for the test to
 * come: `IntersectionObserver`, for what's in view, and `scrollIntoView`.
 * Not stubbed for every test, as a Pool tab tile without an
 * `IntersectionObserver` requests its image straight away. The stubs go once
 * the test finishes.
 */
export function stubScrolling() {
  const observers = new Set<{ callback: IntersectionObserverCallback; watched: Set<Element> }>();
  const scrolls = stubScrollIntoView();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private readonly observer;
      constructor(callback: IntersectionObserverCallback) {
        this.observer = { callback, watched: new Set<Element>() };
        observers.add(this.observer);
      }
      observe(element: Element) {
        this.observer.watched.add(element);
      }
      unobserve(element: Element) {
        this.observer.watched.delete(element);
      }
      /** Stops watching every element, as a browser does; the observer can watch again. */
      disconnect() {
        this.observer.watched.clear();
      }
    },
  );
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  /** The name of the stack `element` is: the name of the list of cards it holds. */
  const stackName = (element: Element) =>
    element.querySelector('ul[aria-label]')?.getAttribute('aria-label');
  return {
    /** The stacks scrolled into view so far, by name, each with how it was scrolled. */
    scrolled: () => scrolls.map(({ element, options }) => ({ stack: stackName(element), options })),
    /**
     * Scrolls so that each stack named in `inView` shows by that share of its
     * width, from 0 to 1, and the others not at all, telling every watcher of
     * a stack, as a browser does, and renders what came of it. The strip is
     * scrolled to its end once its last stack wholly shows and its first doesn't.
     */
    showStacks(inView: Record<string, number>) {
      for (const { callback, watched } of observers) {
        const entries = [...watched].map((target) => {
          const share = inView[stackName(target) ?? ''] ?? 0;
          return { target, isIntersecting: share > 0, intersectionRatio: share };
        });
        callback(entries as IntersectionObserverEntry[], {} as IntersectionObserver);
      }
      TestBed.tick();
    },
    /**
     * Scrolls `strip` until it shows as `showStacks` has it, telling it of
     * the scroll as a browser does, and of the scroll's end unless `ends` is
     * false, as midway through it.
     */
    scroll(strip: HTMLElement, inView: Record<string, number>, { ends = true } = {}) {
      strip.dispatchEvent(new Event('scroll'));
      this.showStacks(inView);
      if (ends) strip.dispatchEvent(new Event('scrollend'));
    },
  };
}

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

/** Zendikar's Mountain #243, a basic land printing a player can prefer. */
export const zenMountain = printing('e0000000-0000-4000-8000-000000000243', 'zen', '243');

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
 * Printing picker gives it: Onslaught's first of each.
 */
export const defaultPrintings = {
  Plains: { id: '7bf7d68a-dbd0-45f3-acbb-59ee38e6057e', label: 'ONS #331' },
  Island: { id: '36e062ec-df51-40c0-ad8a-2ee1cb8f8f17', label: 'ONS #335' },
  Swamp: { id: '0356ae45-e5ca-46b9-8ebc-42bf4776e89c', label: 'ONS #339' },
  Mountain: { id: '05f9bdca-0d54-46c7-b803-9083dfc9ee24', label: 'ONS #343' },
  Forest: { id: 'b361b42d-401f-440a-bae9-35338b5dde0e', label: 'ONS #347' },
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

/**
 * The Deck tab's drop lists, which a dragged card lands in: in list mode, or
 * for an empty plan board, the mainboard's then the sideboard's; in stacks
 * mode, one per stack, as `dropListNamed` finds them. The Queue pane has one
 * of its own.
 */
export const planDropLists = (fixture: AppFixture) =>
  fixture.debugElement.query(By.css('app-plan-tab')).queryAll(By.directive(CdkDropList));

/**
 * The Deck tab's drop list named `name`, as a screen reader names it: in
 * stacks mode a stack's, one of the mainboard's or Sideboard; else a plan
 * board's list, Mainboard or Sideboard.
 */
export const dropListNamed = (fixture: AppFixture, name: string) =>
  planDropLists(fixture).find((list) => list.nativeElement.getAttribute('aria-label') === name)!;

/** The drag of the card named `name` in the drop list `from`, by its card image or its line: the first such card, or the `nth` from 0. */
export const dragOf = (from: DebugElement, name: string, nth = 0) =>
  from
    .queryAll(By.directive(CdkDrag))
    .filter((drag) =>
      [drag.nativeElement.querySelector('img')?.alt, drag.nativeElement.textContent].some((text) =>
        text?.includes(name),
      ),
    )
    [nth].injector.get(CdkDrag);

/** Whether the drop list `onto` lets the drag `item` in, as the CDK asks it while a drag passes over (jsdom can't drag). */
export function acceptsDrop(onto: DebugElement, item: CdkDrag) {
  const list = onto.injector.get(CdkDropList);
  return list.enterPredicate(item, list);
}

/** Ends the drag `item` on the plan board `onto`, as the CDK does, from the plan board it began on. */
export function drop(item: CdkDrag, onto: DebugElement) {
  onto.triggerEventHandler('cdkDropListDropped', {
    item,
    previousContainer: item.dropContainer,
    container: onto.injector.get(CdkDropList),
  });
}

/** Drags the first card named `name` on the plan board `from` onto the plan board `onto`. */
export const dropped = (name: string, from: DebugElement, onto: DebugElement) =>
  drop(dragOf(from, name), onto);
