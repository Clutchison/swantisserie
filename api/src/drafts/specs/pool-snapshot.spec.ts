import request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  ScryfallRejectedSearchError,
  ScryfallUnavailableError,
} from '../../scryfall/scryfall-client.js';
import {
  alice,
  bob,
  carol,
  app,
  aliceCookie,
  scryfall,
  useDraftsApp,
  startApp,
  signIn,
  scryfallAnswers,
  card,
  page,
  snapshotQuery,
  allOnArena,
  createDraft,
  getDraft,
  snapshotted,
} from './harness.js';

useDraftsApp();

describe('pool snapshot', () => {
  it('pages through the pool after creation, and the draft shows progress then the pool size', async () => {
    const query = snapshotQuery('t:dragon c:r');
    scryfallAnswers({
      't:dragon c:r': page('Balefire Dragon'),
      '(t:dragon c:r) -in:arena': null,
      [query]: { ...page('Balefire Dragon'), totalCards: 2, hasMore: true },
      [`${query} page 2`]: { ...page('Shivan Dragon'), totalCards: 2 },
    });

    const created = await createDraft({
      name: 'Red dragons',
      poolQuery: 't:dragon c:r',
    }).expect(201);

    expect(created.body.snapshot).toEqual({
      state: 'Running',
      cards: 0,
      total: null,
    });
    const draft = await snapshotted(created.body.id);
    expect(draft.snapshot).toEqual({ state: 'Complete', cards: 2, total: 2 });
    expect(scryfall.search).toHaveBeenCalledWith(query, 1);
    expect(scryfall.search).toHaveBeenCalledWith(query, 2);
  });

  it('stores an image per face of a double-faced card, and its colors from the faces', async () => {
    const query = snapshotQuery('t:dragon');
    const face = (name: string, color: string) => ({
      name,
      colors: [color],
      image_uris: {
        small: `https://cards.scryfall.io/small/${name}.jpg`,
        normal: `https://cards.scryfall.io/normal/${name}.jpg`,
        large: `https://cards.scryfall.io/large/${name}.jpg`,
        png: `https://cards.scryfall.io/png/${name}.png`,
      },
    });
    scryfallAnswers({
      't:dragon': page('Balefire Dragon'),
      '(t:dragon) -in:arena': null,
      [query]: {
        ...page(),
        totalCards: 1,
        cards: [
          {
            ...card('Birgi // Harnfel'),
            colors: undefined,
            image_uris: undefined,
            card_faces: [face('birgi', 'R'), face('harnfel', 'R')],
          },
        ],
      },
    });

    const created = await createDraft({
      name: 'Dragons',
      poolQuery: 't:dragon',
    }).expect(201);
    await snapshotted(created.body.id);

    const pool = await request(app.getHttpServer())
      .get(`/api/drafts/${created.body.id}/pool`)
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(pool.body[0]).toMatchObject({
      name: 'Birgi // Harnfel',
      colors: ['R'],
      images: [
        {
          small: 'https://cards.scryfall.io/small/birgi.jpg',
          normal: 'https://cards.scryfall.io/normal/birgi.jpg',
          large: 'https://cards.scryfall.io/large/birgi.jpg',
        },
        {
          small: 'https://cards.scryfall.io/small/harnfel.jpg',
          normal: 'https://cards.scryfall.io/normal/harnfel.jpg',
          large: 'https://cards.scryfall.io/large/harnfel.jpg',
        },
      ],
    });
    expect(pool.body[0].images[0]).not.toHaveProperty('png');
  });

  it('stores each face’s text, cost, colors and stats, so a search can match either face', async () => {
    const query = snapshotQuery('t:giant');
    scryfallAnswers({
      't:giant': page('Bonecrusher Giant // Stomp'),
      '(t:giant) -in:arena': null,
      [query]: {
        ...page(),
        totalCards: 1,
        cards: [
          card('Bonecrusher Giant // Stomp', {
            type_line: 'Creature — Giant // Instant — Adventure',
            mana_cost: '{2}{R} // {1}{R}',
            layout: 'adventure',
            cmc: 3,
            power: '4',
            toughness: '3',
            rarity: 'rare',
            card_faces: [
              {
                name: 'Bonecrusher Giant',
                mana_cost: '{2}{R}',
                type_line: 'Creature — Giant',
                oracle_text:
                  'Whenever Bonecrusher Giant becomes the target of a spell, Bonecrusher Giant deals 2 damage to that spell’s controller.',
                power: '4',
                toughness: '3',
              },
              {
                name: 'Stomp',
                mana_cost: '{1}{R}',
                type_line: 'Instant — Adventure',
                oracle_text:
                  'Damage can’t be prevented this turn. Stomp deals 2 damage to any target.',
              },
            ],
          }),
        ],
      },
    });

    const created = await createDraft({
      name: 'Giants',
      poolQuery: 't:giant',
    }).expect(201);
    await snapshotted(created.body.id);

    const pool = await request(app.getHttpServer())
      .get(`/api/drafts/${created.body.id}/pool`)
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(pool.body[0]).toMatchObject({
      layout: 'adventure',
      manaCost: '{2}{R} // {1}{R}',
      oracleText: null,
      power: '4',
      toughness: '3',
      faces: [
        {
          name: 'Bonecrusher Giant',
          typeLine: 'Creature — Giant',
          oracleText:
            'Whenever Bonecrusher Giant becomes the target of a spell, Bonecrusher Giant deals 2 damage to that spell’s controller.',
          manaCost: '{2}{R}',
          colors: null,
          power: '4',
          toughness: '3',
          loyalty: null,
          defense: null,
        },
        {
          name: 'Stomp',
          typeLine: 'Instant — Adventure',
          oracleText:
            'Damage can’t be prevented this turn. Stomp deals 2 damage to any target.',
          manaCost: '{1}{R}',
          colors: null,
          power: null,
          toughness: null,
          loyalty: null,
          defense: null,
        },
      ],
    });
  });

  it('stores a battle’s defense on its face', async () => {
    const query = snapshotQuery('t:battle');
    scryfallAnswers({
      't:battle': page('Invasion of Tarkir // Defiant Thundermaw'),
      '(t:battle) -in:arena': null,
      [query]: {
        ...page(),
        totalCards: 1,
        cards: [
          card('Invasion of Tarkir // Defiant Thundermaw', {
            layout: 'transform',
            type_line: 'Battle — Siege // Creature — Dragon',
            card_faces: [
              {
                name: 'Invasion of Tarkir',
                mana_cost: '{1}{R}',
                type_line: 'Battle — Siege',
                colors: ['R'],
                defense: '5',
              },
              {
                name: 'Defiant Thundermaw',
                mana_cost: '',
                type_line: 'Creature — Dragon',
                colors: ['R'],
                power: '4',
                toughness: '4',
              },
            ],
          }),
        ],
      },
    });

    const created = await createDraft({
      name: 'Battles',
      poolQuery: 't:battle',
    }).expect(201);
    await snapshotted(created.body.id);

    const pool = await request(app.getHttpServer())
      .get(`/api/drafts/${created.body.id}/pool`)
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(pool.body[0]).toMatchObject({
      layout: 'transform',
      defense: null,
      faces: [
        { name: 'Invasion of Tarkir', defense: '5', power: null },
        { name: 'Defiant Thundermaw', defense: null, power: '4' },
      ],
    });
  });

  it('fails rather than completing when Scryfall runs out of pages early', async () => {
    const query = snapshotQuery('c:r');
    scryfallAnswers({
      'c:r': page('Shock'),
      '(c:r) -in:arena': null,
      [query]: { ...page('Shock'), totalCards: 200, hasMore: true },
      [`${query} page 2`]: null,
    });
    const created = await createDraft({ name: 'Red', poolQuery: 'c:r' });

    expect((await snapshotted(created.body.id)).snapshot).toEqual({
      state: 'Failed',
      cards: 1,
      total: 200,
      error: 'Scryfall stopped returning cards before the pool was complete.',
    });
  });

  it('fails on a card with no oracle id rather than inventing a pick identity', async () => {
    const query = snapshotQuery('c:r');
    scryfallAnswers({
      'c:r': page('Shock'),
      '(c:r) -in:arena': null,
      [query]: {
        ...page(),
        totalCards: 1,
        cards: [card('Shock', { oracle_id: undefined })],
      },
    });
    const created = await createDraft({ name: 'Red', poolQuery: 'c:r' });

    expect((await snapshotted(created.body.id)).snapshot).toMatchObject({
      state: 'Failed',
      error: 'Shock has no oracle id.',
    });
  });

  it('keeps unexpected errors’ details out of the organizer’s view', async () => {
    const query = snapshotQuery('c:r');
    scryfallAnswers({
      'c:r': page('Shock'),
      '(c:r) -in:arena': null,
      [query]: new TypeError('connect ECONNREFUSED 10.0.0.7:5432'),
    });
    const created = await createDraft({ name: 'Red', poolQuery: 'c:r' });

    expect((await snapshotted(created.body.id)).snapshot).toMatchObject({
      state: 'Failed',
      error: 'Snapshotting the pool failed unexpectedly.',
    });
  });

  function retry(id: string, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .post(`/api/drafts/${id}/snapshot`)
      .set('Cookie', cookie);
  }

  it('surfaces a failure on the draft, and the organizer can retry it', async () => {
    const query = snapshotQuery('t:dragon c:r');
    scryfallAnswers({
      't:dragon c:r': page('Balefire Dragon'),
      '(t:dragon c:r) -in:arena': null,
      [query]: new ScryfallUnavailableError(503),
    });
    const created = await createDraft({
      name: 'Red dragons',
      poolQuery: 't:dragon c:r',
    }).expect(201);
    expect((await snapshotted(created.body.id)).snapshot).toEqual({
      state: 'Failed',
      cards: 0,
      total: null,
      error: 'Scryfall could not be reached.',
    });

    scryfallAnswers({ [query]: page('Balefire Dragon', 'Shivan Dragon') });
    const retried = await retry(created.body.id).expect(202);

    expect(retried.body.snapshot).toEqual({
      state: 'Running',
      cards: 0,
      total: null,
    });
    expect((await snapshotted(created.body.id)).snapshot).toEqual({
      state: 'Complete',
      cards: 2,
      total: 2,
    });
  });

  it('starts a retried snapshot over, dropping the cards of the failed one', async () => {
    const query = snapshotQuery('t:dragon c:r');
    scryfallAnswers({
      't:dragon c:r': page('Balefire Dragon'),
      '(t:dragon c:r) -in:arena': null,
      [query]: { ...page('Balefire Dragon'), totalCards: 2, hasMore: true },
      [`${query} page 2`]: new ScryfallUnavailableError(503),
    });
    const created = await createDraft({
      name: 'Red dragons',
      poolQuery: 't:dragon c:r',
    }).expect(201);
    expect((await snapshotted(created.body.id)).snapshot).toMatchObject({
      state: 'Failed',
      cards: 1,
      total: 2,
    });

    scryfallAnswers({ [query]: page('Shivan Dragon') });
    await retry(created.body.id).expect(202);

    expect((await snapshotted(created.body.id)).snapshot).toEqual({
      state: 'Complete',
      cards: 1,
      total: 1,
    });
    const pool = await request(app.getHttpServer())
      .get(`/api/drafts/${created.body.id}/pool`)
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(pool.body.map((c: { name: string }) => c.name)).toEqual([
      'Shivan Dragon',
    ]);
  });

  it('explains a pool query Scryfall now rejects', async () => {
    const query = snapshotQuery('c:r');
    scryfallAnswers({
      'c:r': page('Shock'),
      '(c:r) -in:arena': null,
      [query]: new ScryfallRejectedSearchError('Too many terms.', []),
    });
    const created = await createDraft({ name: 'Red', poolQuery: 'c:r' });

    expect((await snapshotted(created.body.id)).snapshot).toMatchObject({
      state: 'Failed',
      error: 'Scryfall rejected the pool query: Too many terms.',
    });
  });

  it('keeps the pool frozen once the snapshot is complete', async () => {
    allOnArena('t:dragon c:r');
    const created = await createDraft({
      name: 'Red dragons',
      poolQuery: 't:dragon c:r',
    }).expect(201);
    await snapshotted(created.body.id);

    const res = await retry(created.body.id).expect(409);

    expect(res.body).toEqual({
      error: 'pool-frozen',
      message: 'The pool is complete and can’t be changed.',
    });
    expect(scryfall.search).toHaveBeenCalledTimes(3);
  });

  it('lets an app admin retry, but not other role-holders', async () => {
    const query = snapshotQuery('c:r');
    scryfallAnswers({
      'c:r': page('Shock'),
      '(c:r) -in:arena': null,
      [query]: new ScryfallUnavailableError(503),
    });
    const created = await createDraft({ name: 'Red', poolQuery: 'c:r' });
    await snapshotted(created.body.id);

    await retry(created.body.id, await signIn(bob)).expect(403);
    scryfallAnswers({ [query]: page('Shock') });
    await retry(created.body.id, await signIn(carol)).expect(202);

    expect((await snapshotted(created.body.id)).snapshot.state).toBe(
      'Complete',
    );
  });

  it('answers 404 for a draft that does not exist', async () => {
    await getDraft('no-such-draft').expect(404);
    await retry('no-such-draft').expect(404);
    await request(app.getHttpServer())
      .get('/api/drafts/no-such-draft/pool')
      .set('Cookie', aliceCookie)
      .expect(404);
  });

  it('resumes a snapshot a previous process left running', async () => {
    const query = snapshotQuery('c:r');
    scryfallAnswers({ [query]: page('Shock', 'Lightning Bolt') });
    const { id } = await app.get(PrismaService).draft.create({
      data: {
        name: 'Red',
        poolQuery: 'c:r',
        picksPerPlayer: 40,
        organizerId: alice.id,
        snapshotState: 'Running',
      },
    });
    await app.close();

    await startApp();

    expect((await snapshotted(id)).snapshot).toEqual({
      state: 'Complete',
      cards: 2,
      total: 2,
    });
  });

  describe('backfill', () => {
    /** A complete draft whose cards were snapshotted before the search fields were stored. */
    async function oldPool(names: string[]) {
      const { id } = await app.get(PrismaService).draft.create({
        data: {
          name: 'Red',
          poolQuery: 'c:r',
          picksPerPlayer: 40,
          organizerId: alice.id,
          snapshotState: 'Complete',
          poolTotal: names.length,
          pool: {
            create: names.map((name) => {
              const old = card(name);
              return {
                scryfallId: old.id,
                oracleId: old.oracle_id!,
                name,
                set: old.set,
                collectorNumber: old.collector_number,
                typeLine: old.type_line,
                colors: old.colors,
                manaValue: old.cmc,
                images: [{ ...old.image_uris! }],
              };
            }),
          },
        },
      });
      return id;
    }

    async function poolOf(id: string) {
      const res = await request(app.getHttpServer())
        .get(`/api/drafts/${id}/pool`)
        .set('Cookie', aliceCookie)
        .expect(200);
      return res.body as Record<string, unknown>[];
    }

    it('fills in the search fields of a pool snapshotted before they were stored, by print id, leaving the rest alone', async () => {
      const id = await oldPool(['Shock']);
      const before = await poolOf(id);
      expect(before[0]).toMatchObject({ rarity: null, faces: null });
      scryfall.printings.mockResolvedValue([
        card('Shock', {
          // A newer copy of the card: the backfill must not take these.
          name: 'Shock (renamed)',
          cmc: 2,
          mana_cost: '{R}',
          oracle_text: 'Shock deals 2 damage to any target.',
          type_line: 'Instant',
          rarity: 'common',
        }),
      ]);
      await app.close();

      await startApp();

      await vi.waitFor(async () => {
        expect((await poolOf(id))[0]).toEqual({
          ...before[0],
          manaCost: '{R}',
          oracleText: 'Shock deals 2 damage to any target.',
          colorIdentity: ['R'],
          keywords: [],
          rarity: 'common',
          layout: 'normal',
          power: null,
          toughness: null,
          loyalty: null,
          defense: null,
          faces: [],
        });
      });
      expect(scryfall.printings).toHaveBeenCalledExactlyOnceWith(['shock-id']);
    });

    it('asks Scryfall for at most 75 cards at a time', async () => {
      const names = Array.from({ length: 80 }, (_, i) => `Card ${i}`);
      const id = await oldPool(names);
      scryfall.printings.mockImplementation(async (ids) =>
        names
          .map((name) => card(name))
          .filter((found) => ids.includes(found.id)),
      );
      await app.close();

      await startApp();

      await vi.waitFor(async () => {
        const pool = await poolOf(id);
        expect(pool.filter((c) => c.rarity === 'rare')).toHaveLength(80);
      });
      expect(scryfall.printings.mock.calls.map(([ids]) => ids.length)).toEqual([
        75, 5,
      ]);
    });

    it('leaves a card Scryfall no longer has as it was', async () => {
      const id = await oldPool(['Shock', 'Lightning Bolt']);
      scryfall.printings.mockResolvedValue([card('Lightning Bolt')]);
      await app.close();

      await startApp();

      await vi.waitFor(async () => {
        const pool = await poolOf(id);
        expect(Object.fromEntries(pool.map((c) => [c.name, c.rarity]))).toEqual(
          { Shock: null, 'Lightning Bolt': 'rare' },
        );
      });
    });
  });

  it('stores each card’s identity, printing, images and the fields the pool search needs', async () => {
    const query = snapshotQuery('t:dragon c:r');
    scryfallAnswers({
      't:dragon c:r': page('Balefire Dragon'),
      '(t:dragon c:r) -in:arena': null,
      [query]: {
        ...page(),
        totalCards: 1,
        cards: [
          card('Balefire Dragon', {
            id: '9f0a1c6e-id',
            oracle_id: '9f0a1c6e-oracle',
            set: 'ima',
            collector_number: '119',
            type_line: 'Creature — Dragon',
            colors: ['R'],
            cmc: 7,
            mana_cost: '{5}{R}{R}',
            oracle_text:
              'Flying\nWhenever Balefire Dragon deals combat damage to a player, it deals that much damage to each creature that player controls.',
            color_identity: ['R'],
            keywords: ['Flying'],
            rarity: 'mythic',
            power: '6',
            toughness: '6',
          }),
        ],
      },
    });

    const created = await createDraft({
      name: 'Red dragons',
      poolQuery: 't:dragon c:r',
    }).expect(201);
    await snapshotted(created.body.id);

    const pool = await request(app.getHttpServer())
      .get(`/api/drafts/${created.body.id}/pool`)
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(pool.body).toEqual([
      {
        scryfallId: '9f0a1c6e-id',
        oracleId: '9f0a1c6e-oracle',
        name: 'Balefire Dragon',
        set: 'ima',
        collectorNumber: '119',
        typeLine: 'Creature — Dragon',
        colors: ['R'],
        manaValue: 7,
        manaCost: '{5}{R}{R}',
        oracleText:
          'Flying\nWhenever Balefire Dragon deals combat damage to a player, it deals that much damage to each creature that player controls.',
        colorIdentity: ['R'],
        keywords: ['Flying'],
        rarity: 'mythic',
        layout: 'normal',
        power: '6',
        toughness: '6',
        loyalty: null,
        defense: null,
        faces: [],
        images: [
          {
            small: 'https://cards.scryfall.io/small/balefire-dragon.jpg',
            normal: 'https://cards.scryfall.io/normal/balefire-dragon.jpg',
            large: 'https://cards.scryfall.io/large/balefire-dragon.jpg',
          },
        ],
      },
    ]);
  });
});
