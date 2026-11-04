import { hangOnce } from '../testing/hanging-fetch.js';
import {
  CubeCobraUnavailableError,
  FetchCubeCobraClient,
} from './cubecobra-client.js';

const DEFTBLADE = '9a3e3a8f-7c19-4b52-a1b4-08eb09f6127a';
const BOLT = '4457ed35-7c10-48c8-9776-456485fdf070';
const SHOCK = 'fd1d5ded-d1b4-4b9f-be72-c8a2e1b4b6c4';

describe('FetchCubeCobraClient', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  let cubeCobra: FetchCubeCobraClient;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetch);
    cubeCobra = new FetchCubeCobraClient();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respond(status: number, body: unknown) {
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  /** A cube card as CubeCobra lists it, trimmed to the fields we read and a few we don't. */
  const listed = (name: string, oracleId: string) => ({
    cardID: `${oracleId}-print`,
    status: 'Owned',
    details: {
      oracle_id: oracleId,
      scryfall_id: `${oracleId}-print`,
      name,
      set: 'clb',
      games: ['paper', 'mtgo'],
    },
  });

  it('fetches the cube’s JSON by id', async () => {
    respond(200, {
      name: 'The Pauper Cube',
      cards: { mainboard: [], maybeboard: [] },
    });

    await cubeCobra.cube('thepaupercube');

    const [url] = fetch.mock.calls[0];
    expect(url).toBe('https://cubecobra.com/cube/api/cubeJSON/thepaupercube');
  });

  it('returns the cube’s name and its mainboard cards, copies included, leaving out the maybeboard', async () => {
    respond(200, {
      name: 'The Pauper Cube',
      shortId: 'thepaupercube',
      cards: {
        mainboard: [
          listed('Deftblade Elite', DEFTBLADE),
          listed('Lightning Bolt', BOLT),
          listed('Lightning Bolt', BOLT),
        ],
        maybeboard: [listed('Shock', SHOCK)],
      },
    });

    expect(await cubeCobra.cube('thepaupercube')).toEqual({
      name: 'The Pauper Cube',
      mainboard: [
        { oracleId: DEFTBLADE, name: 'Deftblade Elite' },
        { oracleId: BOLT, name: 'Lightning Bolt' },
        { oracleId: BOLT, name: 'Lightning Bolt' },
      ],
    });
  });

  it('returns null for a cube CubeCobra doesn’t have', async () => {
    respond(404, { message: 'Cube not found' });

    expect(await cubeCobra.cube('no-such-cube')).toBeNull();
  });

  it('throws CubeCobraUnavailableError when CubeCobra fails', async () => {
    respond(500, { message: 'Internal error' });

    await expect(cubeCobra.cube('thepaupercube')).rejects.toBeInstanceOf(
      CubeCobraUnavailableError,
    );
  });

  it('throws CubeCobraUnavailableError when CubeCobra can’t be reached', async () => {
    fetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(cubeCobra.cube('thepaupercube')).rejects.toBeInstanceOf(
      CubeCobraUnavailableError,
    );
  });

  it('gives up with CubeCobraUnavailableError after 20 seconds without an answer', async () => {
    vi.useFakeTimers();
    try {
      hangOnce(fetch);

      const outcome = cubeCobra
        .cube('thepaupercube')
        .catch((err: unknown) => err);
      await vi.advanceTimersByTimeAsync(19_999);
      expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      expect(await outcome).toBeInstanceOf(CubeCobraUnavailableError);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['isn’t JSON', 'Not JSON'],
    ['has no cards', { name: 'The Pauper Cube' }],
    ['has no name', { cards: { mainboard: [] } }],
    ['has no mainboard', { name: 'The Pauper Cube', cards: {} }],
    [
      'has a card with no oracle id',
      {
        name: 'The Pauper Cube',
        cards: { mainboard: [{ details: { name: 'Shock' } }] },
      },
    ],
    [
      'has a card whose oracle id isn’t one, which Scryfall would refuse',
      {
        name: 'The Pauper Cube',
        cards: {
          mainboard: [{ details: { oracle_id: 'x) or (c:r', name: 'Shock' } }],
        },
      },
    ],
    [
      'has a card with no details',
      { name: 'The Pauper Cube', cards: { mainboard: [{ cardID: 'x' }] } },
    ],
  ])(
    'throws CubeCobraUnavailableError for an answer that %s, rather than crashing',
    async (_, body) => {
      if (typeof body === 'string') {
        fetch.mockResolvedValueOnce(new Response(body, { status: 200 }));
      } else {
        respond(200, body);
      }

      await expect(cubeCobra.cube('thepaupercube')).rejects.toBeInstanceOf(
        CubeCobraUnavailableError,
      );
    },
  );
});
