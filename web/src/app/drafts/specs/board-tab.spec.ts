import { TestBed } from '@angular/core/testing';
import type { PickView, PoolCardView } from 'contract';
import { carol, openDialog } from '../../specs-harness';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  openUrl,
  bob,
  alicePlayer,
  tabButton,
  panel,
  openDraft,
  completeSnapshot,
  expectLoadingAnimation,
  type DraftFixture,
  pickOf,
  poolCardOf,
  findNamedList,
  updates,
  flushQueueAndPlan,
  cardName,
  image,
  previewImage,
  tap,
} from './harness';
import { boardCell, boardColumns, boardRows, findBoard, latestPicks } from './board-tab-harness';
import { costBefore } from './card-previews-harness';

useDraftsApp();

const FORWARD = 'first seat to last';
const BACK = 'last seat to first';

describe('board tab', () => {
  const cards: PoolCardView[] = [
    poolCardOf('shock', 'Shock'),
    poolCardOf('bolt', 'Lightning Bolt'),
    poolCardOf('spike', 'Lava Spike', { typeLine: 'Sorcery — Arcane' }),
    poolCardOf('bolt-1', 'Lightning Bolt'),
    poolCardOf('bolt-2', 'Lightning Bolt'),
    poolCardOf('bolt-3', 'Lightning Bolt'),
    poolCardOf('helix', 'Lightning Helix'),
    poolCardOf('blast', 'Fireblast'),
    poolCardOf('chain', 'Chain Lightning'),
  ];
  const picks: PickView[] = [
    pickOf({ playerId: bob.id, poolCardId: 'shock-card' }),
    pickOf({ pick: 2, poolCardId: 'bolt-card' }),
    pickOf({ pick: 3, poolCardId: 'spike-card' }),
  ];
  /** Bob in seat 0 and Alice in seat 1, with the first three picks made: round 2 has begun. */
  const drafting: DraftFixture = {
    state: 'Drafting',
    players: [bob, alicePlayer],
    turn: { pick: 4, round: 2, playerId: bob.id },
  };

  async function openBoard(
    picks: PickView[],
    fields: DraftFixture = {},
    { user = alice }: { user?: typeof alice } = {},
  ) {
    const opened = await openDraft(
      completeSnapshot,
      { ...drafting, ...fields },
      {
        cards,
        picks,
        user,
      },
    );
    tabButton(opened.page, 'Board').click();
    await opened.fixture.whenStable();
    return opened;
  }

  /** Opens the Board tab with the GETs of the pool and the picks left for the test to answer. */
  async function openBoardUnanswered(players = [bob]) {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(
      draft({
        snapshot: completeSnapshot,
        state: 'Drafting',
        players,
        turn: { pick: 1, round: 1, playerId: bob.id },
      }),
    );
    const poolReq = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pool'));
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks'));
    tabButton(page, 'Board').click();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(panel(page).querySelector('h2')?.textContent).toBe('Board');
    });
    return { fixture, page, req, poolReq };
  }

  /** Tells the page the draft changed to `fields`, as a pick does, and answers its re-read of the picks. */
  async function changeTo(
    fields: DraftFixture,
    answer: (req: ReturnType<typeof http.expectOne>) => void,
  ) {
    updates.events.next({
      type: 'changed',
      draft: draft({ snapshot: completeSnapshot, ...drafting, ...fields, version: 1 }),
    });
    answer(await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks')));
    await flushQueueAndPlan();
  }

  it('says the picks are loading, not that there are none, until they arrive', async () => {
    const { fixture, page, req, poolReq } = await openBoardUnanswered();
    poolReq.flush([]);
    await expectLoadingAnimation(() => panel(page), 'Loading the picks…', 64);
    expect(panel(page).textContent).not.toContain('No picks yet');

    req.flush([]);
    await fixture.whenStable();
    expect(panel(page).textContent).not.toContain('Loading the picks…');
    expect(panel(page).textContent).toContain('No picks yet');
  });

  it('does not say there are no picks when they failed to load', async () => {
    const { fixture, page, req, poolReq } = await openBoardUnanswered();
    poolReq.flush([]);

    req.flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(panel(page).textContent).toContain("Couldn't load the picks.");
    expect(panel(page).textContent).not.toContain('No picks yet');
    expect(findBoard(page)).toBeNull();
  });

  it('says the picks are loading, not naming none of them, until the pool arrives too', async () => {
    const { fixture, page, req, poolReq } = await openBoardUnanswered();
    req.flush([picks[0]]);
    await expectLoadingAnimation(() => panel(page), 'Loading the picks…', 64);
    expect(findBoard(page)).toBeNull();

    poolReq.flush(cards);
    await fixture.whenStable();
    expect(panel(page).textContent).not.toContain('Loading the picks…');
    expect(boardRows(page)).toEqual([[`Round 1, ${FORWARD}`, 'Shock']]);
  });

  it('says the picks couldn’t be loaded when the pool failed to load', async () => {
    const { fixture, page, req, poolReq } = await openBoardUnanswered();
    req.flush([picks[0]]);

    poolReq.flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(panel(page).textContent).toContain("Couldn't load the picks.");
    expect(findBoard(page)).toBeNull();
  });

  it('keeps the picks it had when a re-read of them fails', async () => {
    const { fixture, page } = await openBoard(picks);

    await changeTo({}, (req) =>
      req.flush(null, { status: 503, statusText: 'Service Unavailable' }),
    );
    await fixture.whenStable();

    expect(panel(page).textContent).not.toContain("Couldn't load the picks.");
    expect(boardRows(page)).toEqual([
      [`Round 1, ${FORWARD}`, 'Shock', 'Lightning Bolt'],
      [`Round 2, ${BACK}`, '', 'Lava Spike'],
    ]);
  });

  it('switches between the Pool and Board tabs', async () => {
    const { fixture, page } = await openBoard(picks);

    expect(tabButton(page, 'Board').getAttribute('aria-selected')).toBe('true');
    expect(tabButton(page, 'Pool').getAttribute('aria-selected')).toBe('false');
    expect(panel(page).querySelector('h2')?.textContent).toBe('Board');

    tabButton(page, 'Pool').click();
    await fixture.whenStable();
    expect(panel(page).querySelector('h2')?.textContent).toBe('Pool');
  });

  it('heads a column for each seat, in seat order, naming its player, a bot and the viewer', async () => {
    const bot = { ...bob, id: 'bot:1', name: 'Bot 1', isBot: true };
    const { page } = await openBoard([], {
      players: [bot, alicePlayer, bob],
      turn: { pick: 1, round: 1, playerId: bot.id },
    });

    expect(boardColumns(page)).toEqual(['Bot 1, bot', 'Alice, you', 'Bob']);
  });

  it('marks no column as their own for a viewer who isn’t a player', async () => {
    const { page } = await openBoard(picks, {}, { user: carol });

    expect(boardColumns(page)).toEqual(['Bob', 'Alice']);
  });

  it('shows a row for each round begun, labelled with its way, leaving picks not yet made blank', async () => {
    const { page } = await openBoard(picks);

    expect(boardRows(page)).toEqual([
      [`Round 1, ${FORWARD}`, 'Shock', 'Lightning Bolt'],
      [`Round 2, ${BACK}`, '', 'Lava Spike'],
    ]);
  });

  it('shows a round of double turns as two rows, each seat’s double turn in its two cells', async () => {
    const names = ['shock', 'bolt', 'spike', 'helix', 'blast', 'chain'];
    const { page } = await openBoard(
      names.map((name, i) =>
        pickOf({
          pick: i + 1,
          poolCardId: `${name}-card`,
          playerId: [bob.id, alice.id, alice.id, alice.id, bob.id, bob.id][i],
        }),
      ),
      {
        picksPerPlayer: 5,
        doublePicks: 4,
        turn: { pick: 7, round: 3, playerId: bob.id, picksBeforeTurnPasses: 2 },
      },
    );

    expect(boardRows(page)).toEqual([
      [`Round 1, ${FORWARD}`, 'Shock', 'Lightning Bolt'],
      [`Round 2, ${BACK}, first pick of each double turn`, 'Fireblast', 'Lava Spike'],
      [`Round 2, ${BACK}, second pick of each double turn`, 'Chain Lightning', 'Lightning Helix'],
      [`Round 3, ${FORWARD}, first pick of each double turn`, '', ''],
      [`Round 3, ${FORWARD}, second pick of each double turn`, '', ''],
    ]);
  });

  it('shows every round once the draft is complete', async () => {
    const { page } = await openBoard(
      [...picks, pickOf({ pick: 4, playerId: bob.id, poolCardId: 'helix-card' })],
      { state: 'Complete', turn: undefined, picksPerPlayer: 2 },
    );

    expect(boardRows(page)).toEqual([
      [`Round 1, ${FORWARD}`, 'Shock', 'Lightning Bolt'],
      [`Round 2, ${BACK}`, 'Lightning Helix', 'Lava Spike'],
    ]);
  });

  it('keeps a pick by a player no longer among the players in its seat’s column', async () => {
    const { page } = await openBoard([{ ...picks[0]!, playerId: 'gone' }, picks[1]!]);

    expect(boardRows(page)).toEqual([
      [`Round 1, ${FORWARD}`, 'Shock', 'Lightning Bolt'],
      [`Round 2, ${BACK}`, '', ''],
    ]);
  });

  it('shows each pick as its card name with its mana cost, opening its Card preview, never a Card detail', async () => {
    const { page } = await openBoard(picks);

    const shock = cardName(boardCell(page, `Round 1, ${FORWARD}`, 'Bob'), 'Shock');
    expect(costBefore(shock)).toEqual(['one red mana']);

    tap(shock);
    expect(previewImage()?.getAttribute('src')).toBe(image('normal', 'shock-id'));
    expect(openDialog()).toBeNull();
  });

  it('shows each picked copy of a card as its own pick', async () => {
    const bolt = picks[1]!;
    const { page } = await openBoard([
      { ...bolt, pick: 1, poolCardId: 'bolt-1-card', playerId: bob.id },
      { ...bolt, pick: 2, poolCardId: 'bolt-2-card' },
      { ...bolt, pick: 3, poolCardId: 'bolt-3-card' },
    ]);

    expect(boardRows(page)).toEqual([
      [`Round 1, ${FORWARD}`, 'Lightning Bolt', 'Lightning Bolt'],
      [`Round 2, ${BACK}`, '', 'Lightning Bolt'],
    ]);
  });

  it('fills the grid with live picks', async () => {
    const { fixture, page } = await openBoard(picks);

    await changeTo({ turn: { pick: 5, round: 3, playerId: bob.id } }, (req) =>
      req.flush([...picks, pickOf({ pick: 4, playerId: bob.id, poolCardId: 'helix-card' })]),
    );
    await fixture.whenStable();

    expect(boardRows(page)).toEqual([
      [`Round 1, ${FORWARD}`, 'Shock', 'Lightning Bolt'],
      [`Round 2, ${BACK}`, 'Lightning Helix', 'Lava Spike'],
      [`Round 3, ${FORWARD}`, '', ''],
    ]);
  });

  describe('the latest pick', () => {
    it('is marked while the draft is drafting', async () => {
      const { page } = await openBoard(picks);

      expect(latestPicks(page)).toEqual(['Lava Spike']);
    });

    it('is marked while the draft is frozen', async () => {
      const { page } = await openBoard(picks, { state: 'Frozen' });

      expect(latestPicks(page)).toEqual(['Lava Spike']);
    });

    /** Opens the Board tab on a draft whose round 2 is double turns, with `count` picks made. */
    function openDoubleTurns(count: number, turn: DraftFixture['turn']) {
      const names = ['shock', 'bolt', 'spike', 'helix', 'blast', 'chain'];
      const pickers = [bob.id, alice.id, alice.id, alice.id, bob.id, bob.id];
      return openBoard(
        names
          .slice(0, count)
          .map((name, i) =>
            pickOf({ pick: i + 1, poolCardId: `${name}-card`, playerId: pickers[i] }),
          ),
        { picksPerPlayer: 5, doublePicks: 4, turn },
      );
    }

    it('marks both picks of the latest double turn', async () => {
      const { page } = await openDoubleTurns(6, {
        pick: 7,
        round: 3,
        playerId: bob.id,
        picksBeforeTurnPasses: 2,
      });

      expect(latestPicks(page)).toEqual(['Fireblast', 'Chain Lightning']);
    });

    it('marks the first pick of a double turn whose second is still to come', async () => {
      const { page } = await openDoubleTurns(5, {
        pick: 6,
        round: 2,
        playerId: bob.id,
        picksBeforeTurnPasses: 1,
      });

      expect(latestPicks(page)).toEqual(['Fireblast']);
    });

    it('marks only the latest pick after a cascade, not every pick in it', async () => {
      const { fixture, page } = await openBoard(picks);

      await changeTo({ turn: { pick: 6, round: 3, playerId: alice.id } }, (req) =>
        req.flush([
          ...picks,
          pickOf({ pick: 4, playerId: bob.id, poolCardId: 'helix-card' }),
          pickOf({ pick: 5, playerId: bob.id, poolCardId: 'blast-card' }),
        ]),
      );
      await fixture.whenStable();

      expect(latestPicks(page)).toEqual(['Fireblast']);
    });

    it('moves to the pick that is now the latest after an undo', async () => {
      const { fixture, page } = await openBoard(picks);

      await changeTo({ turn: { pick: 3, round: 2, playerId: alice.id } }, (req) =>
        req.flush(picks.slice(0, 2)),
      );
      await fixture.whenStable();

      expect(latestPicks(page)).toEqual(['Lightning Bolt']);
    });

    it('is not marked once the draft is complete', async () => {
      const { page } = await openBoard(
        [...picks, pickOf({ pick: 4, playerId: bob.id, poolCardId: 'helix-card' })],
        { state: 'Complete', turn: undefined, picksPerPlayer: 2 },
      );

      expect(latestPicks(page)).toEqual([]);
    });
  });

  it('no longer shows the pick log', async () => {
    const { page } = await openBoard(picks);

    expect(findNamedList(panel(page), 'Pick log')).toBeNull();
    expect(panel(page).textContent).not.toContain('Pick log');
  });

  it('says when nobody has picked yet', async () => {
    const { page } = await openBoard([], { turn: { pick: 1, round: 1, playerId: bob.id } });

    expect(panel(page).textContent).toContain('No picks yet.');
  });
});
