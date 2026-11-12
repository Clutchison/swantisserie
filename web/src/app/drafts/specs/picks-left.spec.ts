import type { PickView } from 'contract';
import {
  useDraftsApp,
  draft,
  http,
  updates,
  openUrl,
  bob,
  alicePlayer,
  tabs,
  tabLabels,
  tabPanel,
  panel,
  heading,
  accessibleName,
  openDraft,
  openTab,
  flushPool,
  flushPicks,
  flushQueueAndPlan,
  completeSnapshot,
  drafting,
  pickOf,
  picksLeftCount,
  picksLeftTexts,
  highlightedPicksLeft,
  queuePane,
  viewOn,
  type AppFixture,
} from './harness';

useDraftsApp();

/** The panels whose headings show the viewer's picks left: the Pool and Deck tabs', and the Queue pane's. */
const PANELS = ['Pool', 'Queue', 'Deck'] as const;

describe('picks left beside the panel headings', () => {
  beforeEach(() => viewOn('desktop'));
  afterEach(() => vi.unstubAllGlobals());

  /**
   * Opens the tab named `name` and returns its panel, or for Queue the Queue
   * pane beside the tabs; Pool is open already.
   */
  const open = (fixture: AppFixture, page: HTMLElement, name: string) =>
    name === 'Queue'
      ? Promise.resolve(queuePane(page))
      : name === 'Pool'
        ? Promise.resolve(panel(page))
        : openTab(fixture, page, name);

  it.each(PANELS)(
    'shows the count beside the %s heading, which keeps the panel name as its name',
    async (name) => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 12 }));

      const shown = await open(fixture, page, name);
      const title = heading(shown, name)!;
      expect(title).toBeDefined();
      expect(title.textContent.trim()).toBe(name);
      expect(picksLeftCount(shown)?.textContent.trim()).toBe('– 12 picks left');
      expect(accessibleName(picksLeftCount(shown)!).trim()).toBe('12 picks left');
      expect(picksLeftTexts(shown)).toEqual(['12 picks left']);
    },
  );

  it('says "1 pick left" in the singular', async () => {
    const { page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 1 }));

    expect(picksLeftTexts(panel(page))).toEqual(['1 pick left']);
  });

  it('leaves the tab buttons and the other panels without the count', async () => {
    const { page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 12 }));

    expect(tabLabels(page)).toEqual(['Pool', 'Deck', 'Board']);
    expect(tabs(page).flatMap(picksLeftTexts)).toEqual([]);
    expect(picksLeftTexts(tabPanel(page, 'Board'))).toEqual([]);
  });

  it('shows the viewer’s picks left, less the picks they have made', async () => {
    const { page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 12 }), {
      picks: [
        pickOf({ pick: 1, playerId: alicePlayer.id, poolCardId: 'a' }),
        pickOf({ pick: 2, playerId: bob.id, poolCardId: 'b' }),
        pickOf({ pick: 3, playerId: bob.id, poolCardId: 'c' }),
        pickOf({ pick: 4, playerId: alicePlayer.id, poolCardId: 'd' }),
      ],
    });

    expect(picksLeftTexts(panel(page))).toEqual(['10 picks left']);
  });

  it('shows the count on all three panels while the draft is frozen', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ state: 'Frozen', picksPerPlayer: 12 }),
    );

    for (const name of PANELS) {
      expect(picksLeftTexts(await open(fixture, page, name))).toEqual(['12 picks left']);
    }
  });

  it('shows the count on the Pool and Deck tabs once the draft is closed, where the Players panel has the Queue pane’s column', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ state: 'Closed', picksPerPlayer: 12, turn: null }),
    );

    for (const name of ['Pool', 'Deck']) {
      expect(picksLeftTexts(await open(fixture, page, name))).toEqual(['12 picks left']);
    }
  });

  it('shows the count on the Pool and Deck tabs in the lobby, which has no Queue pane', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ state: 'Lobby', picksPerPlayer: 12, turn: null }),
    );

    for (const name of ['Pool', 'Deck']) {
      expect(picksLeftTexts(await open(fixture, page, name))).toEqual(['12 picks left']);
    }
  });

  it('shows the bare heading in a complete draft', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, {
      state: 'Complete',
      players: [alicePlayer, bob],
      picksPerPlayer: 12,
    });

    for (const name of ['Pool', 'Deck']) {
      const shown = await open(fixture, page, name);
      expect(heading(shown, name)).toBeDefined();
      expect(picksLeftTexts(shown)).toEqual([]);
    }
  });

  it('shows the bare heading to a viewer who isn’t a player', async () => {
    const { page } = await openDraft(
      completeSnapshot,
      drafting({ players: [bob], picksPerPlayer: 12 }),
    );

    expect(heading(panel(page), 'Pool')).toBeDefined();
    expect(picksLeftTexts(page)).toEqual([]);
  });

  it.each([
    [10, '10 picks left'],
    [11, null],
  ])('at %i picks left, the highlighted text is %s', async (picksPerPlayer, expected) => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer }));

    for (const name of PANELS) {
      const shown = await open(fixture, page, name);
      expect(picksLeftTexts(shown)).toEqual([`${picksPerPlayer} picks left`]);
      expect(highlightedPicksLeft(shown)).toBe(expected);
    }
  });

  /** A new version of a draft of `picksPerPlayer`, with the pick log re-read as `picks`. */
  const changed = async (
    fixture: AppFixture,
    picksPerPlayer: number,
    version: number,
    picks: PickView[],
  ) => {
    updates.events.next({
      type: 'changed',
      draft: draft(drafting({ picksPerPlayer, version })),
    });
    await flushPicks(picks);
    await flushQueueAndPlan();
    await fixture.whenStable();
  };

  it('counts down as the viewer picks, and back up when an undo takes one back', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 12 }));
    expect(picksLeftTexts(panel(page))).toEqual(['12 picks left']);

    await changed(fixture, 12, 1, [pickOf({ poolCardId: 'a' })]);
    expect(picksLeftTexts(panel(page))).toEqual(['11 picks left']);

    await changed(fixture, 12, 2, []);
    expect(picksLeftTexts(panel(page))).toEqual(['12 picks left']);
  });

  it.each(PANELS)(
    'highlights the %s count as a pick takes the viewer to 10 picks left, and not once an undo takes it back',
    async (name) => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 11 }));
      const shown = await open(fixture, page, name);
      expect(highlightedPicksLeft(shown)).toBeNull();

      await changed(fixture, 11, 1, [pickOf({ poolCardId: 'a' })]);
      expect(picksLeftTexts(shown)).toEqual(['10 picks left']);
      expect(highlightedPicksLeft(shown)).toBe('10 picks left');

      await changed(fixture, 11, 2, []);
      expect(picksLeftTexts(shown)).toEqual(['11 picks left']);
      expect(highlightedPicksLeft(shown)).toBeNull();
    },
  );

  it('waits for the pick log before counting the picks left', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http
      .expectOne('/api/drafts/draft-1')
      .flush(
        draft(drafting({ picksPerPlayer: 12, turn: { pick: 2, round: 1, playerId: bob.id } })),
      );
    await flushPool([]);
    await flushQueueAndPlan();
    const picks = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks'));
    // Not stable while the pick log is on its way, so rendered by hand.
    fixture.detectChanges();
    expect(picksLeftTexts(page)).toEqual([]);

    picks.flush([pickOf({ poolCardId: 'a' })]);
    await fixture.whenStable();
    expect(picksLeftTexts(panel(page))).toEqual(['11 picks left']);
  });
});
