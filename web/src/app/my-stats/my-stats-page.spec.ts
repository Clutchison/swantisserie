import { TestBed } from '@angular/core/testing';
import type { MyStatsView } from 'contract';
import {
  alice,
  button,
  http,
  openApp,
  router,
  table,
  tableColumns,
  tableRows,
  text,
  useApp,
} from '../specs-harness';
import { banner, expectLoadingAnimation, heading, loadingAnimation } from '../drafts/specs/harness';
import { link } from '../feedback/specs-harness';

const tally = (won: number, lost: number, drawn = 0) => ({ won, lost, drawn });

const STATS: MyStatsView = {
  tournamentsPlayed: 3,
  trophies: 2,
  trophyRate: 66.666,
  matches: tally(5, 2, 1),
  matchWinRate: 62.5,
  games: tally(11, 6, 1),
  gameWinRate: 61.11,
  bestFinish: { rank: 1, shared: true },
  results: [
    {
      draftId: 'd3',
      draftName: 'Cube night',
      poolSource: {
        kind: 'cube',
        cube: { name: 'Vintage Cube', url: 'https://cubecobra.com/cube/overview/vintage' },
      },
      completedAt: '2026-11-10T12:00:00.000Z',
      place: { rank: 3, shared: false },
      matches: tally(1, 2),
      trophy: false,
    },
    {
      draftId: 'd2',
      draftName: 'Bloomburrow',
      poolSource: { kind: 'set-list', setList: [{ code: 'blb', sublists: ['spg'] }] },
      completedAt: '2026-10-02T12:00:00.000Z',
      place: { rank: 1, shared: true },
      matches: tally(2, 0, 1),
      trophy: true,
    },
    {
      draftId: 'd1',
      draftName: 'Red',
      poolSource: { kind: 'pool-query', poolQuery: 'c:r' },
      completedAt: null,
      place: { rank: 1, shared: false },
      matches: tally(2, 0),
      trophy: true,
    },
  ],
};

const NO_TOURNAMENTS: MyStatsView = {
  tournamentsPlayed: 0,
  trophies: 0,
  trophyRate: null,
  matches: tally(0, 0),
  matchWinRate: null,
  games: tally(0, 0),
  gameWinRate: null,
  bestFinish: null,
  results: [],
};

describe('the My stats page', () => {
  useApp();

  /** Opens My stats as Alice, its read answered by `stats`. */
  async function openMyStats(stats: MyStatsView | 'fails' = STATS) {
    const opened = await openApp('/my-stats', alice);
    const req = http.expectOne('/api/my-stats');
    if (stats === 'fails') req.flush(null, { status: 500, statusText: 'Server Error' });
    else req.flush(stats);
    await opened.fixture.whenStable();
    return opened.page;
  }

  /** Each stat shown, as its name and its value. */
  function stats(page: HTMLElement) {
    const list = page.querySelector('dl[aria-label="My stats"]');
    return (
      list &&
      [...list.querySelectorAll('dt')].map((term) => [text(term), text(term.nextElementSibling)])
    );
  }

  /** The text of each row of the results table, its header row left out; null if there is none. */
  function results(page: HTMLElement) {
    const found = table(page, 'Results');
    return found && tableRows(found);
  }

  it('says so with the loading animation while the stats load', async () => {
    const { fixture, page } = await openApp('/my-stats', alice);
    const req = http.expectOne('/api/my-stats');
    await expectLoadingAnimation(() => page, 'Loading…', 288);

    req.flush(STATS);
    await fixture.whenStable();
    expect(loadingAnimation(page)).toBeNull();
  });

  it('is linked from the user menu', async () => {
    const { fixture, page } = await openApp('/', alice);
    for (const req of http.match('/api/drafts')) req.flush([]);
    await fixture.whenStable();

    button(banner(page)!, 'Alice').click();
    TestBed.tick();
    link(banner(page)!, 'My stats')!.click();
    (await vi.waitFor(() => http.expectOne('/api/my-stats'))).flush(STATS);
    await fixture.whenStable();

    await vi.waitFor(() => expect(router.url).toBe('/my-stats'));
    TestBed.tick();
    expect(heading(page, 'My stats')).toBeDefined();
  });

  it('sends a signed-out visitor to sign in', async () => {
    await openApp('/my-stats', (req) =>
      req.flush(null, { status: 401, statusText: 'Unauthorized' }),
    );

    await vi.waitFor(() => expect(router.url).toBe('/sign-in?returnTo=%2Fmy-stats'));
    http.expectNone('/api/my-stats');
  });

  it('shows tournaments played, trophies, the win rates with their records and the best finish', async () => {
    const page = await openMyStats();

    expect(stats(page)).toEqual([
      ['Tournaments played', '3'],
      ['Trophies', '2'],
      ['Trophy rate', '67%'],
      ['Match win rate', '63% (5–2–1)'],
      ['Game win rate', '61% (11–6–1)'],
      ['Best finish', '=1st'],
    ]);
    expect(text(page)).toContain(
      'Win rates and their records count played matches only: byes, forfeits and granted results are left out.',
    );
  });

  it('shows no win rate without a played match', async () => {
    const page = await openMyStats({
      ...NO_TOURNAMENTS,
      tournamentsPlayed: 1,
      trophyRate: 0,
      bestFinish: { rank: 2, shared: false },
      results: [
        {
          ...STATS.results[2],
          place: { rank: 2, shared: false },
          matches: tally(0, 0),
          trophy: false,
        },
      ],
    });

    expect(stats(page)).toEqual([
      ['Tournaments played', '1'],
      ['Trophies', '0'],
      ['Trophy rate', '0%'],
      ['Match win rate', '– (0–0–0)'],
      ['Game win rate', '– (0–0–0)'],
      ['Best finish', '2nd'],
    ]);
  });

  it('lists each result newest first with its date, draft, pool source, place, standings record and trophy', async () => {
    const page = await openMyStats();

    expect(tableColumns(table(page, 'Results')!)).toEqual([
      'Completed',
      'Draft',
      'Pool source',
      'Place',
      'Matches won, lost and drawn, as its standings count them',
      'Trophy',
    ]);
    expect(results(page)).toEqual([
      ['Nov 10, 2026', 'Cube night', 'Cube: Vintage Cube', '3rd', '1–2–0', ''],
      ['Oct 2, 2026', 'Bloomburrow', 'Sets: BLB (+ SPG)', '=1st', '2–0–1', '🏆'],
      ['–', 'Red', 'Pool query: c:r', '1st', '2–0–0', '🏆'],
    ]);
  });

  it('links each result to its draft, and a cube to CubeCobra', async () => {
    const page = await openMyStats();
    const found = table(page, 'Results')!;

    expect(link(found, 'Cube night')?.getAttribute('href')).toBe('/drafts/d3');
    expect(link(found, 'Red')?.getAttribute('href')).toBe('/drafts/d1');
    expect(link(found, 'Vintage Cube')?.getAttribute('href')).toBe(
      'https://cubecobra.com/cube/overview/vintage',
    );
  });

  it('says so for a player who has joined no complete tournament', async () => {
    const page = await openMyStats(NO_TOURNAMENTS);

    expect(text(page)).toContain('You haven’t joined a complete tournament yet.');
    expect(stats(page)).toBeNull();
    expect(results(page)).toBeNull();
  });

  it('says so when the stats can’t be loaded', async () => {
    const page = await openMyStats('fails');

    expect(text(page)).toContain("Couldn't load your stats. Try reloading the page.");
  });
});
