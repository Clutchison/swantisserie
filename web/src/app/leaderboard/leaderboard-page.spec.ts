import { TestBed } from '@angular/core/testing';
import type { LeaderboardView } from 'contract';
import { alice, button, http, openApp, router, table, tableRows, useApp } from '../specs-harness';
import { banner, heading, text } from '../drafts/specs/harness';
import { link } from '../feedback/specs-harness';

const tally = (won: number, lost: number, drawn = 0) => ({ won, lost, drawn });

const BOARD: LeaderboardView = [
  {
    playerId: 'alice',
    name: 'Alice',
    trophies: 2,
    tournamentsPlayed: 3,
    matches: tally(5, 1),
    games: tally(10, 4, 1),
    opponents: [
      { playerId: 'bob', matches: tally(3, 1), games: tally(6, 3, 1) },
      { playerId: 'carol', matches: tally(2, 0), games: tally(4, 1) },
    ],
  },
  {
    playerId: 'bob',
    name: 'Bob',
    trophies: 1,
    tournamentsPlayed: 3,
    matches: tally(2, 3, 1),
    games: tally(5, 7, 1),
    opponents: [
      { playerId: 'alice', matches: tally(1, 3), games: tally(3, 6, 1) },
      { playerId: 'carol', matches: tally(1, 0, 1), games: tally(2, 1) },
    ],
  },
  {
    playerId: 'carol',
    name: 'Carol',
    trophies: 0,
    tournamentsPlayed: 2,
    matches: tally(0, 3, 1),
    games: tally(2, 6),
    opponents: [
      { playerId: 'alice', matches: tally(0, 2), games: tally(1, 4) },
      { playerId: 'bob', matches: tally(0, 1, 1), games: tally(1, 2) },
    ],
  },
];

describe('the leaderboard page', () => {
  useApp();

  /** Opens the leaderboard as Alice, its read answered by `board`. */
  async function openLeaderboard(board: LeaderboardView | 'fails' = BOARD) {
    const opened = await openApp('/leaderboard', alice);
    const req = http.expectOne('/api/leaderboard');
    if (board === 'fails') req.flush(null, { status: 500, statusText: 'Server Error' });
    else req.flush(board);
    await opened.fixture.whenStable();
    return opened.page;
  }

  /** The text of each row of the table named `name`, its header row left out; null if there is none. */
  function rows(page: HTMLElement, name: string) {
    const found = table(page, name);
    return found && tableRows(found);
  }

  it('is linked from the top bar', async () => {
    const { fixture, page } = await openApp('/', alice);
    for (const req of http.match('/api/drafts')) req.flush([]);
    await fixture.whenStable();

    link(banner(page)!, 'Leaderboard')!.click();
    (await vi.waitFor(() => http.expectOne('/api/leaderboard'))).flush(BOARD);
    await fixture.whenStable();

    await vi.waitFor(() => expect(router.url).toBe('/leaderboard'));
    TestBed.tick();
    expect(heading(page, 'Leaderboard')).toBeDefined();
  });

  it('ranks each player with their trophies, tournaments played and match and game records', async () => {
    const page = await openLeaderboard();

    expect(rows(page, 'Leaderboard')).toEqual([
      ['Alice', '2', '3', '5–1–0', '10–4–1'],
      ['Bob', '1', '3', '2–3–1', '5–7–1'],
      ['Carol', '0', '2', '0–3–1', '2–6–0'],
    ]);
    expect(rows(page, 'Head-to-head records of Bob')).toBeNull();
  });

  it('shows a selected player’s head-to-head record against each opponent', async () => {
    const page = await openLeaderboard();

    button(page, 'Bob').click();
    TestBed.tick();

    expect(button(page, 'Bob').getAttribute('aria-pressed')).toBe('true');
    expect(heading(page, 'Bob’s head-to-head records')).toBeDefined();
    expect(button(page, 'Alice').getAttribute('aria-pressed')).toBe('false');
    expect(rows(page, 'Head-to-head records of Bob')).toEqual([
      ['Alice', '1–3–0', '3–6–1'],
      ['Carol', '1–0–1', '2–1–0'],
    ]);

    button(page, 'Carol').click();
    TestBed.tick();

    expect(rows(page, 'Head-to-head records of Bob')).toBeNull();
    expect(rows(page, 'Head-to-head records of Carol')).toEqual([
      ['Alice', '0–2–0', '1–4–0'],
      ['Bob', '0–1–1', '1–2–0'],
    ]);
  });

  it('hides the head-to-head records when the selected player is selected again', async () => {
    const page = await openLeaderboard();

    button(page, 'Bob').click();
    TestBed.tick();
    button(page, 'Bob').click();
    TestBed.tick();

    expect(button(page, 'Bob').getAttribute('aria-pressed')).toBe('false');
    expect(rows(page, 'Head-to-head records of Bob')).toBeNull();
  });

  it('says so before anyone has played a match', async () => {
    const page = await openLeaderboard([]);

    expect(text(page)).toContain('Nobody has played a tournament match yet.');
    expect(rows(page, 'Leaderboard')).toBeNull();
  });

  it('says so when the leaderboard can’t be loaded', async () => {
    const page = await openLeaderboard('fails');

    expect(text(page)).toContain("Couldn't load the leaderboard. Try reloading the page.");
  });
});
