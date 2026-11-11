import type { Platform, TrophyHallView } from 'contract';
import request from 'supertest';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { landPrinting } from '../../testing/scryfall-printings.js';
import { OTJ_SETS, scryfallSet } from '../../testing/scryfall-sets.js';
import {
  alice,
  aliceCookie,
  app,
  bob,
  carol,
  cancelTournament,
  completeDraftWithBots,
  completeRound,
  completeTournament,
  completedBeforeDecklistsWereKept,
  drawnFrom,
  type Source,
  dropPlayer,
  fullDeck,
  movePlanned,
  playingTournament,
  poolCardIds,
  reportWin,
  scryfall,
  clearBasics,
  setUpTournament,
  signIn,
  singleElimination,
  startTournament,
  storePrintings,
  tournamentView,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

let bobCookie: string;
let carolCookie: string;

beforeEach(async () => {
  bobCookie = await signIn(bob);
  carolCookie = await signIn(carol);
  scryfall.sets.mockResolvedValue([
    ...OTJ_SETS,
    scryfallSet('mkm', { name: 'Murders at Karlov Manor' }),
  ]);
});

/** The Trophy Hall as whoever `cookie` signs in reads it. */
async function trophyHall(cookie = aliceCookie): Promise<TrophyHallView> {
  const res = await request(app.getHttpServer())
    .get('/api/trophy-hall')
    .set('Cookie', cookie)
    .expect(200);
  return res.body as TrophyHallView;
}

/** A complete round robin tournament of the cookies' users, which the first wins. */
async function wonBy(
  [winner, ...others]: { cookie: string; id: string }[],
  source?: Source,
  platform?: Platform,
) {
  const id = await playingTournament([
    winner.cookie,
    ...others.map((o) => o.cookie),
  ]);
  if (source) await drawnFrom(id, source, platform);
  for (const other of others) {
    await reportWin(id, [winner.id, other.id], [2, 0], winner.cookie);
  }
  for (const [i, first] of others.entries()) {
    for (const second of others.slice(i + 1)) {
      await reportWin(id, [first.id, second.id], [2, 1], first.cookie);
    }
  }
  await completeTournament(id).expect(200);
  expect((await tournamentView(id)).trophyHolders).toEqual([winner.id]);
  return id;
}

const A = () => ({ cookie: aliceCookie, id: alice.id });
const B = () => ({ cookie: bobCookie, id: bob.id });
const C = () => ({ cookie: carolCookie, id: carol.id });

/** Each group's rows as `<draft id> <name> <trophies>`. */
const rowsOf = (hall: TrophyHallView) =>
  hall.groups.map((group) =>
    group.rows.map((row) => `${row.draftId} ${row.name} ${row.trophies}`),
  );

/** The trophy ranking as each player's name, trophies and place. */
const rankingOf = (hall: TrophyHallView) =>
  hall.ranking.map(({ name, trophies, place }) => ({ name, trophies, place }));

describe('the Trophy Hall', () => {
  it('groups trophies by pool source, the group of the newest trophy first, each row newest first with its holder’s trophies', async () => {
    const t1 = await wonBy([A(), B()], { poolQuery: 'c:r' });
    const t2 = await wonBy([B(), A()], { cube: { id: 'vintage', name: 'V' } });
    const t3 = await wonBy([A(), B()], { poolQuery: 'c:r' });
    const t4 = await wonBy([C(), A()], { poolQuery: 'c:g' });

    expect(rowsOf(await trophyHall())).toEqual([
      [`${t4} Carol 1`],
      [`${t3} Alice 2`, `${t1} Alice 2`],
      [`${t2} Bob 1`],
    ]);
  });

  it('groups a cube by its id across a changed cube and platforms, headed by its name in the latest draft and linked to CubeCobra', async () => {
    const older = await wonBy(
      [A(), B()],
      { cube: { id: 'vintage', name: 'Vintage Cube' } },
      'MTGO',
    );
    const newer = await wonBy([B(), A()], {
      cube: { id: 'vintage', name: 'Vintage Cube (2026)' },
    });

    const hall = await trophyHall();

    expect(hall.groups).toHaveLength(1);
    expect(hall.groups[0].poolSource).toEqual({
      kind: 'cube',
      cube: {
        name: 'Vintage Cube (2026)',
        url: 'https://cubecobra.com/cube/overview/vintage',
      },
    });
    expect(hall.groups[0].rows.map((row) => row.draftId)).toEqual([
      newer,
      older,
    ]);
  });

  it('groups a pool query by its exact text only', async () => {
    await wonBy([A(), B()], { poolQuery: 'c:r' });
    await wonBy([A(), B()], { poolQuery: 'c:r' }, 'MTGO');
    await wonBy([A(), B()], { poolQuery: 'c:R' });

    const hall = await trophyHall();

    expect(hall.groups.map((group) => group.poolSource)).toEqual([
      { kind: 'pool-query', poolQuery: 'c:R' },
      { kind: 'pool-query', poolQuery: 'c:r' },
    ]);
    expect(rowsOf(hall).map((rows) => rows.length)).toEqual([1, 2]);
  });

  it('groups a set list whatever the order of its sets, headed by their names', async () => {
    await wonBy([A(), B()], {
      setList: [
        { code: 'mkm', sublists: [] },
        { code: 'otj', sublists: ['otp', 'big'] },
      ],
    });
    await wonBy([B(), A()], {
      setList: [
        { code: 'otj', sublists: ['big', 'otp'] },
        { code: 'mkm', sublists: [] },
      ],
    });
    await wonBy([A(), B()], { setList: [{ code: 'otj', sublists: [] }] });

    const hall = await trophyHall();

    expect(hall.groups.map((group) => group.poolSource)).toEqual([
      {
        kind: 'set-list',
        setList: [
          { code: 'otj', name: 'Outlaws of Thunder Junction', sublists: [] },
        ],
      },
      {
        kind: 'set-list',
        setList: [
          {
            code: 'otj',
            name: 'Outlaws of Thunder Junction',
            sublists: [
              { code: 'big', name: 'The Big Score' },
              { code: 'otp', name: 'Breaking News' },
            ],
          },
          { code: 'mkm', name: 'Murders at Karlov Manor', sublists: [] },
        ],
      },
    ]);
    expect(rowsOf(hall).map((rows) => rows.length)).toEqual([1, 2]);
  });

  it('names a set by its code when Scryfall can’t name it', async () => {
    scryfall.sets.mockRejectedValue(new Error('Scryfall is down'));
    await wonBy([A(), B()], { setList: [{ code: 'otj', sublists: ['big'] }] });

    const [group] = (await trophyHall()).groups;

    expect(group.poolSource).toEqual({
      kind: 'set-list',
      setList: [
        {
          code: 'otj',
          name: 'OTJ',
          sublists: [{ code: 'big', name: 'BIG' }],
        },
      ],
    });
  });

  it('gives every holder of a shared first place their own row', async () => {
    // Each beats one other 2–0: level on everything, so all three share first.
    const tied = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    await reportWin(tied, [alice.id, bob.id], [2, 0], aliceCookie);
    await reportWin(tied, [bob.id, carol.id], [2, 0], bobCookie);
    await reportWin(tied, [carol.id, alice.id], [2, 0], carolCookie);
    await completeTournament(tied).expect(200);

    expect(rowsOf(await trophyHall())).toEqual([
      [`${tied} Alice 1`, `${tied} Bob 1`, `${tied} Carol 1`],
    ]);
  });

  it('ranks every trophy holder by their trophies under their current name, players with as many sharing a place', async () => {
    await wonBy([A(), B()], { poolQuery: 'c:r' });
    await wonBy([B(), C()], { cube: { id: 'vintage', name: 'V' } });
    await wonBy([A(), C()], { poolQuery: 'c:g' });
    await wonBy([C(), B()], { poolQuery: 'c:r' });
    await wonBy([B(), A()], { poolQuery: 'c:u' });
    await app
      .get(PrismaService)
      .user.update({ where: { id: carol.id }, data: { name: 'Caroline' } });

    expect((await trophyHall()).ranking).toEqual([
      {
        playerId: bob.id,
        name: 'Bob',
        trophies: 2,
        place: { rank: 1, shared: true },
      },
      {
        playerId: alice.id,
        name: 'Alice',
        trophies: 2,
        place: { rank: 1, shared: true },
      },
      {
        playerId: carol.id,
        name: 'Caroline',
        trophies: 1,
        place: { rank: 3, shared: false },
      },
    ]);
  });

  it('leaves out a shared first place, and counts none of its trophies, when any holder’s decklist wasn’t kept', async () => {
    const counted = await wonBy([B(), A()]);
    // Alice and Bob share first, but only Alice's decklist was kept.
    const shared = await playingTournament([aliceCookie, bobCookie]);
    await completeTournament(shared).expect(200);
    expect((await tournamentView(shared)).trophyHolders).toHaveLength(2);
    await app.get(PrismaService).tournamentEntry.updateMany({
      where: { tournament: { draftId: shared }, player: { userId: bob.id } },
      data: { decklist: Prisma.DbNull },
    });

    const hall = await trophyHall();
    expect(rowsOf(hall)).toEqual([[`${counted} Bob 1`]]);
    expect(rankingOf(hall)).toEqual([
      { name: 'Bob', trophies: 1, place: { rank: 1, shared: false } },
    ]);
  });

  it('gives each row its holder’s deck as locked at Start, with its cards and preferred printings, even after they edit it', async () => {
    const island = landPrinting(
      'Island',
      '0a9e4a3b-1d47-4c3a-a3a7-6d0d5d3a4c1e',
      'khm',
      '395',
    );
    await storePrintings([island]);
    await request(app.getHttpServer())
      .put('/api/preferred-printings/Island')
      .set('Cookie', aliceCookie)
      .send({ scryfallId: island.id })
      .expect(200);
    const id = await wonBy([A(), B()]);
    const ids = await poolCardIds(id);
    // Alice's deck unlocks once the tournament completes, and she changes it.
    await movePlanned(id, ids.Shock, 'Sideboard', aliceCookie).expect(200);
    await clearBasics(id, aliceCookie).expect(200);

    const [row] = (await trophyHall()).groups[0].rows;

    expect(row.decklist).toEqual({
      playerId: alice.id,
      mainboard: [{ poolCardId: ids.Shock, name: 'Shock', picked: true }],
      sideboard: [],
      basics: [{ land: 'Mountain', board: 'Mainboard', count: 39 }],
      preferredPrintings: {
        Island: {
          scryfallId: island.id,
          set: 'khm',
          collectorNumber: '395',
          images: island.image_uris,
        },
      },
    });
    expect(row.cards).toEqual([
      expect.objectContaining({ id: ids.Shock, name: 'Shock' }),
    ]);
    expect(row).toMatchObject({
      playerId: alice.id,
      draftId: id,
      completedAt: (await tournamentView(id)).completedAt,
    });
  });

  it('gives each row its draft’s name', async () => {
    const id = await wonBy([A(), B()]);
    await app
      .get(PrismaService)
      .draft.update({ where: { id }, data: { name: 'Friday cube' } });

    expect((await trophyHall()).groups[0].rows[0].draftName).toBe(
      'Friday cube',
    );
  });

  it('names each holder by their current name', async () => {
    await wonBy([A(), B()]);
    await app
      .get(PrismaService)
      .user.update({ where: { id: alice.id }, data: { name: 'Alicia' } });

    expect(rowsOf(await trophyHall())[0][0]).toMatch(/ Alicia 1$/);
  });

  it('leaves out tournaments with no trophy holder, a bot played in, without kept decklists, cancelled or not complete, and counts none of their trophies', async () => {
    const counted = await wonBy([A(), B()]);
    // Nobody holds the trophy when both finalists drop.
    const noHolder = await playingTournament(
      [bobCookie, carolCookie],
      singleElimination,
    );
    await dropPlayer(noHolder, bob.id, aliceCookie).expect(200);
    await dropPlayer(noHolder, carol.id, aliceCookie).expect(200);
    await completeRound(noHolder).expect(200);
    // A bot played in it.
    const { id: withBot, botIds } = await completeDraftWithBots(
      [aliceCookie, bobCookie],
      1,
    );
    for (const cookie of [aliceCookie, bobCookie])
      await fullDeck(withBot, cookie);
    await setUpTournament(withBot).expect(201);
    await startTournament(withBot).expect(200);
    await reportWin(withBot, [alice.id, bob.id], [2, 0], aliceCookie);
    await reportWin(withBot, [alice.id, botIds[0]], [2, 0], aliceCookie);
    await reportWin(withBot, [bob.id, botIds[0]], [2, 0], bobCookie);
    await completeTournament(withBot).expect(200);
    expect((await tournamentView(withBot)).trophyHolders).toEqual([alice.id]);
    // Completed before every deck was kept (ADR 0017).
    const unkept = await wonBy([A(), B()]);
    await completedBeforeDecklistsWereKept(unkept);
    // Cancelled once won, and still playing.
    const cancelled = await playingTournament([aliceCookie, bobCookie]);
    await reportWin(cancelled, [alice.id, bob.id], [2, 0], aliceCookie);
    await cancelTournament(cancelled).expect(200);
    const playing = await playingTournament([aliceCookie, bobCookie]);
    await reportWin(playing, [alice.id, bob.id], [2, 0], aliceCookie);

    const hall = await trophyHall();
    expect(rowsOf(hall)).toEqual([[`${counted} Alice 1`]]);
    expect(rankingOf(hall)).toEqual([
      { name: 'Alice', trophies: 1, place: { rank: 1, shared: false } },
    ]);
  });

  it('has no groups and nobody ranked before anyone holds a trophy', async () => {
    expect(await trophyHall()).toEqual({ ranking: [], groups: [] });
  });

  it('is only for signed-in users', async () => {
    await request(app.getHttpServer()).get('/api/trophy-hall').expect(401);
  });

  it('has replaced the leaderboard', async () => {
    await request(app.getHttpServer())
      .get('/api/leaderboard')
      .set('Cookie', aliceCookie)
      .expect(404);
  });
});
