import { Logger } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  ScryfallRejectedSearchError,
  ScryfallUnavailableError,
  type ScryfallSearchPage,
} from '../../scryfall/scryfall-client.js';
import { held, lateWorkDone } from '../../testing/deadlines.js';
import { createPastDeadline } from '../../testing/draft-creation-deadline.js';
import {
  alice,
  app,
  scryfall,
  useDraftsApp,
  scryfallAnswers,
  page,
  allOnArena,
  createDraft,
  listDrafts,
  getDraft,
  snapshotQuery,
  creationMatchQuery,
} from './harness.js';
import {
  aliceCookie,
  bob,
  completeDraft,
  inRegistration,
  signIn,
} from './tournament-harness.js';

useDraftsApp();

it('creates a draft in Lobby with the signed-in guild member as organizer', async () => {
  allOnArena('t:dragon c:r');

  const created = await createDraft({
    name: 'Red dragons',
    poolSource: { kind: 'pool-query', poolQuery: 't:dragon c:r' },
    picksPerPlayer: 30,
  }).expect(201);

  const draft = {
    id: expect.any(String),
    name: 'Red dragons',
    poolSource: { kind: 'pool-query', poolQuery: 't:dragon c:r' },
    picksPerPlayer: 30,
    doublePicks: 0,
    platform: 'Arena',
    state: 'Lobby',
    organizer: alice,
    snapshot: expect.any(Object),
    players: [],
    turn: null,
    webhook: null,
    tournament: null,
    version: 0,
  };
  expect(created.body).toEqual(draft);
  const list = await listDrafts().expect(200);
  expect(list.body).toEqual([
    { ...draft, id: created.body.id, tournamentBadge: null },
  ]);
});

it('creates a draft on the platform the organizer chose', async () => {
  scryfallAnswers({
    [creationMatchQuery('c:r')]: page('Shock'),
    '(c:r) -in:mtgo': null,
    [snapshotQuery('c:r', 'MTGO')]: page('Shock'),
  });

  const created = await createDraft({
    name: 'Red',
    platform: 'MTGO',
  }).expect(201);

  expect(created.body.platform).toBe('MTGO');
  const list = await listDrafts().expect(200);
  expect(list.body[0].platform).toBe('MTGO');
});

it('refuses a platform other than Arena or MTGO', async () => {
  const res = await createDraft({
    name: 'Red',
    platform: 'Paper',
  }).expect(400);

  expect(res.body).toEqual({
    error: 'invalid',
    message: 'Choose Arena or MTGO.',
  });
});

it('refuses an MTGO draft whose pool query has cards not on MTGO, naming MTGO', async () => {
  scryfallAnswers({
    [creationMatchQuery('f:legacy t:dragon')]: page(
      'Balefire Dragon',
      'Ancient Hellkite',
    ),
    '(f:legacy t:dragon) -in:mtgo': page('Balefire Dragon'),
  });

  const res = await createDraft({
    name: 'Dragons',
    poolSource: { kind: 'pool-query', poolQuery: 'f:legacy t:dragon' },
    platform: 'MTGO',
  }).expect(422);

  expect(res.body).toEqual({
    error: 'not-on-platform',
    message: '1 card in this pool query is not on MTGO.',
    cards: ['Balefire Dragon'],
    totalCards: 1,
  });
  await listDrafts().expect(200).expect([]);
});

it('refuses an Arena draft whose pool query has cards not on Arena, and lists them', async () => {
  scryfallAnswers({
    [creationMatchQuery('f:legacy t:dragon')]: page(
      'Balefire Dragon',
      'Ancient Hellkite',
    ),
    '(f:legacy t:dragon) -in:arena': page('Ancient Hellkite', 'Dream Pillager'),
  });

  const res = await createDraft({
    name: 'Dragons',
    poolSource: { kind: 'pool-query', poolQuery: 'f:legacy t:dragon' },
  }).expect(422);

  expect(res.body).toEqual({
    error: 'not-on-platform',
    message: '2 cards in this pool query are not on Arena.',
    cards: ['Ancient Hellkite', 'Dream Pillager'],
    totalCards: 2,
  });
  await listDrafts().expect(200).expect([]);
});

it('reports how many cards are not on Arena when there are more than one page', async () => {
  scryfallAnswers({
    [creationMatchQuery('c:r')]: page('Shock'),
    '(c:r) -in:arena': { ...page('Ancient Hellkite'), totalCards: 5000 },
  });

  const res = await createDraft({
    name: 'Red',
    poolSource: { kind: 'pool-query', poolQuery: 'c:r' },
  }).expect(422);

  expect(res.body).toMatchObject({
    message: '5000 cards in this pool query are not on Arena.',
    cards: ['Ancient Hellkite'],
    totalCards: 5000,
  });
});

it('gives each player 40 picks unless told otherwise', async () => {
  allOnArena('cube:arena');

  const res = await createDraft({
    name: 'Arena cube',
    poolSource: { kind: 'pool-query', poolQuery: 'cube:arena' },
  }).expect(201);

  expect(res.body.picksPerPlayer).toBe(40);
});

it('creates a draft with double picks for each player’s last picks', async () => {
  allOnArena('cube:arena');

  const res = await createDraft({
    name: 'Arena cube',
    poolSource: { kind: 'pool-query', poolQuery: 'cube:arena' },
    picksPerPlayer: 30,
    doublePicks: 20,
  }).expect(201);

  expect(res.body.doublePicks).toBe(20);
  expect(
    (await getDraft(res.body.id as string).expect(200)).body,
  ).toMatchObject({ picksPerPlayer: 30, doublePicks: 20 });
});

it('creates a draft without double picks when given 0', async () => {
  allOnArena('cube:arena');

  const res = await createDraft({
    name: 'Arena cube',
    poolSource: { kind: 'pool-query', poolQuery: 'cube:arena' },
    doublePicks: 0,
  }).expect(201);

  expect(res.body.doublePicks).toBe(0);
});

it('refuses a pool query that matches no cards', async () => {
  scryfallAnswers({ [creationMatchQuery('name:zzzzqqqq')]: null });

  const res = await createDraft({
    name: 'Nothing',
    poolSource: { kind: 'pool-query', poolQuery: 'name:zzzzqqqq' },
  }).expect(422);

  expect(res.body).toEqual({
    error: 'no-cards',
    message: 'This pool query matches no cards.',
  });
  await listDrafts().expect(200).expect([]);
});

it('refuses a pool query whose only matches are basic lands', async () => {
  const poolQuery = 't:basic -t:snow -!Wastes';
  scryfallAnswers({
    [poolQuery]: page('Plains', 'Island', 'Swamp', 'Mountain', 'Forest'),
    [creationMatchQuery(poolQuery)]: null,
    [`(${poolQuery}) -in:arena`]: null,
  });

  const res = await createDraft({
    name: 'Basics',
    poolSource: { kind: 'pool-query', poolQuery },
  }).expect(422);

  expect(res.body).toEqual({
    error: 'no-cards',
    message: 'This pool query matches no cards.',
  });
  await listDrafts().expect(200).expect([]);
});

it('passes on Scryfall’s explanation when it rejects the pool query', async () => {
  scryfallAnswers({
    [creationMatchQuery('c:r (((')]: new ScryfallRejectedSearchError(
      'Your search contains unclosed parentheses.',
      [],
    ),
  });

  const res = await createDraft({
    name: 'Oops',
    poolSource: { kind: 'pool-query', poolQuery: 'c:r (((' },
  }).expect(422);

  expect(res.body).toEqual({
    error: 'query-rejected',
    message: 'Your search contains unclosed parentheses.',
    warnings: [],
  });
});

it('refuses a pool query when Scryfall ignored part of it', async () => {
  const warning =
    'Invalid expression “foo:bar” was ignored. Unknown keyword “foo”.';
  scryfallAnswers({
    [creationMatchQuery('c:r foo:bar')]: {
      ...page('Shock'),
      warnings: [warning],
    },
  });

  const res = await createDraft({
    name: 'Typo',
    poolSource: { kind: 'pool-query', poolQuery: 'c:r foo:bar' },
  }).expect(422);

  expect(res.body).toEqual({
    error: 'query-rejected',
    message: 'Scryfall ignored part of this pool query.',
    warnings: [warning],
  });
  await listDrafts().expect(200).expect([]);
});

it('answers 502 when Scryfall cannot be reached', async () => {
  scryfallAnswers({
    [creationMatchQuery('c:r')]: new ScryfallUnavailableError(503),
  });

  const res = await createDraft({
    name: 'Red',
    poolSource: { kind: 'pool-query', poolQuery: 'c:r' },
  }).expect(502);

  expect(res.body).toMatchObject({ error: 'scryfall-unavailable' });
  await listDrafts().expect(200).expect([]);
});

it('answers 502 within the draft creation deadline when Scryfall doesn’t answer the check, and saves no draft once it does', async () => {
  allOnArena('c:r');
  const search = held<ScryfallSearchPage | null>();
  scryfall.search.mockReturnValueOnce(search.promise);

  const res = await createPastDeadline(
    () =>
      createDraft({
        name: 'Red',
        poolSource: { kind: 'pool-query', poolQuery: 'c:r' },
      }),
    scryfall.search,
  );

  expect(res.status).toBe(502);
  expect(res.body).toMatchObject({ error: 'scryfall-unavailable' });
  search.letGo(page('Balefire Dragon', 'Shivan Dragon'));
  await lateWorkDone();
  await listDrafts().expect(200).expect([]);
});

it.each([
  ['no name', {}, 'Give the draft a name.'],
  ['a blank name', { name: '  ' }, 'Give the draft a name.'],
  [
    'a name over 100 characters',
    { name: 'x'.repeat(101) },
    'Keep the name to 100 characters.',
  ],
  [
    'no pool source',
    { name: 'Red', poolSource: undefined },
    'Enter a pool query or a cube link, or choose sets.',
  ],
  [
    'a pool source that is only text',
    { name: 'Red', poolSource: 'c:r' },
    'Enter a pool query or a cube link, or choose sets.',
  ],
  [
    'a pool source of no kind',
    { name: 'Red', poolSource: { poolQuery: 'c:r' } },
    'Enter a pool query or a cube link, or choose sets.',
  ],
  [
    'a pool source of an unknown kind',
    { name: 'Red', poolSource: { kind: 'deck-list', poolQuery: 'c:r' } },
    'Enter a pool query or a cube link, or choose sets.',
  ],
  [
    'a pool query pool source with no pool query',
    { name: 'Red', poolSource: { kind: 'pool-query', cubeLink: 'pauper' } },
    'Enter a pool query or a cube link.',
  ],
  [
    'a blank pool query',
    { name: 'Red', poolSource: { kind: 'pool-query', poolQuery: ' \n' } },
    'Enter a pool query or a cube link.',
  ],
  [
    'a cube pool source with no cube link',
    { name: 'Red', poolSource: { kind: 'cube', poolQuery: 'c:r' } },
    'Enter a pool query or a cube link.',
  ],
  [
    'a pool query over 900 characters',
    {
      name: 'Red',
      poolSource: { kind: 'pool-query', poolQuery: 'c:r '.repeat(226) },
    },
    'Keep the pool query to 900 characters.',
  ],
  [
    'a cube link over 300 characters',
    {
      name: 'Red',
      poolSource: {
        kind: 'cube',
        cubeLink: `https://cubecobra.com/cube/list/${'x'.repeat(269)}`,
      },
    },
    'Keep the cube link to 300 characters.',
  ],
  [
    'zero picks per player',
    {
      name: 'Red',
      picksPerPlayer: 0,
    },
    'Picks per player must be a whole number from 1 to 100.',
  ],
  [
    'fractional picks per player',
    {
      name: 'Red',
      picksPerPlayer: 2.5,
    },
    'Picks per player must be a whole number from 1 to 100.',
  ],
  [
    'picks per player left blank',
    {
      name: 'Red',
      picksPerPlayer: null,
    },
    'Picks per player must be a whole number from 1 to 100.',
  ],
  [
    'picks per player as text',
    {
      name: 'Red',
      picksPerPlayer: '40',
    },
    'Picks per player must be a whole number from 1 to 100.',
  ],
  [
    'an odd number of double picks',
    { name: 'Red', picksPerPlayer: 30, doublePicks: 19 },
    'Double picks must be an even number from 2 to 30.',
  ],
  [
    'more double picks than picks per player',
    { name: 'Red', picksPerPlayer: 30, doublePicks: 32 },
    'Double picks must be an even number from 2 to 30.',
  ],
  [
    'negative double picks',
    { name: 'Red', doublePicks: -2 },
    'Double picks must be an even number from 2 to 40.',
  ],
  [
    'double picks as text',
    { name: 'Red', doublePicks: '20' },
    'Double picks must be an even number from 2 to 40.',
  ],
  [
    'double picks left blank',
    { name: 'Red', doublePicks: null },
    'Double picks must be an even number from 2 to 40.',
  ],
  [
    'double picks with 1 pick per player',
    { name: 'Red', picksPerPlayer: 1, doublePicks: 2 },
    'Double picks need at least 2 picks per player.',
  ],
  [
    'a webhook that is not an id',
    {
      name: 'Red',
      webhookId: 7,
    },
    'Choose a webhook from the list.',
  ],
])('rejects a draft with %s', async (_, body, message) => {
  const res = await createDraft(body).expect(400);

  expect(res.body).toEqual({ error: 'invalid', message });
  expect(scryfall.search).not.toHaveBeenCalled();
});

it('trims the name and pool query', async () => {
  allOnArena('t:dragon c:r');

  const res = await createDraft({
    name: '  Red dragons ',
    poolSource: { kind: 'pool-query', poolQuery: ' t:dragon c:r\n' },
  }).expect(201);

  expect(res.body).toMatchObject({
    name: 'Red dragons',
    poolSource: { kind: 'pool-query', poolQuery: 't:dragon c:r' },
  });
});

it('lists active and complete drafts, newest first', async () => {
  const prisma = app.get(PrismaService);
  const old = await prisma.draft.create({
    data: {
      name: 'Last month',
      poolSourceKind: 'PoolQuery',
      poolQuery: 'cube:arena',
      picksPerPlayer: 45,
      state: 'Complete',
      organizerId: alice.id,
      createdAt: new Date('2026-09-01T00:00:00Z'),
    },
  });
  allOnArena('t:dragon c:r');
  const created = await createDraft({
    name: 'Red dragons',
    poolSource: { kind: 'pool-query', poolQuery: 't:dragon c:r' },
  }).expect(201);

  const res = await listDrafts().expect(200);

  expect(res.body).toEqual([
    expect.objectContaining({ id: created.body.id, state: 'Lobby' }),
    expect.objectContaining({ id: old.id, state: 'Complete' }),
  ]);
  expect(res.body[1]).not.toHaveProperty('createdAt');
});

describe('a draft whose view cannot be built', () => {
  let bobCookie: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
  });

  // No pick leaves a draft Drafting once every pick is made, so only a future
  // bug could write this row: a Drafting draft with no one whose turn it is.
  async function idOfDraftingWithEveryPickMade(): Promise<string> {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await app
      .get(PrismaService)
      .draft.update({ where: { id }, data: { state: 'Drafting' } });
    return id;
  }

  it('is left off the draft list, which shows every other draft, newest first, with its tournament badge', async () => {
    const withTournament = await inRegistration([aliceCookie, bobCookie]);
    const bad = await idOfDraftingWithEveryPickMade();
    const withoutTournament = await completeDraft([aliceCookie, bobCookie]);
    const warn = vi.spyOn(Logger.prototype, 'warn');

    const res = await listDrafts().expect(200);

    expect(res.body).toEqual([
      expect.objectContaining({
        id: withoutTournament,
        state: 'Complete',
        tournamentBadge: null,
      }),
      expect.objectContaining({
        id: withTournament,
        state: 'Complete',
        tournamentBadge: {
          state: 'Registration',
          canJoin: false,
          trophyHolders: [],
        },
      }),
    ]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(bad),
      expect.objectContaining({ message: expect.stringContaining(bad) }),
    );
  });

  it('still fails to open on its own page', async () => {
    const bad = await idOfDraftingWithEveryPickMade();

    await getDraft(bad).expect(500);
  });
});

it('fails the whole draft list when the drafts cannot be read', async () => {
  vi.spyOn(app.get(PrismaService).draft, 'findMany').mockRejectedValueOnce(
    new Error('connection refused'),
  );

  await listDrafts().expect(500);
});

it('is only for signed-in users', async () => {
  await request(app.getHttpServer()).get('/api/drafts').expect(401);
  await request(app.getHttpServer())
    .post('/api/drafts')
    .send({ name: 'Red', poolSource: { kind: 'pool-query', poolQuery: 'c:r' } })
    .expect(401);
  expect(scryfall.search).not.toHaveBeenCalled();
});
