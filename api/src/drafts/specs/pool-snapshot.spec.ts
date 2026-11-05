import type { Server } from 'node:http';
import { Logger } from '@nestjs/common';
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
  readyDraft,
  copyIds,
  pool,
  post,
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

  it('leaves the basic lands out of the pool, as a plan adds them by count', async () => {
    scryfallAnswers({
      't:land': page('Plains', 'Snow-Covered Plains'),
      '(t:land) -in:arena': null,
      [snapshotQuery('t:land')]: page('Snow-Covered Plains'),
    });

    const created = await createDraft({
      name: 'Lands',
      poolQuery: 't:land',
    }).expect(201);

    await snapshotted(created.body.id);
    expect(scryfall.search).toHaveBeenCalledWith(
      '(t:land) -!"Plains" -!"Island" -!"Swamp" -!"Mountain" -!"Forest" -!"Wastes" game:arena unique:cards',
      1,
    );
  });

  it('takes each card’s MTGO printing for an MTGO draft', async () => {
    scryfallAnswers({
      'c:r': page('Shock'),
      '(c:r) -in:mtgo': null,
      [snapshotQuery('c:r', 'MTGO')]: page('Shock'),
    });

    const created = await createDraft({
      name: 'Red',
      poolQuery: 'c:r',
      platform: 'MTGO',
    }).expect(201);

    const draft = await snapshotted(created.body.id);
    expect(draft.snapshot).toEqual({ state: 'Complete', cards: 1, total: 1 });
    expect(scryfall.search).toHaveBeenCalledWith(
      snapshotQuery('c:r', 'MTGO'),
      1,
    );
    expect(scryfall.search).not.toHaveBeenCalledWith(
      snapshotQuery('c:r'),
      expect.anything(),
    );
  });

  it('names the platform when the pool query no longer matches any cards on it', async () => {
    scryfallAnswers({
      'c:r': page('Shock'),
      '(c:r) -in:mtgo': null,
      [snapshotQuery('c:r', 'MTGO')]: null,
    });

    const created = await createDraft({
      name: 'Red',
      poolQuery: 'c:r',
      platform: 'MTGO',
    }).expect(201);

    const draft = await snapshotted(created.body.id);
    expect(draft.snapshot.error).toBe(
      'The pool query no longer matches any cards on MTGO.',
    );
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

    const res = await pool(created.body.id).expect(200);
    expect(res.body[0]).toMatchObject({
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
    expect(res.body[0].images[0]).not.toHaveProperty('png');
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

    const res = await pool(created.body.id).expect(200);
    expect(res.body[0]).toMatchObject({
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

    const res = await pool(created.body.id).expect(200);
    expect(res.body[0]).toMatchObject({
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

  it('fails on a card with no oracle id rather than inventing one', async () => {
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

  it('still shows a failed snapshot stored without its error, as unexpected', async () => {
    allOnArena('c:r');
    const created = await createDraft({ name: 'Red', poolQuery: 'c:r' });
    await snapshotted(created.body.id);
    await app.get(PrismaService).draft.update({
      where: { id: created.body.id },
      data: { snapshotState: 'Failed', snapshotError: null },
    });

    expect(
      (await getDraft(created.body.id).expect(200)).body.snapshot,
    ).toMatchObject({
      state: 'Failed',
      error: 'Snapshotting the pool failed unexpectedly.',
    });
  });

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
    const retried = await post(created.body.id, 'snapshot').expect(202);

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
    await post(created.body.id, 'snapshot').expect(202);

    expect((await snapshotted(created.body.id)).snapshot).toEqual({
      state: 'Complete',
      cards: 1,
      total: 1,
    });
    const res = await pool(created.body.id).expect(200);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual([
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

  it('keeps each copy of a card as its own pool card', async () => {
    const id = await readyDraft([], 1, [
      'Lightning Bolt',
      'Shock',
      'Lightning Bolt',
      'Lightning Bolt',
    ]);

    const copies = await copyIds(id);

    expect(copies['Lightning Bolt']).toHaveLength(3);
    expect(new Set(copies['Lightning Bolt']).size).toBe(3);
    expect(copies['Shock']).toHaveLength(1);
    expect((await getDraft(id).expect(200)).body.snapshot).toEqual({
      state: 'Complete',
      cards: 4,
      total: 4,
    });
  });

  it('keeps the pool frozen once the snapshot is complete', async () => {
    allOnArena('t:dragon c:r');
    const created = await createDraft({
      name: 'Red dragons',
      poolQuery: 't:dragon c:r',
    }).expect(201);
    await snapshotted(created.body.id);

    const res = await post(created.body.id, 'snapshot').expect(409);

    expect(res.body).toEqual({
      error: 'pool-frozen',
      message: 'The pool is complete and can’t be changed.',
    });
    expect(scryfall.search).toHaveBeenCalledTimes(3);
  });

  it('lets an app admin retry, but not other guild members', async () => {
    const query = snapshotQuery('c:r');
    scryfallAnswers({
      'c:r': page('Shock'),
      '(c:r) -in:arena': null,
      [query]: new ScryfallUnavailableError(503),
    });
    const created = await createDraft({ name: 'Red', poolQuery: 'c:r' });
    await snapshotted(created.body.id);

    await post(created.body.id, 'snapshot', await signIn(bob)).expect(403);
    scryfallAnswers({ [query]: page('Shock') });
    await post(created.body.id, 'snapshot', await signIn(carol)).expect(202);

    expect((await snapshotted(created.body.id)).snapshot.state).toBe(
      'Complete',
    );
  });

  it('answers 404 for a draft that does not exist', async () => {
    await getDraft('no-such-draft').expect(404);
    await post('no-such-draft', 'snapshot').expect(404);
    await pool('no-such-draft').expect(404);
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

    const res = await pool(created.body.id).expect(200);
    expect(res.body).toEqual([
      {
        id: expect.any(String),
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

  it('lets a snapshot a request starts while the app shuts down finish first', async () => {
    const errors = vi.spyOn(Logger.prototype, 'error');
    const wait = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    let shuttingDown!: () => void;
    const shutdownBegun = new Promise<void>((resolve) => {
      shuttingDown = resolve;
    });
    // Shutdown closes the HTTP server once the destroy hooks have run.
    const server = app.getHttpServer() as Server;
    const close = server.close.bind(server);
    vi.spyOn(server, 'close').mockImplementation((callback) => {
      shuttingDown();
      return close(callback);
    });
    scryfall.search.mockImplementation(async (query) => {
      if (query === 'c:r') {
        // Holds the request until shutdown is under way.
        await shutdownBegun;
        return page('Shock', 'Lava Spike');
      }
      if (query === '(c:r) -in:arena') return null;
      if (query === snapshotQuery('c:r')) {
        // Still paging once the HTTP server has closed.
        await wait(300);
        return page('Shock', 'Lava Spike');
      }
      throw new Error(`Unexpected search: ${query}`);
    });

    // `then` sends the request now, rather than when it is awaited.
    const created = createDraft({ name: 'Red', poolQuery: 'c:r' }).then(
      (res) => res,
    );
    await vi.waitFor(() => expect(scryfall.search).toHaveBeenCalled());
    await app.close();

    const res = await created;
    expect(res.status).toBe(201);
    expect(errors).not.toHaveBeenCalled();
    await startApp();
    expect((await snapshotted(res.body.id)).snapshot).toEqual({
      state: 'Complete',
      cards: 2,
      total: 2,
    });
  });
});
