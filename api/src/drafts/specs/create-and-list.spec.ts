import request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  ScryfallRejectedSearchError,
  ScryfallUnavailableError,
} from '../../scryfall/scryfall-client.js';
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
} from './harness.js';

useDraftsApp();

it('creates a draft in Lobby with the signed-in role-holder as organizer', async () => {
  allOnArena('t:dragon c:r');

  const created = await createDraft({
    name: 'Red dragons',
    poolQuery: 't:dragon c:r',
    picksPerPlayer: 30,
  }).expect(201);

  const draft = {
    id: expect.any(String),
    name: 'Red dragons',
    poolQuery: 't:dragon c:r',
    picksPerPlayer: 30,
    state: 'Lobby',
    organizer: alice,
    snapshot: expect.any(Object),
    players: [],
    turn: null,
    webhook: null,
    version: 0,
    createdAt: expect.any(String),
  };
  expect(created.body).toEqual(draft);
  const list = await listDrafts().expect(200);
  expect(list.body).toEqual([{ ...draft, id: created.body.id }]);
});

it('refuses a pool query with cards not on Arena, and lists them', async () => {
  scryfallAnswers({
    'f:legacy t:dragon': page('Balefire Dragon', 'Ancient Hellkite'),
    '(f:legacy t:dragon) -in:arena': page('Ancient Hellkite', 'Dream Pillager'),
  });

  const res = await createDraft({
    name: 'Dragons',
    poolQuery: 'f:legacy t:dragon',
  }).expect(422);

  expect(res.body).toEqual({
    error: 'not-on-arena',
    message: '2 cards in this pool query are not on Arena.',
    cards: ['Ancient Hellkite', 'Dream Pillager'],
    totalCards: 2,
  });
  await listDrafts().expect(200).expect([]);
});

it('reports how many cards are not on Arena when there are more than one page', async () => {
  scryfallAnswers({
    'c:r': page('Shock'),
    '(c:r) -in:arena': { ...page('Ancient Hellkite'), totalCards: 5000 },
  });

  const res = await createDraft({ name: 'Red', poolQuery: 'c:r' }).expect(422);

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
    poolQuery: 'cube:arena',
  }).expect(201);

  expect(res.body.picksPerPlayer).toBe(40);
});

it('refuses a pool query that matches no cards', async () => {
  scryfallAnswers({ 'name:zzzzqqqq': null });

  const res = await createDraft({
    name: 'Nothing',
    poolQuery: 'name:zzzzqqqq',
  }).expect(422);

  expect(res.body).toEqual({
    error: 'no-cards',
    message: 'This pool query matches no cards.',
  });
  await listDrafts().expect(200).expect([]);
});

it('passes on Scryfall’s explanation when it rejects the pool query', async () => {
  scryfallAnswers({
    'c:r (((': new ScryfallRejectedSearchError(
      'Your search contains unclosed parentheses.',
      [],
    ),
  });

  const res = await createDraft({
    name: 'Oops',
    poolQuery: 'c:r (((',
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
    'c:r foo:bar': { ...page('Shock'), warnings: [warning] },
  });

  const res = await createDraft({
    name: 'Typo',
    poolQuery: 'c:r foo:bar',
  }).expect(422);

  expect(res.body).toEqual({
    error: 'query-rejected',
    message: 'Scryfall ignored part of this pool query.',
    warnings: [warning],
  });
  await listDrafts().expect(200).expect([]);
});

it('answers 502 when Scryfall cannot be reached', async () => {
  scryfallAnswers({ 'c:r': new ScryfallUnavailableError(503) });

  const res = await createDraft({ name: 'Red', poolQuery: 'c:r' }).expect(502);

  expect(res.body).toMatchObject({ error: 'scryfall-unavailable' });
  await listDrafts().expect(200).expect([]);
});

it.each([
  ['no name', { poolQuery: 'c:r' }, 'Give the draft a name.'],
  ['a blank name', { name: '  ', poolQuery: 'c:r' }, 'Give the draft a name.'],
  [
    'a name over 100 characters',
    { name: 'x'.repeat(101), poolQuery: 'c:r' },
    'Keep the name to 100 characters.',
  ],
  ['no pool query', { name: 'Red' }, 'Enter a pool query.'],
  [
    'a pool query over 900 characters',
    { name: 'Red', poolQuery: 'c:r '.repeat(226) },
    'Keep the pool query to 900 characters.',
  ],
  [
    'zero picks per player',
    { name: 'Red', poolQuery: 'c:r', picksPerPlayer: 0 },
    'Picks per player must be a whole number from 1 to 100.',
  ],
  [
    'fractional picks per player',
    { name: 'Red', poolQuery: 'c:r', picksPerPlayer: 2.5 },
    'Picks per player must be a whole number from 1 to 100.',
  ],
  [
    'picks per player left blank',
    { name: 'Red', poolQuery: 'c:r', picksPerPlayer: null },
    'Picks per player must be a whole number from 1 to 100.',
  ],
  [
    'picks per player as text',
    { name: 'Red', poolQuery: 'c:r', picksPerPlayer: '40' },
    'Picks per player must be a whole number from 1 to 100.',
  ],
  [
    'a webhook that is not an id',
    { name: 'Red', poolQuery: 'c:r', webhookId: 7 },
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
    poolQuery: ' t:dragon c:r\n',
  }).expect(201);

  expect(res.body).toMatchObject({
    name: 'Red dragons',
    poolQuery: 't:dragon c:r',
  });
});

it('lists active and complete drafts, newest first', async () => {
  const prisma = app.get(PrismaService);
  const old = await prisma.draft.create({
    data: {
      name: 'Last month',
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
    poolQuery: 't:dragon c:r',
  }).expect(201);

  const res = await listDrafts().expect(200);

  expect(res.body).toEqual([
    expect.objectContaining({ id: created.body.id, state: 'Lobby' }),
    expect.objectContaining({
      id: old.id,
      state: 'Complete',
      createdAt: '2026-09-01T00:00:00.000Z',
    }),
  ]);
});

it('is only for signed-in users', async () => {
  await request(app.getHttpServer()).get('/api/drafts').expect(401);
  await request(app.getHttpServer())
    .post('/api/drafts')
    .send({ name: 'Red', poolQuery: 'c:r' })
    .expect(401);
  expect(scryfall.search).not.toHaveBeenCalled();
});
