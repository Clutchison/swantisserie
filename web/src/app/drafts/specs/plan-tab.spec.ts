import type { ViewerTournamentView } from 'contract';
import { EMPTY_QUEUE } from '../drafts';
import {
  useDraftsApp,
  accessibleName,
  alice,
  alicePlayer,
  bob,
  buttons,
  heading,
  openTab,
  tabLabels,
  tabPanel,
  text,
  http,
  tabButton,
  panel,
  openDraft,
  openUrl,
  draft,
  flushPool,
  flushPicks,
  flushQueue,
  flushQueueAndPlan,
  expectLoadingAnimation,
  completeSnapshot,
  button,
  updates,
  viewOn,
  drafting,
  statusMessage,
  alertIn,
} from './harness';
import { useTallScreen, shivan, brightclimb } from './pool-tab-harness';
import {
  bobsTurn,
  bolt,
  boltAgain,
  cards,
  planned,
  unpicked,
  planOf,
  openPlan,
  planBoards,
} from './plan-tab-harness';
import {
  complete,
  playing,
  pushTournament,
  registration,
  withDrops,
  withTournament,
} from './play-tab-harness';

useDraftsApp();
useTallScreen();

describe('plan tab', () => {
  const tabs = (page: HTMLElement) =>
    [...page.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent?.trim());

  it('lists the mainboard and the sideboard, each line a count and a name', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf({ sideboard: [planned(shivan)] }),
    });
    const plan = await openPlan(fixture, page);

    expect(plan.querySelector('h2')?.textContent).toBe('Plan');
    expect(planBoards(plan)).toEqual([
      {
        heading: 'Mainboard 4 (4 picked)',
        lines: [
          '1 Brightclimb Pathway // Grimclimb Pathway',
          '2 Lightning Bolt',
          '1 Shivan Dragon',
        ],
      },
      { heading: 'Sideboard 1 (1 picked)', lines: ['1 Shivan Dragon'] },
    ]);
    // Each name opens its Card detail.
    const [mainboard, sideboard] = plan.querySelectorAll('section');
    expect([...mainboard.querySelectorAll('button')].map(accessibleName)).toEqual([
      'Brightclimb Pathway // Grimclimb Pathway',
      'Move Brightclimb Pathway // Grimclimb Pathway to the sideboard',
      'Lightning Bolt',
      'Move Lightning Bolt to the sideboard',
      'Shivan Dragon',
      'Move Shivan Dragon to the sideboard',
    ]);
    expect([...sideboard.querySelectorAll('button')].map(accessibleName)).toEqual([
      'Shivan Dragon',
      'Move Shivan Dragon to the mainboard',
    ]);
  });

  it('sits between Queue and Board for every player', async () => {
    const { page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }));

    expect(tabs(page)).toEqual(['Pool', 'Queue', 'Plan', 'Board', 'Export']);
    expect(tabButton(page, 'Plan').disabled).toBe(false);
  });

  it('is offered only to players', async () => {
    const { page } = await openDraft(
      completeSnapshot,
      drafting({ turn: bobsTurn, players: [bob] }),
    );

    expect(tabs(page)).toEqual(['Pool', 'Queue', 'Plan', 'Board', 'Export']);
    expect(tabButton(page, 'Plan').disabled).toBe(true);
    http.expectNone('/api/drafts/draft-1/plan');
  });

  it('says when a plan board is empty', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
    });
    const plan = await openPlan(fixture, page);

    const [mainboard, sideboard] = plan.querySelectorAll('section');
    expect(mainboard.querySelector('.empty')?.textContent?.trim()).toBe('No picks yet.');
    expect(sideboard.querySelector('.empty')?.textContent?.trim()).toBe(
      'Nothing on your sideboard.',
    );
  });

  it('moves one copy of a card to the other plan board, showing the plan the API answers with', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);

    button(plan, 'Move Lightning Bolt to the sideboard')!.click();
    await fixture.whenStable();
    expect(button(plan, 'Move Shivan Dragon to the sideboard')!.getAttribute('aria-disabled')).toBe(
      'true',
    );
    const req = http.expectOne('/api/drafts/draft-1/plan/bolt-card');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ board: 'Sideboard' });
    req.flush(
      planOf({
        mainboard: [planned(brightclimb), planned(boltAgain), planned(shivan)],
        sideboard: [planned(bolt)],
      }),
    );
    // The answer shows once its promise settles, a moment after the fixture is stable.
    await vi.waitFor(() =>
      expect(planBoards(plan)).toEqual([
        {
          heading: 'Mainboard 3 (3 picked)',
          lines: [
            '1 Brightclimb Pathway // Grimclimb Pathway',
            '1 Lightning Bolt',
            '1 Shivan Dragon',
          ],
        },
        { heading: 'Sideboard 1 (1 picked)', lines: ['1 Lightning Bolt'] },
      ]),
    );
    expect(
      button(plan, 'Move Shivan Dragon to the sideboard')!.getAttribute('aria-disabled'),
    ).toBeNull();

    button(plan, 'Move Lightning Bolt to the mainboard')!.click();
    const back = http.expectOne('/api/drafts/draft-1/plan/bolt-card');
    expect(back.request.body).toEqual({ board: 'Mainboard' });
    back.flush(planOf());
    await vi.waitFor(() =>
      expect(planBoards(plan)[1]).toEqual({ heading: 'Sideboard 0 (0 picked)', lines: [] }),
    );
  });

  it('shows a line’s move button as minus on the mainboard and plus on the sideboard, and Remove as a trash can', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf({
        mainboard: [planned(brightclimb), unpicked(shivan)],
        sideboard: [planned(bolt)],
      }),
    });
    const plan = await openPlan(fixture, page);

    /** The button's Lucide icon, its visible text, and its tooltip. */
    const shown = (name: string) => {
      const found = button(plan, name)!;
      const icon = [...found.querySelectorAll('svg')].map((svg) =>
        [...svg.classList].find((name) => name.startsWith('lucide-')),
      );
      return { icon, text: found.textContent?.trim(), tooltip: found.title };
    };
    expect(shown('Move Shivan Dragon to the sideboard')).toEqual({
      icon: ['lucide-minus'],
      text: '',
      tooltip: 'Move Shivan Dragon to the sideboard',
    });
    expect(shown('Move Lightning Bolt to the mainboard')).toEqual({
      icon: ['lucide-plus'],
      text: '',
      tooltip: 'Move Lightning Bolt to the mainboard',
    });
    expect(shown('Remove Shivan Dragon from your plan')).toEqual({
      icon: ['lucide-trash'],
      text: '',
      tooltip: 'Remove Shivan Dragon from your plan',
    });
  });

  it('says why a move was refused, and re-reads the plan', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);

    button(plan, 'Move Shivan Dragon to the sideboard')!.click();
    http
      .expectOne('/api/drafts/draft-1/plan/shivan-card')
      .flush(
        { error: 'not-in-plan', message: 'That card isn’t in your plan.' },
        { status: 409, statusText: 'Conflict' },
      );
    const reread = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'));
    await vi.waitFor(() =>
      expect(alertIn(plan)?.textContent).toContain('That card isn’t in your plan.'),
    );

    reread.flush(planOf({ mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain)] }));
    await fixture.whenStable();
    expect(planBoards(plan)[0].lines).toEqual([
      '1 Brightclimb Pathway // Grimclimb Pathway',
      '2 Lightning Bolt',
    ]);
    expect(statusMessage(plan, 'Shivan Dragon moved to the sideboard')).toBeUndefined();
  });

  it('clears the reason a change was refused once one is made', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);
    button(plan, 'Move Shivan Dragon to the sideboard')!.click();
    http
      .expectOne('/api/drafts/draft-1/plan/shivan-card')
      .flush(
        { error: 'not-in-plan', message: 'That card isn’t in your plan.' },
        { status: 409, statusText: 'Conflict' },
      );
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'))).flush(planOf());
    await vi.waitFor(() => expect(alertIn(plan)).not.toBeNull());

    button(plan, 'Move Shivan Dragon to the sideboard')!.click();
    http.expectOne('/api/drafts/draft-1/plan/shivan-card').flush(
      planOf({
        mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain)],
        sideboard: [planned(shivan)],
      }),
    );
    await fixture.whenStable();

    expect(alertIn(plan)).toBeNull();
  });

  it('dims unpicked cards, marks them, counts them apart and offers to remove them', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf({
        mainboard: [planned(brightclimb), planned(bolt), unpicked(boltAgain), unpicked(shivan)],
        sideboard: [],
      }),
    });
    const plan = await openPlan(fixture, page);

    expect(planBoards(plan)).toEqual([
      {
        heading: 'Mainboard 4 (2 picked)',
        lines: [
          '1 Brightclimb Pathway // Grimclimb Pathway',
          '1 Lightning Bolt',
          '1 Lightning Bolt (unpicked)',
          '1 Shivan Dragon (unpicked)',
        ],
      },
      { heading: 'Sideboard 0 (0 picked)', lines: [] },
    ]);
    // Styles hide the mark on a narrow screen, which jsdom can't apply; a screen reader still reads it.
    const shivanLine = [...plan.querySelectorAll('li')].find((line) =>
      accessibleName(line).includes('Shivan Dragon'),
    )!;
    expect(accessibleName(shivanLine)).toContain('Unpicked');
    expect(
      button(plan, 'Remove Brightclimb Pathway // Grimclimb Pathway from your plan'),
    ).toBeUndefined();

    button(plan, 'Remove Shivan Dragon from your plan')!.click();
    const req = http.expectOne('/api/drafts/draft-1/plan/shivan-card');
    expect(req.request.method).toBe('DELETE');
    req.flush(planOf({ mainboard: [planned(brightclimb), planned(bolt), unpicked(boltAgain)] }));
    await vi.waitFor(() =>
      expect(planBoards(plan)[0]).toEqual({
        heading: 'Mainboard 3 (2 picked)',
        lines: [
          '1 Brightclimb Pathway // Grimclimb Pathway',
          '1 Lightning Bolt',
          '1 Lightning Bolt (unpicked)',
        ],
      }),
    );

    // An unpicked card moves like a pick.
    button(plan, 'Move Lightning Bolt to the sideboard')!.click();
    const move = http.expectOne('/api/drafts/draft-1/plan/bolt-card');
    expect(move.request.body).toEqual({ board: 'Sideboard' });
    move.flush(
      planOf({
        mainboard: [planned(brightclimb), unpicked(boltAgain)],
        sideboard: [planned(bolt)],
      }),
    );
    await vi.waitFor(() => expect(planBoards(plan)[1].heading).toBe('Sideboard 1 (1 picked)'));
    // The second Lightning Bolt line is the unpicked one, so its button moves that copy.
    const unpickedLine = [...plan.querySelectorAll('li.unpicked')].find((line) =>
      line.textContent?.includes('Lightning Bolt'),
    )!;
    unpickedLine.querySelector<HTMLButtonElement>('button[aria-label^="Move"]')!.click();
    expect(http.expectOne('/api/drafts/draft-1/plan/bolt-card-2').request.body).toEqual({
      board: 'Sideboard',
    });
  });

  it('notes lost cards, with who picked them, until dismissed', async () => {
    const carol = { ...bob, id: 'carol', name: 'Carol', isBot: true };
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ turn: bobsTurn, players: [alicePlayer, bob, carol] }),
      {
        cards,
        plan: planOf({
          mainboard: [planned(brightclimb)],
          lost: [
            { poolCardId: shivan.id, name: shivan.name, pickedBy: bob.id },
            { poolCardId: bolt.id, name: bolt.name, pickedBy: carol.id },
          ],
        }),
      },
    );
    const plan = await openPlan(fixture, page);

    const note = plan.querySelector<HTMLElement>('.notice')!;
    expect(note.getAttribute('role')).toBe('status');
    expect(note.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Lost to other players: Shivan Dragon (picked by Bob), Lightning Bolt (picked by Carol). Dismiss',
    );

    button(note, 'Dismiss')!.click();
    const req = http.expectOne('/api/drafts/draft-1/plan/notice');
    expect(req.request.method).toBe('DELETE');
    req.flush(planOf({ mainboard: [planned(brightclimb)] }));
    await vi.waitFor(() => expect(plan.querySelector('.notice')).toBeNull());
  });

  it('still notes a lost card whose picker is no longer among the players', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf({
        mainboard: [planned(brightclimb)],
        lost: [{ poolCardId: shivan.id, name: shivan.name, pickedBy: 'gone' }],
      }),
    });
    const plan = await openPlan(fixture, page);

    expect(plan.querySelector('.notice')!.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Lost to other players: Shivan Dragon (picked by another player). Dismiss',
    );
  });

  it('says so while the plan loads', async () => {
    const { page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(draft(drafting({ turn: bobsTurn })));
    await flushPool(cards);
    await flushPicks([]);
    await flushQueue(EMPTY_QUEUE);
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'));
    tabButton(page, 'Plan').click();
    await expectLoadingAnimation(() => panel(page), 'Loading your plan…', 64);

    req.flush(planOf());
    await vi.waitFor(() =>
      expect(planBoards(panel(page))[0].heading).toBe('Mainboard 4 (4 picked)'),
    );
  });

  it('says when the plan couldn’t be loaded', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(draft(drafting({ turn: bobsTurn })));
    await flushPool(cards);
    await flushPicks([]);
    await flushQueue(EMPTY_QUEUE);
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'))).flush(
      {},
      { status: 500, statusText: 'Server Error' },
    );
    await fixture.whenStable();

    const plan = await openPlan(fixture, page);
    expect(plan.querySelector('.error')?.textContent).toContain("Couldn't load your plan");
    expect(plan.querySelector('app-plan-tab')).toBeNull();
  });

  it('re-reads the plan when the draft changes, as a pick may have landed or been undone', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf({ mainboard: [planned(shivan)] }),
    });
    const plan = await openPlan(fixture, page);
    expect(planBoards(plan)[0].heading).toBe('Mainboard 1 (1 picked)');

    updates.events.next({
      type: 'changed',
      draft: draft(drafting({ turn: bobsTurn, version: 1 })),
    });
    await flushPicks([]);
    await flushQueueAndPlan(EMPTY_QUEUE, planOf());
    await fixture.whenStable();

    expect(planBoards(plan)[0].heading).toBe('Mainboard 4 (4 picked)');
  });

  it('offers only list mode below the desktop breakpoint, whatever was chosen on desktop', async () => {
    localStorage.setItem('plan-view', JSON.stringify({ mode: 'stacks', grouping: 'color' }));
    viewOn('mobile');
    try {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);

      expect(button(plan, 'Stacks')).toBeUndefined();
      expect(button(plan, 'List')).toBeUndefined();
      expect(plan.querySelector('.stack')).toBeNull();
      expect(planBoards(plan)[0].lines).toHaveLength(3);
    } finally {
      vi.unstubAllGlobals();
      localStorage.clear();
    }
  });

  it.each(['Lobby', 'Paused', 'Closed', 'Complete'] as const)(
    'can be changed while the draft is %s, unpicked cards included, as the api never refuses removing one for the draft’s state',
    async (state) => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        { players: [alicePlayer, bob], state },
        { cards, plan: planOf({ sideboard: [unpicked(boltAgain)] }) },
      );
      const plan = await openPlan(fixture, page);

      expect(button(plan, 'Move Shivan Dragon to the sideboard')!.disabled).toBe(false);
      expect(planBoards(plan)[1].lines).toEqual(['1 Lightning Bolt (unpicked)']);
      expect(button(plan, 'Remove Lightning Bolt from your plan')!.disabled).toBe(false);
    },
  );

  describe('focus after a change', () => {
    it('keeps a line of several copies, and focus in it, as one copy moves, and says where it went', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);
      const line = button(plan, 'Move Lightning Bolt to the sideboard')!;

      line.focus();
      line.click();
      await fixture.whenStable();
      expect(line.getAttribute('aria-disabled')).toBe('true');
      expect(document.activeElement).toBe(line);
      line.click();
      http.expectOne('/api/drafts/draft-1/plan/bolt-card').flush(
        planOf({
          mainboard: [planned(brightclimb), planned(boltAgain), planned(shivan)],
          sideboard: [planned(bolt)],
        }),
      );
      await vi.waitFor(() => expect(planBoards(plan)[1].lines).toEqual(['1 Lightning Bolt']));

      // The same line, not one rebuilt in its place.
      expect(button(plan, 'Move Lightning Bolt to the sideboard')).toBe(line);
      expect(document.activeElement).toBe(line);
      expect(line.getAttribute('aria-disabled')).toBeNull();
      expect(statusMessage(plan, 'Lightning Bolt moved to the sideboard')).toBeDefined();
    });

    it('moves focus to the card on the other plan board once its line is gone', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);

      button(plan, 'Move Shivan Dragon to the sideboard')!.focus();
      button(plan, 'Move Shivan Dragon to the sideboard')!.click();
      http.expectOne('/api/drafts/draft-1/plan/shivan-card').flush(
        planOf({
          mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain)],
          sideboard: [planned(shivan)],
        }),
      );

      await vi.waitFor(() =>
        expect(document.activeElement).toBe(button(plan, 'Move Shivan Dragon to the mainboard')),
      );
      expect(statusMessage(plan, 'Shivan Dragon moved to the sideboard')).toBeDefined();
    });

    it('keeps focus on the pressed button when a move fails', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);
      const move = button(plan, 'Move Shivan Dragon to the sideboard')!;

      move.focus();
      move.click();
      http
        .expectOne('/api/drafts/draft-1/plan/shivan-card')
        .flush(null, { status: 500, statusText: 'Server Error' });
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'))).flush(planOf());

      await vi.waitFor(() => expect(alertIn(plan)).not.toBeNull());
      await fixture.whenStable();
      expect(document.activeElement).toBe(button(plan, 'Move Shivan Dragon to the sideboard'));
    });

    it('keeps focus on a line’s Remove as one of its several copies goes', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [planned(brightclimb), unpicked(bolt), unpicked(boltAgain)] }),
      });
      const plan = await openPlan(fixture, page);
      const remove = button(plan, 'Remove Lightning Bolt from your plan')!;

      remove.focus();
      remove.click();
      http
        .expectOne('/api/drafts/draft-1/plan/bolt-card')
        .flush(planOf({ mainboard: [planned(brightclimb), unpicked(boltAgain)] }));
      await vi.waitFor(() => expect(planBoards(plan)[0].lines).toHaveLength(2));
      await fixture.whenStable();

      expect(document.activeElement).toBe(button(plan, 'Remove Lightning Bolt from your plan'));
    });

    it('moves focus to the next line once removing a card’s last copy takes its line', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [planned(brightclimb), unpicked(bolt), unpicked(shivan)] }),
      });
      const plan = await openPlan(fixture, page);

      button(plan, 'Remove Lightning Bolt from your plan')!.focus();
      button(plan, 'Remove Lightning Bolt from your plan')!.click();
      http
        .expectOne('/api/drafts/draft-1/plan/bolt-card')
        .flush(planOf({ mainboard: [planned(brightclimb), unpicked(shivan)] }));

      await vi.waitFor(() =>
        expect(document.activeElement).toBe(button(plan, 'Move Shivan Dragon to the sideboard')),
      );
    });
  });
});

describe('plan tab as the deck', () => {
  it('takes the Plan tab’s place once the draft is complete, its copy saying deck', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, complete, {
      cards,
      plan: planOf({ basics: [{ land: 'Mountain', count: 2 }] }),
    });

    expect(tabLabels(page)).toEqual(['Pool', 'Deck', 'Board', 'Export']);
    const deck = await openTab(fixture, page, 'Deck');
    expect(heading(deck, 'Deck')).toBeDefined();
    expect(deck.textContent).toContain('Only you can see your deck.');
    expect(deck.textContent).not.toMatch(/\bplan\b/i);
    expect(planBoards(deck)[0].heading).toBe('Mainboard 6 (6 picked)');
  });

  it('tells a viewer who isn’t a player that only players have a deck', async () => {
    const { page } = await openDraft(completeSnapshot, { ...complete, players: [bob] });

    expect(tabLabels(page)).toEqual(['Pool', 'Deck', 'Board', 'Export']);
    expect(tabPanel(page, 'Deck').textContent).toContain('Only players have a deck.');
  });

  it.each([
    ['still drafting', drafting({ turn: { pick: 3, round: 2, playerId: bob.id } })],
    ['closed', drafting({ state: 'Closed', turn: null })],
  ])('stays the Plan tab while the draft is %s', async (_, fields) => {
    const { fixture, page } = await openDraft(completeSnapshot, fields, {
      cards,
      plan: planOf(),
    });

    expect(tabLabels(page)).toEqual(['Pool', 'Queue', 'Plan', 'Board', 'Export']);
    const plan = await openTab(fixture, page, 'Plan');
    expect(heading(plan, 'Plan')).toBeDefined();
    expect(panel(page).textContent).toContain('Only you can see your plan.');
  });

  describe('the deck and the tournament', () => {
    /** The buttons in the Deck tab that would change the deck. */
    const deckEdits = (deck: HTMLElement) =>
      [...deck.querySelectorAll('button')].filter((b) =>
        /^(Move|Remove|Basic lands)/.test(accessibleName(b)),
      );
    // Four picks and two basics: six cards.
    const deck = planOf({ basics: [{ land: 'Mountain', count: 2 }] });
    const REMINDER =
      'Your deck locks when the tournament starts, until it is complete or cancelled.';
    const SHORT = 'A tournament deck needs at least 40';

    /** Opens the Deck tab of the complete draft with `tournament` set up, Alice's deck `plan`. */
    async function openDeck(tournament: ViewerTournamentView, plan = deck) {
      const { fixture, page } = await openDraft(completeSnapshot, withTournament(tournament), {
        cards,
        plan,
        tournament,
      });
      return { fixture, page, tab: await openTab(fixture, page, 'Deck') };
    }

    it('reminds a joined player during registration that their deck locks at Start, warns that its mainboard is under 40, and offers edits', async () => {
      const { page, tab } = await openDeck(registration(bob.id, alice.id));

      expect(text(tab)).toContain(REMINDER);
      expect(text(tab)).toContain(
        'Your mainboard holds 6 cards. A tournament deck needs at least 40: fill your deck before marking yourself ready, or leave the tournament if you won’t play.',
      );
      expect(text(tab)).not.toContain('locked');
      expect(deckEdits(tab).length).toBeGreaterThan(0);
      expect(buttons(page, 'Export')[0].disabled).toBe(false);
    });

    it('leaves out the warning once the mainboard holds 40 cards', async () => {
      const { tab } = await openDeck(
        registration(bob.id, alice.id),
        planOf({ basics: [{ land: 'Mountain', count: 36 }] }),
      );

      expect(text(tab)).toContain(REMINDER);
      expect(text(tab)).not.toContain(SHORT);
    });

    it.each([
      ['playing', playing()],
      ['dropped', withDrops([alice.id])],
    ])(
      'says the deck stays locked until the tournament is complete or cancelled while its player is %s',
      async (_, tournament) => {
        const { tab } = await openDeck(tournament);

        expect(text(tab)).toContain(
          'Your deck is locked until the tournament is complete or cancelled.',
        );
        expect(text(tab)).not.toContain(REMINDER);
        expect(text(tab)).not.toContain(SHORT);
        expect(deckEdits(tab)).toEqual([]);
        expect(planBoards(tab)[0].heading).toBe('Mainboard 6 (6 picked)');
      },
    );

    it('shows no reminder, and offers edits, to a player who has left', async () => {
      const { tab } = await openDeck(registration(bob.id));

      expect(tab.textContent).not.toContain('locked');
      expect(text(tab)).not.toContain(REMINDER);
      expect(deckEdits(tab).length).toBeGreaterThan(0);
    });

    it.each([
      ['cancelled', null],
      ['complete', playing([], { state: 'Complete', trophyHolders: [alice.id] })],
    ])('offers edits again once the tournament is %s', async (_, tournament) => {
      const { fixture, page } = await openDeck(playing());

      await pushTournament(fixture, tournament, 1, { asPlayer: true, plan: deck, fields: {} });

      const tab = tabPanel(page, 'Deck');
      expect(text(tab)).not.toContain('locked');
      expect(deckEdits(tab).length).toBeGreaterThan(0);
      expect(planBoards(tab)[0].heading).toBe('Mainboard 6 (6 picked)');
    });
  });
});
