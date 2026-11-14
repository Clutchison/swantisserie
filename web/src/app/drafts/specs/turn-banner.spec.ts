import type { AppFixture, DraftFixture } from './harness';
import {
  alice,
  bob,
  completeSnapshot,
  draft,
  drafting,
  flushPicks,
  openDraft,
  tabButton,
  text,
  updates,
  useDraftsApp,
  withDoubleTurns,
} from './harness';

useDraftsApp();

/** The Turn banner: the status that tells the viewer it is their turn; null while none shows. */
const turnBanner = (page: HTMLElement) =>
  [...page.querySelectorAll<HTMLElement>('[role="status"]')].find((status) =>
    text(status).startsWith('Your turn'),
  ) ?? null;

/** How many times the page says "Your turn" anywhere. */
const yourTurnTexts = (page: HTMLElement) => text(page).match(/Your turn/g)?.length ?? 0;

/** Pushes draft-1 with `fields` to the page, as a change to it would, and answers its pick log's re-read. */
async function push(fixture: AppFixture, fields: DraftFixture) {
  updates.events.next({ type: 'changed', draft: draft(fields) });
  await flushPicks([]);
  await fixture.whenStable();
}

const alicesTurn = (pick: number, round: number) => ({ pick, round, playerId: alice.id });
const bobsTurn = (pick: number, round: number) => ({ pick, round, playerId: bob.id });

describe('the Turn banner', () => {
  it('tells the viewer it is their turn, with the pick and round, as a status', async () => {
    const { page } = await openDraft(completeSnapshot, drafting({ turn: alicesTurn(3, 2) }));

    expect(text(turnBanner(page))).toBe('Your turn: pick 3, round 2');
  });

  it('stands out while the draft is drafting', async () => {
    const { page } = await openDraft(completeSnapshot, drafting({ turn: alicesTurn(3, 2) }));

    expect(turnBanner(page)?.dataset['standsOut']).toBe('true');
  });

  it.each([
    ['2 picks at its start', 5, 'Your turn: pick 5, round 3 · 2 picks'],
    ['1 more pick after its first', 6, 'Your turn: pick 6, round 3 · 1 more pick'],
  ])('tells the viewer on a double turn the %s', async (_, pick, banner) => {
    const { page } = await openDraft(completeSnapshot, withDoubleTurns(pick, alice.id));

    expect(text(turnBanner(page))).toBe(banner);
  });

  it('says the draft is frozen, and doesn’t stand out, while it is', async () => {
    const { page } = await openDraft(
      completeSnapshot,
      drafting({ state: 'Frozen', turn: alicesTurn(3, 2) }),
    );

    const banner = turnBanner(page);
    expect(text(banner)).toBe('Your turn: pick 3, round 2, once the draft is unfrozen');
    expect(banner?.dataset['standsOut']).toBe('false');
  });

  it('replaces the header’s turn text for the viewer, who is told once', async () => {
    const { page } = await openDraft(completeSnapshot, drafting({ turn: alicesTurn(3, 2) }));

    expect(yourTurnTexts(page)).toBe(1);
  });

  it('isn’t shown on another player’s turn, whom the header names', async () => {
    const { page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn(2, 1) }));

    expect(turnBanner(page)).toBeNull();
    expect(text(page)).toContain('Bob’s turn: pick 2, round 1');
  });

  it.each([
    ['closed', { state: 'Closed' as const, turn: null }],
    ['complete', { state: 'Complete' as const, turn: null }],
  ])('isn’t shown once the draft is %s', async (_, fields) => {
    const { page } = await openDraft(completeSnapshot, drafting(fields));

    expect(turnBanner(page)).toBeNull();
  });

  it('appears as the turn reaches the viewer, without moving focus', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn(2, 1) }));
    const board = tabButton(page, 'Board');
    board.focus();

    await push(fixture, drafting({ turn: alicesTurn(3, 2) }));

    expect(text(turnBanner(page))).toBe('Your turn: pick 3, round 2');
    expect(document.activeElement).toBe(board);
  });

  it('goes as the turn passes', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ turn: alicesTurn(3, 2) }),
    );

    await push(fixture, drafting({ turn: bobsTurn(4, 2) }));

    expect(turnBanner(page)).toBeNull();
    expect(text(page)).toContain('Bob’s turn: pick 4, round 2');
  });

  it('stays across a turnaround, with the next pick', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ turn: alicesTurn(2, 1) }),
    );

    await push(fixture, drafting({ turn: alicesTurn(3, 2) }));

    expect(text(turnBanner(page))).toBe('Your turn: pick 3, round 2');
  });
});
