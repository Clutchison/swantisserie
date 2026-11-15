import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DraftListItemView, DraftView } from 'contract';
import { alice, draft, drafting, type DraftFixture, http, openUrl, router } from './harness';
import { statusIn } from '../../specs-harness';

/**
 * Opens the draft list with GET /api/drafts answered by `drafts`, each
 * without a tournament badge unless it gives one.
 */
export async function openList(drafts: (DraftView & Partial<DraftListItemView>)[]) {
  const { fixture, page } = await openUrl('/');
  http
    .expectOne('/api/drafts')
    .flush(drafts.map((each): DraftListItemView => ({ tournamentBadge: null, ...each })));
  await fixture.whenStable();
  return page;
}

/** Waits for the app to settle: the requests answered, the effects run and the page rendered. */
export const settle = () => TestBed.inject(ApplicationRef).whenStable();

/**
 * Answers with `drafts` the read again of the viewer's drafts, such as the
 * draft list makes each time it opens after another page, once it is made,
 * and settles.
 */
export async function answerListReadAgain(drafts: DraftListItemView[] = []) {
  (await vi.waitFor(() => http.expectOne('/api/drafts'))).flush(drafts);
  await settle();
}

/** Waits for the app to land on the draft list from another page, answers its read again, and settles. */
export async function landOnDraftList() {
  await vi.waitFor(() => expect(router.url).toBe('/'));
  await answerListReadAgain();
}

/** Goes to the draft list from another page, answers its read again, and settles. */
export async function goToDraftList() {
  await router.navigateByUrl('/');
  await answerListReadAgain();
}

/** The draft list's item for the draft named `name`, by its accessible name. */
export function listItem(page: HTMLElement, name: string): HTMLElement {
  const found = [...page.querySelectorAll('li')].find(
    (li) => li.getAttribute('aria-label') === name,
  );
  if (!found) throw new Error(`No draft named ${name} in the list`);
  return found;
}

/** The names of the drafts listed in the draft list's section headed `heading`. */
export function listedDrafts(page: HTMLElement, heading: string): string[] {
  return [...section(page, heading).querySelectorAll('li[aria-label]')].map(
    (li) => li.getAttribute('aria-label') ?? '',
  );
}

/** The link to draft `id`'s page inside `root`, such as a draft's card in the draft list. */
export function draftLink(root: HTMLElement, id: string): HTMLAnchorElement | null {
  return root.querySelector<HTMLAnchorElement>(`a[href="/drafts/${id}"]`);
}

/** The draft list's section headed `heading`, or null when there is none. */
export const findSection = (page: HTMLElement, heading: string) =>
  [...page.querySelectorAll('section')].find(
    (s) => s.querySelector('h2')?.textContent?.trim() === heading,
  ) ?? null;

/** The draft list's section headed `heading`, which a test expects there. */
export function section(page: HTMLElement, heading: string): HTMLElement {
  const found = findSection(page, heading);
  if (!found) throw new Error(`No section headed ${heading}`);
  return found;
}

/** A draft as the draft list lists it, without a tournament badge. */
export function listItemOf(fields: DraftFixture): DraftListItemView {
  return { ...draft(fields), tournamentBadge: null };
}

/**
 * A draft of Alice and Bob as the draft list lists it, on the turn of Alice,
 * the viewer: drafting unless `state` says frozen.
 */
export function alicesTurnItem(
  id: string,
  name: string,
  state: 'Drafting' | 'Frozen' = 'Drafting',
): DraftListItemView {
  return listItemOf({
    id,
    name,
    ...drafting({ state, turn: { pick: 2, round: 1, playerId: alice.id } }),
  });
}

/** The draft list's notice, such as that a draft was cancelled: its live region, empty when there is none. */
export const listNotice = (page: HTMLElement) => statusIn(page, { name: 'Notice' });
