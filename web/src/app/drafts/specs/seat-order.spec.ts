import {
  useDraftsApp,
  bob,
  draft,
  openDraft,
  completeSnapshot,
  flushPicks,
  updates,
  viewOn,
  type DraftFixture,
} from './harness';

useDraftsApp();

describe('seat order', () => {
  const seats = (page: HTMLElement) => page.querySelector<HTMLDetailsElement>('.players details')!;

  const toggle = (page: HTMLElement) => seats(page).querySelector('summary')!.click();

  const drafting = (): DraftFixture => ({
    state: 'Drafting',
    players: [bob],
    turn: { pick: 1, round: 1, playerId: bob.id },
  });

  /** Starts the draft while the page is open, as a pushed update. */
  async function startLive(fixture: { whenStable(): Promise<unknown> }) {
    updates.events.next({ type: 'changed', draft: draft({ ...drafting(), version: 1 }) });
    await flushPicks([]);
    await fixture.whenStable();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('on desktop', () => {
    beforeEach(() => viewOn('desktop'));

    it('is open in the lobby, where seats are arranged', async () => {
      const { page } = await openDraft(completeSnapshot, { players: [bob] });

      expect(seats(page).open).toBe(true);
    });

    it('stays open once the draft has started, showing every seat', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      expect(seats(page).open).toBe(true);
      expect(page.querySelector('.turn')?.textContent).toContain('Bob’s turn');
    });

    it('stays open when the draft starts while the page is open', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [bob] });

      await startLive(fixture);

      expect(seats(page).open).toBe(true);
      expect(page.querySelector('.turn')?.textContent).toContain('Bob’s turn');
    });

    it('can be collapsed and expanded by hand', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      toggle(page);
      expect(seats(page).open).toBe(false);
      toggle(page);
      expect(seats(page).open).toBe(true);
    });
  });

  describe('on mobile', () => {
    beforeEach(() => viewOn('mobile'));

    it('is open in the lobby, where seats are arranged', async () => {
      const { page } = await openDraft(completeSnapshot, { players: [bob] });

      expect(seats(page).open).toBe(true);
    });

    it('collapses once the draft has started, out of the way of the panels', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      expect(seats(page).open).toBe(false);
      expect(page.querySelector('.turn')?.textContent).toContain('Bob’s turn');
    });

    it('collapses when the draft starts while the page is open', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [bob] });

      await startLive(fixture);

      expect(seats(page).open).toBe(false);
      expect(page.querySelector('.turn')?.textContent).toContain('Bob’s turn');
    });

    it('can be expanded and collapsed by hand', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      toggle(page);
      expect(seats(page).open).toBe(true);
      toggle(page);
      expect(seats(page).open).toBe(false);
    });
  });
});
