import { TestBed } from '@angular/core/testing';
import type { TrophyHallRowView, TrophyHallView, ViewerTournamentView } from 'contract';
import {
  alice,
  button,
  clickBackdrop,
  http,
  openApp,
  openDialog,
  pressEscape,
  serverError,
  table,
  tableRows,
  useApp,
} from '../specs-harness';
import { draft, heading, link, text } from '../drafts/specs/harness';
import { buttonNames, describedTerms, listItems } from '../drafts/specs/outline-harness';
import {
  bracket,
  carol,
  completed,
  entry,
  gridRows,
  roundLabels,
  singleEliminationFinal,
  standing,
  swissPlaying,
  threePlayers,
  withDrops,
} from '../drafts/specs/play-tab-harness';

/** Alice's trophy from draft-1, Friday cube, drafted from the Vintage Cube. */
const ROW: TrophyHallRowView = {
  playerId: alice.id,
  name: 'Alice',
  trophies: 1,
  draftId: 'draft-1',
  draftName: 'Friday cube',
  completedAt: '2026-11-10T12:00:00.000Z',
  decklist: {
    playerId: alice.id,
    mainboard: [],
    sideboard: [],
    basics: [],
    preferredPrintings: {},
  },
  cards: [],
};

const HALL: TrophyHallView = {
  ranking: [{ playerId: alice.id, name: 'Alice', trophies: 1, place: { rank: 1, shared: false } }],
  groups: [
    {
      poolSource: {
        kind: 'cube',
        cube: {
          name: 'Vintage Cube',
          url: 'https://cubecobra.com/cube/overview/vintage',
        },
      },
      rows: [ROW],
    },
  ],
};

const LIST = 'Trophies won with Vintage Cube';

/**
 * A complete Swiss tournament of Alice, Bob and Carol, capped at 3
 * tournament rounds, played over 2: Alice holds the trophy, and Carol and
 * Bob, who dropped, share second.
 */
const SWISS = completed(
  swissPlaying({
    swissRoundOption: 'CappedAt3',
    lastCompletedRound: 2,
    entries: [entry(alice.id), entry('bob', { dropped: true }), entry(carol.id)],
    standings: [
      standing(alice.id, 1, {
        matchPoints: 6,
        matches: { won: 2, lost: 0, drawn: 0 },
        gameWinPercent: 100,
        opponentsMatchWinPercent: 50,
        opponentsGameWinPercent: 45,
      }),
      standing(carol.id, 2, {
        shared: true,
        matchPoints: 3,
        matches: { won: 1, lost: 1, drawn: 0 },
        gameWinPercent: 50,
        opponentsMatchWinPercent: 60,
        opponentsGameWinPercent: 55,
      }),
      standing('bob', 2, {
        shared: true,
        matchPoints: 3,
        matches: { won: 1, lost: 1, drawn: 0 },
        gameWinPercent: 50,
        opponentsMatchWinPercent: 60,
        opponentsGameWinPercent: 55,
      }),
    ],
    trophyHolders: [alice.id],
    reopenRound: null,
    completeRoundGrants: null,
  }),
);

describe('the Tournament summary', () => {
  useApp();

  /** Opens the Trophy Hall as Alice and presses View Tournament on its row: returns the button. */
  async function openSummary(hall: TrophyHallView = HALL) {
    const { fixture, page } = await openApp('/trophy-hall', alice);
    http.expectOne('/api/trophy-hall').flush(hall);
    await fixture.whenStable();
    const viewTournament = button(
      listItems(page.querySelector('main')!, LIST)[0],
      'View Tournament',
    );
    viewTournament.focus();
    viewTournament.click();
    TestBed.tick();
    return { fixture, page, viewTournament };
  }

  /** Answers the summary's reads of draft-1 and its tournament with `tournament`. */
  async function flushReads(
    fixture: { whenStable(): Promise<unknown> },
    tournament: ViewerTournamentView,
  ) {
    http.expectOne('/api/drafts/draft-1').flush(draft({ ...threePlayers, state: 'Complete' }));
    http.expectOne('/api/drafts/draft-1/tournament').flush(tournament);
    await fixture.whenStable();
    return openDialog()!;
  }

  /** The summary's header as each of its terms with its value. */
  const details = (dialog: HTMLElement) => describedTerms(dialog, 'About the tournament');

  it('opens from View Tournament, named by its draft and headed by its pool source, completion date, format and player count, dropped players counted', async () => {
    const { fixture } = await openSummary();
    const dialog = await flushReads(fixture, SWISS);

    expect(text(document.getElementById(dialog.getAttribute('aria-labelledby')!))).toBe(
      'Friday cube',
    );
    expect(heading(dialog, 'Friday cube')).toBeDefined();
    expect(details(dialog)).toEqual([
      ['Pool source', 'Vintage Cube'],
      ['Completed', 'Nov 10, 2026'],
      ['Format', 'Swiss, capped at 3: 2 tournament rounds'],
      // Bob dropped, and still counts.
      ['Players', '3'],
    ]);
    expect(link(dialog, 'Vintage Cube')?.href).toBe('https://cubecobra.com/cube/overview/vintage');
  });

  it('shows the final standings with places, shared ones marked, the trophy holder and dropped players, and no bracket', async () => {
    const { fixture } = await openSummary();
    const dialog = await flushReads(fixture, SWISS);

    expect(tableRows(table(dialog, 'Standings')!)).toEqual([
      ['1st', 'Alice 🏆', '6', '2–0–0', '50%', '100%', '45%'],
      ['=2nd', 'Carol', '3', '1–1–0', '60%', '50%', '55%'],
      ['=2nd', 'Bob (dropped)', '3', '1–1–0', '60%', '50%', '55%'],
    ]);
    expect(bracket(dialog)).toBeNull();
    expect(roundLabels(dialog)).toEqual(['Tournament round 2', 'Tournament round 1']);
  });

  it('offers nothing that changes the tournament, even to a player and organizer', async () => {
    const { fixture } = await openSummary();
    const dialog = await flushReads(
      fixture,
      completed(swissPlaying({ reopenRound: null, completeRoundGrants: null })),
    );

    expect(buttonNames(dialog)).toEqual(['Close']);
  });

  it('shows a single elimination tournament’s bracket', async () => {
    const { fixture } = await openSummary();
    const dialog = await flushReads(
      fixture,
      completed({ ...singleEliminationFinal, trophyHolders: [carol.id] }),
    );

    expect(bracket(dialog)).not.toBeNull();
    expect(roundLabels(dialog)).toEqual(['Semifinal', 'Final']);
    expect(buttonNames(dialog)).toEqual(['Close']);
  });

  it('shows a round robin tournament’s results grid, with places, the trophy holder and dropped players', async () => {
    const { fixture } = await openSummary();
    const dialog = await flushReads(
      fixture,
      completed({
        ...withDrops(['bob']),
        standings: [
          standing(alice.id, 1, { shared: true }),
          standing(carol.id, 1, { shared: true }),
          standing('bob', 3),
        ],
        trophyHolders: [alice.id, carol.id],
      }),
    );

    expect(gridRows(dialog).map((row) => row.slice(0, 2))).toEqual([
      ['=1st', 'Alice 🏆'],
      ['=1st', 'Carol 🏆'],
      ['3rd', 'Bob (dropped)'],
    ]);
    expect(table(dialog, 'Standings')).toBeNull();
    expect(buttonNames(dialog)).toEqual(['Close']);
  });

  it('links to the draft’s Play and Lists tabs', async () => {
    const { fixture } = await openSummary();
    const dialog = await flushReads(fixture, SWISS);

    const target = (name: string) => {
      const { pathname, search } = new URL(link(dialog, name)!.href);
      return pathname + search;
    };
    expect(target('Play tab')).toBe('/drafts/draft-1?tab=play');
    expect(target('Lists tab')).toBe('/drafts/draft-1?tab=lists');
  });

  it('says so when the tournament can’t be loaded', async () => {
    const { fixture } = await openSummary();
    http.expectOne('/api/drafts/draft-1').flush(draft({ ...threePlayers, state: 'Complete' }));
    http.expectOne('/api/drafts/draft-1/tournament').flush(null, serverError);
    await fixture.whenStable();

    expect(text(openDialog())).toContain("Couldn't load the tournament. Try again in a moment.");
  });

  it.each([
    ['its Close button', () => button(openDialog()!, 'Close').click()],
    ['Escape', pressEscape],
    ['a click outside it', clickBackdrop],
  ])('gives focus back to View Tournament once closed by %s', async (_, close) => {
    const { fixture, viewTournament } = await openSummary();
    await flushReads(fixture, SWISS);

    close();
    TestBed.tick();

    expect(openDialog()).toBeNull();
    expect(document.activeElement).toBe(viewTournament);
  });
});
