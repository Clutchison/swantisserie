import {
  CubeCobraUnavailableError,
  type Cube,
} from '../../cubecobra/cubecobra-client.js';
import {
  aliceCookie,
  bob,
  card,
  copyIds,
  createDraft,
  cubeCobra,
  getDraft,
  join,
  listDrafts,
  pool,
  post,
  scryfall,
  signIn,
  start,
  useDraftsApp,
} from './harness.js';

useDraftsApp();

/** A cube as CubeCobra answers with it, its mainboard listing each copy. */
function cube(name: string, ...mainboard: string[]): Cube {
  return {
    name,
    mainboard: mainboard.map((cardName) => ({
      oracleId: card(cardName).oracle_id!,
      name: cardName,
    })),
  };
}

/** CubeCobra answers each cube id with its cube, null for none, or an error. */
function cubesAre(cubes: Record<string, Cube | null | Error>) {
  cubeCobra.cube.mockImplementation(async (cubeId) => {
    if (!(cubeId in cubes)) throw new Error(`Unexpected cube: ${cubeId}`);
    const answer = cubes[cubeId];
    if (answer instanceof Error) throw answer;
    return answer;
  });
}

/**
 * Scryfall has a printing on every platform of each card named, in a set of
 * its own (`<game>-set`), and of no other card.
 */
function onPlatform(...names: string[]) {
  scryfall.printingsOn.mockImplementation(async (game, oracleIds) =>
    names
      .map((name) => card(name, { set: `${game}-set` }))
      .filter((printing) => oracleIds.includes(printing.oracle_id!)),
  );
}

const pauper = cube(
  'The Pauper Cube',
  'Lightning Bolt',
  'Deftblade Elite',
  'Lightning Bolt',
);

it('creates a draft from a cube id, showing the cube’s name and link in place of a pool query', async () => {
  cubesAre({ thepaupercube: pauper });
  onPlatform('Lightning Bolt', 'Deftblade Elite');

  const created = await createDraft({
    name: 'Pauper',
    poolSource: { kind: 'cube', cubeLink: 'thepaupercube' },
  }).expect(201);

  expect(created.body).toMatchObject({
    name: 'Pauper',
    poolSource: {
      kind: 'cube',
      cube: {
        name: 'The Pauper Cube',
        url: 'https://cubecobra.com/cube/overview/thepaupercube',
      },
    },
  });
  const list = await listDrafts().expect(200);
  expect(list.body[0].poolSource).toEqual(created.body.poolSource);
});

it('makes the pool from the cube’s mainboard, a pool card per copy, each in a printing on the platform', async () => {
  cubesAre({ thepaupercube: pauper });
  onPlatform('Lightning Bolt', 'Deftblade Elite');

  const created = await createDraft({
    name: 'Pauper',
    poolSource: { kind: 'cube', cubeLink: 'thepaupercube' },
  }).expect(201);

  const copies = await copyIds(created.body.id);
  expect(copies['Lightning Bolt']).toHaveLength(2);
  expect(copies['Deftblade Elite']).toHaveLength(1);
  const cards = (await pool(created.body.id).expect(200)).body as {
    set: string;
  }[];
  expect(cards.map((c) => c.set)).toEqual([
    'arena-set',
    'arena-set',
    'arena-set',
  ]);
  expect(scryfall.search).not.toHaveBeenCalled();
});

describe('cube links', () => {
  it.each([
    'thepaupercube',
    'https://cubecobra.com/cube/list/thepaupercube',
    'https://cubecobra.com/cube/overview/thepaupercube',
    'https://www.cubecobra.com/cube/playtest/thepaupercube',
    'cubecobra.com/cube/list/thepaupercube?view=spoiler#top',
    '  https://cubecobra.com/cube/list/thepaupercube/  ',
  ])('takes the cube id from %j', async (cubeLink) => {
    cubesAre({ thepaupercube: pauper });
    onPlatform('Lightning Bolt', 'Deftblade Elite');

    const created = await createDraft({
      name: 'Pauper',
      poolSource: { kind: 'cube', cubeLink },
    }).expect(201);

    expect(created.body.poolSource.cube.url).toBe(
      'https://cubecobra.com/cube/overview/thepaupercube',
    );
    expect(cubeCobra.cube).toHaveBeenCalledWith('thepaupercube');
  });

  it.each([
    'https://example.com/cube/list/thepaupercube',
    'https://cubecobra.com/user/view/someone',
    'https://cubecobra.com/cube/list',
    'https://cubecobra.com/cube/api/cubeJSON/thepaupercube',
    'ftp://cubecobra.com/cube/list/thepaupercube',
    'the pauper cube',
  ])('refuses %j as not a cube link, creating no draft', async (cubeLink) => {
    const res = await createDraft({
      name: 'Pauper',
      poolSource: { kind: 'cube', cubeLink },
    }).expect(422);

    expect(res.body).toEqual({
      error: 'not-a-cube-link',
      message: 'That isn’t a CubeCobra cube link.',
    });
    expect(cubeCobra.cube).not.toHaveBeenCalled();
    await listDrafts().expect(200).expect([]);
  });

  it('refuses a blank cube link', async () => {
    const res = await createDraft({
      name: 'Pauper',
      poolSource: { kind: 'cube', cubeLink: '  ' },
    }).expect(400);

    expect(res.body).toEqual({
      error: 'invalid',
      message: 'Enter a pool query or a cube link.',
    });
  });
});

describe('creating a draft from a cube', () => {
  it('refuses a cube CubeCobra has no public cube for, creating no draft', async () => {
    cubesAre({ secretcube: null });

    const res = await createDraft({
      name: 'Secret',
      poolSource: {
        kind: 'cube',
        cubeLink: 'https://cubecobra.com/cube/list/secretcube',
      },
    }).expect(422);

    expect(res.body).toEqual({
      error: 'cube-not-found',
      message: 'No public cube on CubeCobra has that id.',
    });
    await listDrafts().expect(200).expect([]);
  });

  it('says so when CubeCobra can’t be reached, creating no draft', async () => {
    cubesAre({
      thepaupercube: new CubeCobraUnavailableError('CubeCobra answered 503.'),
    });

    const res = await createDraft({
      name: 'Pauper',
      poolSource: { kind: 'cube', cubeLink: 'thepaupercube' },
    }).expect(502);

    expect(res.body).toEqual({
      error: 'cubecobra-unavailable',
      message: 'CubeCobra could not be reached. Try again in a moment.',
    });
    await listDrafts().expect(200).expect([]);
  });

  it('refuses a cube with no mainboard cards', async () => {
    cubesAre({ emptycube: cube('Empty') });

    const res = await createDraft({
      name: 'Empty',
      poolSource: { kind: 'cube', cubeLink: 'emptycube' },
    }).expect(422);

    expect(res.body).toEqual({
      error: 'no-cards',
      message: 'This cube has no mainboard cards.',
    });
    await listDrafts().expect(200).expect([]);
  });

  it('refuses a cube with cards not on the platform, listing each once', async () => {
    cubesAre({
      papercube: cube(
        'Paper Cube',
        'Lightning Bolt',
        'Ancient Hellkite',
        'Dream Pillager',
        'Ancient Hellkite',
      ),
    });
    onPlatform('Lightning Bolt');

    const res = await createDraft({
      name: 'Paper',
      poolSource: { kind: 'cube', cubeLink: 'papercube' },
      platform: 'MTGO',
    }).expect(422);

    expect(res.body).toEqual({
      error: 'not-on-platform',
      message: '2 cards in this cube are not on MTGO.',
      cards: ['Ancient Hellkite', 'Dream Pillager'],
      totalCards: 2,
    });
    expect(scryfall.printingsOn).toHaveBeenCalledWith(
      'mtgo',
      expect.arrayContaining(['ancient-hellkite-oracle']),
    );
    await listDrafts().expect(200).expect([]);
  });

  it('refuses a start when picks × players is more than the cube’s pool, counting every copy', async () => {
    cubesAre({ thepaupercube: pauper });
    onPlatform('Lightning Bolt', 'Deftblade Elite');
    const created = await createDraft({
      name: 'Pauper',
      poolSource: { kind: 'cube', cubeLink: 'thepaupercube' },
      picksPerPlayer: 2,
    }).expect(201);
    const { id } = created.body;
    for (const cookie of [aliceCookie, await signIn(bob)]) {
      await join(id, cookie).expect(201);
    }

    const refused = await start(id).expect(409);

    expect(refused.body).toEqual({
      error: 'pool-too-small',
      message: '2 players × 2 picks needs 4 cards, but the pool has 3.',
    });
  });
});

describe('the pool snapshot of a cube link', () => {
  it('is complete straight after creation, from one fetch of the cube and one lookup of its cards', async () => {
    cubesAre({ thepaupercube: pauper });
    onPlatform('Lightning Bolt', 'Deftblade Elite');

    const created = await createDraft({
      name: 'Pauper',
      poolSource: { kind: 'cube', cubeLink: 'thepaupercube' },
    }).expect(201);

    expect(created.body.snapshot).toEqual({
      state: 'Complete',
      cards: 3,
      total: 3,
    });
    expect((await getDraft(created.body.id).expect(200)).body.snapshot).toEqual(
      { state: 'Complete', cards: 3, total: 3 },
    );
    expect(cubeCobra.cube).toHaveBeenCalledTimes(1);
    expect(scryfall.printingsOn).toHaveBeenCalledTimes(1);
  });

  it('leaves the cube’s basic lands out of the pool, as a plan adds them by count', async () => {
    cubesAre({
      landcube: cube('Land Cube', 'Lightning Bolt', 'Mountain', 'Wastes'),
    });
    onPlatform('Lightning Bolt', 'Mountain', 'Wastes');

    const created = await createDraft({
      name: 'Lands',
      poolSource: { kind: 'cube', cubeLink: 'landcube' },
    }).expect(201);

    expect(created.body.snapshot).toEqual({
      state: 'Complete',
      cards: 1,
      total: 1,
    });
    expect(
      (await pool(created.body.id).expect(200)).body.map(
        (c: { name: string }) => c.name,
      ),
    ).toEqual(['Lightning Bolt']);
  });

  it('refuses a retry, keeping the pool as it was, because the pool is frozen', async () => {
    cubesAre({ thepaupercube: pauper });
    onPlatform('Lightning Bolt', 'Deftblade Elite', 'Shock');
    const created = await createDraft({
      name: 'Pauper',
      poolSource: { kind: 'cube', cubeLink: 'thepaupercube' },
    }).expect(201);
    const { id } = created.body;
    cubesAre({ thepaupercube: cube('The Pauper Cube', 'Shock') });

    await post(id, 'snapshot').expect(409);

    const cards = (await pool(id).expect(200)).body as { name: string }[];
    expect(cards.map((c) => c.name).sort()).toEqual([
      'Deftblade Elite',
      'Lightning Bolt',
      'Lightning Bolt',
    ]);
    expect(cubeCobra.cube).toHaveBeenCalledTimes(1);
    expect((await getDraft(id).expect(200)).body.snapshot.state).toBe(
      'Complete',
    );
  });
});
