import { TestBed } from '@angular/core/testing';
import type {
  DecklistView,
  TrophyHallRowView,
  TrophyHallView,
  TrophyRankingEntryView,
} from 'contract';
import { alice, button, http, openApp, router, useApp } from '../specs-harness';
import {
  banner,
  expectLoadingAnimation,
  findNamedList,
  heading,
  items,
  link,
  loadingAnimation,
  poolCardOf,
  previewInList,
  text,
} from '../drafts/specs/harness';
import { headingsAt, listItems } from '../drafts/specs/outline-harness';
import { zenMountain } from '../drafts/specs/plan-tab-harness';

const bolt = poolCardOf('bolt', 'Lightning Bolt');
const shock = poolCardOf('shock', 'Shock');

/** A deck of `card` and 39 Mountains, the way `playerId` locked it at Start. */
const deckOf = (playerId: string, card = bolt): DecklistView => ({
  playerId,
  mainboard: [{ poolCardId: card.id, name: card.name, picked: true }],
  sideboard: [],
  basics: [{ land: 'Mountain', count: 39 }],
  preferredPrintings: {},
});

/** A row: the trophy `name` holds from the draft `draftId`, one of their `trophies`. */
const row = (
  draftId: string,
  playerId: string,
  name: string,
  trophies: number,
  card = bolt,
): TrophyHallRowView => ({
  playerId,
  name,
  trophies,
  draftId,
  draftName: `Draft ${draftId}`,
  completedAt: '2026-11-10T20:00:00.000Z',
  decklist: deckOf(playerId, card),
  cards: [card],
});

/** `name`'s entry in the trophy ranking: their `trophies`, at `rank`, shared or not. */
const ranked = (
  playerId: string,
  name: string,
  trophies: number,
  rank: number,
  shared = false,
): TrophyRankingEntryView => ({ playerId, name, trophies, place: { rank, shared } });

const HALL: TrophyHallView = {
  ranking: [
    ranked('alice', 'Alice', 2, 1),
    ranked('bob', 'Bob', 1, 2, true),
    ranked('carol', 'Carol', 1, 2, true),
    ranked('dave', 'Dave', 1, 2, true),
  ],
  groups: [
    {
      poolSource: {
        kind: 'cube',
        cube: {
          name: 'Vintage Cube',
          url: 'https://cubecobra.com/cube/overview/vintage',
        },
      },
      rows: [
        {
          ...row('d3', 'alice', 'Alice', 2),
          decklist: { ...deckOf('alice'), preferredPrintings: { Mountain: zenMountain } },
        },
        row('d1', 'bob', 'Bob', 1, shock),
      ],
    },
    {
      poolSource: { kind: 'pool-query', poolQuery: 'c:r t:instant' },
      rows: [row('d2', 'alice', 'Alice', 2), row('d2', 'carol', 'Carol', 1)],
    },
    {
      poolSource: {
        kind: 'set-list',
        setList: [
          {
            code: 'otj',
            name: 'Outlaws of Thunder Junction',
            sublists: [{ code: 'big', name: 'The Big Score' }],
          },
          { code: 'mkm', name: 'Murders at Karlov Manor', sublists: [] },
        ],
      },
      rows: [row('d0', 'dave', 'Dave', 1)],
    },
  ],
};

const CUBE = 'Trophies won with Vintage Cube';
const QUERY = 'Trophies won with c:r t:instant';
const SETS =
  'Trophies won with Outlaws of Thunder Junction (+ The Big Score), Murders at Karlov Manor';

describe('the Trophy Hall page', () => {
  useApp();

  /** Opens the Trophy Hall as Alice, its read answered by `hall`. */
  async function openTrophyHall(hall: TrophyHallView | 'fails' = HALL) {
    const opened = await openApp('/trophy-hall', alice);
    const req = http.expectOne('/api/trophy-hall');
    if (hall === 'fails') req.flush(null, { status: 500, statusText: 'Server Error' });
    else req.flush(hall);
    await opened.fixture.whenStable();
    return opened.page;
  }

  /** The page's main landmark: the top bar's user menu button is also named Alice. */
  const main = (page: HTMLElement) => page.querySelector<HTMLElement>('main')!;

  /** The row of the list named `list` at `index`. */
  const rowIn = (page: HTMLElement, list: string, index: number) =>
    listItems(main(page), list)[index];

  it('says so with the loading animation while the Trophy Hall loads', async () => {
    const { fixture, page } = await openApp('/trophy-hall', alice);
    const req = http.expectOne('/api/trophy-hall');
    await expectLoadingAnimation(() => page, 'Loading…', 288);

    req.flush(HALL);
    await fixture.whenStable();
    expect(loadingAnimation(page)).toBeNull();
  });

  it('is linked from the top bar as the Trophy Hall', async () => {
    const { fixture, page } = await openApp('/', alice);
    for (const req of http.match('/api/drafts')) req.flush([]);
    await fixture.whenStable();

    link(banner(page)!, 'Trophy Hall')!.click();
    (await vi.waitFor(() => http.expectOne('/api/trophy-hall'))).flush(HALL);
    await fixture.whenStable();

    await vi.waitFor(() => expect(router.url).toBe('/trophy-hall'));
    TestBed.tick();
    expect(heading(page, 'Trophy Hall')).toBeDefined();
  });

  it('is where the old leaderboard link goes', async () => {
    const { fixture, page } = await openApp('/leaderboard', alice);
    http.expectOne('/api/trophy-hall').flush(HALL);
    await fixture.whenStable();

    expect(router.url).toBe('/trophy-hall');
    expect(heading(page, 'Trophy Hall')).toBeDefined();
  });

  it('heads each group by its pool source, a cube linked to CubeCobra and a pool query to Scryfall', async () => {
    const page = await openTrophyHall();

    expect(headingsAt(main(page), 2)).toEqual([
      'Trophy ranking',
      'Vintage Cube',
      'c:r t:instant',
      'Outlaws of Thunder Junction (+ The Big Score), Murders at Karlov Manor',
    ]);
    expect(link(main(page), 'Vintage Cube')?.href).toBe(
      'https://cubecobra.com/cube/overview/vintage',
    );
    expect(link(main(page), 'c:r t:instant')?.href).toBe(
      'https://scryfall.com/search?q=c%3Ar%20t%3Ainstant',
    );
  });

  it('heads a set list group by its sets’ names, each with the sublists it includes, unlinked', async () => {
    const page = await openTrophyHall({
      ranking: [ranked('dave', 'Dave', 1, 1)],
      groups: [
        {
          poolSource: {
            kind: 'set-list',
            setList: [
              { code: 'mkm', name: 'Murders at Karlov Manor', sublists: [] },
              {
                code: 'otj',
                name: 'Outlaws of Thunder Junction',
                sublists: [
                  { code: 'big', name: 'The Big Score' },
                  { code: 'otp', name: 'Breaking News' },
                ],
              },
            ],
          },
          rows: [row('d0', 'dave', 'Dave', 1)],
        },
      ],
    });

    const title =
      'Murders at Karlov Manor, Outlaws of Thunder Junction (+ The Big Score, Breaking News)';
    expect(headingsAt(main(page), 2)).toEqual(['Trophy ranking', title]);
    expect(link(main(page), title)).toBeUndefined();
    expect(items(main(page), `Trophies won with ${title}`)).toEqual([
      '1 🏆 Dave View Deck View Tournament',
    ]);
  });

  it('shows each trophy as its holder’s trophy count and name', async () => {
    const page = await openTrophyHall();

    expect(items(main(page), CUBE)).toEqual([
      '2 🏆 Alice View Deck View Tournament',
      '1 🏆 Bob View Deck View Tournament',
    ]);
    expect(items(main(page), QUERY)).toEqual([
      '2 🏆 Alice View Deck View Tournament',
      '1 🏆 Carol View Deck View Tournament',
    ]);
    expect(items(main(page), SETS)).toEqual(['1 🏆 Dave View Deck View Tournament']);
  });

  it('expands a holder’s decklist under their row with View Deck, and collapses it again', async () => {
    const page = await openTrophyHall();
    const viewDeck = button(rowIn(page, CUBE, 0), 'View Deck');
    expect(viewDeck.getAttribute('aria-expanded')).toBe('false');
    expect(heading(main(page), 'Mainboard 40')).toBeUndefined();

    viewDeck.click();
    TestBed.tick();

    expect(viewDeck.getAttribute('aria-expanded')).toBe('true');
    const expanded = rowIn(page, CUBE, 0);
    expect(heading(expanded, 'Mainboard 40')).toBeDefined();
    expect(items(expanded, 'Alice’s mainboard')).toEqual(['1 Lightning Bolt', '39 Mountain']);
    expect(previewInList(expanded, 'Alice’s mainboard', 'Lightning Bolt')).toBe(
      bolt.images[0]!.normal,
    );
    expect(previewInList(expanded, 'Alice’s mainboard', 'Mountain')).toBe(
      zenMountain.images.normal,
    );
    expect(heading(rowIn(page, CUBE, 1), 'Mainboard 40')).toBeUndefined();

    viewDeck.click();
    TestBed.tick();

    expect(viewDeck.getAttribute('aria-expanded')).toBe('false');
    expect(heading(main(page), 'Mainboard 40')).toBeUndefined();
  });

  it('expands two decks of the same holder apart', async () => {
    const page = await openTrophyHall();

    button(rowIn(page, CUBE, 0), 'View Deck').click();
    button(rowIn(page, QUERY, 0), 'View Deck').click();
    TestBed.tick();

    for (const list of [CUBE, QUERY]) {
      expect(items(rowIn(page, list, 0), 'Alice’s mainboard')).toEqual([
        '1 Lightning Bolt',
        '39 Mountain',
      ]);
    }
    const ids = [...main(page).querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ranks the trophy holders by place, name and trophy count, shared places marked', async () => {
    const page = await openTrophyHall();

    expect(heading(main(page), 'Trophy ranking')).toBeDefined();

    expect(items(main(page), 'Trophy ranking')).toEqual([
      '1st Alice 2 🏆',
      '=2nd Bob 1 🏆',
      '=2nd Carol 1 🏆',
      '=2nd Dave 1 🏆',
    ]);
  });

  it('says so before anyone holds a trophy, with no trophy ranking', async () => {
    const page = await openTrophyHall({ ranking: [], groups: [] });

    expect(text(main(page))).toContain('Nobody has won a trophy yet.');
    expect(findNamedList(main(page), 'Trophy ranking')).toBeNull();
    expect(heading(main(page), 'Trophy ranking')).toBeUndefined();
  });

  it('says so when the Trophy Hall can’t be loaded', async () => {
    const page = await openTrophyHall('fails');

    expect(text(page)).toContain("Couldn't load the Trophy Hall. Try reloading the page.");
  });
});
