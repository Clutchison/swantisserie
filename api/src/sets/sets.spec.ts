import type { Platform, SetCatalogView } from 'contract';
import request from 'supertest';
import { ScryfallUnavailableError } from '../scryfall/scryfall-client.js';
import {
  aliceCookie,
  app,
  scryfall,
  scryfallAnswers,
  useDraftsApp,
} from '../drafts/specs/harness.js';
import {
  countAnswers,
  countQuery,
  OTJ_SETS,
  scryfallSet,
} from '../testing/scryfall-sets.js';

useDraftsApp();

function setsRequest(platform: string, cookie = aliceCookie) {
  return request(app.getHttpServer())
    .get('/api/sets')
    .query({ platform })
    .set('Cookie', cookie);
}

/** The set list picker's sets on `platform`, once every set is counted. */
function counted(platform: Platform = 'Arena'): Promise<SetCatalogView> {
  return vi.waitFor(async () => {
    const res = await setsRequest(platform).expect(200);
    expect(res.body.counting).toBe(false);
    return res.body as SetCatalogView;
  });
}

const OTJ_COUNTS = {
  otj: 276,
  big: 30,
  otp: 65,
  yotj: 30,
  otc: 0,
};

it('offers each main set with its cards on the platform counted, newest first, and its sublists', async () => {
  scryfall.sets.mockResolvedValue([
    scryfallSet('dmu', { name: 'Dominaria United', releasedAt: '2022-09-09' }),
    ...OTJ_SETS,
  ]);
  scryfallAnswers({ ...countAnswers({ ...OTJ_COUNTS, dmu: 281 }) });

  expect(await counted()).toEqual({
    sets: [
      {
        code: 'otj',
        name: 'Outlaws of Thunder Junction',
        releasedAt: '2024-04-19',
        cards: 276,
        // No commander decks: none of their cards are on Arena. Never the
        // tokens, promos or art series.
        sublists: [
          {
            code: 'big',
            name: 'The Big Score',
            cards: 30,
            includedByDefault: true,
          },
          {
            code: 'otp',
            name: 'Breaking News',
            cards: 65,
            includedByDefault: true,
          },
          {
            code: 'yotj',
            name: 'Alchemy: Thunder Junction',
            cards: 30,
            includedByDefault: false,
          },
        ],
      },
      {
        code: 'dmu',
        name: 'Dominaria United',
        releasedAt: '2022-09-09',
        cards: 281,
        sublists: [],
      },
    ],
    counting: false,
  });
  // Tokens, promos and art series are never counted.
  for (const code of ['totj', 'potj', 'aotj']) {
    expect(scryfall.search).not.toHaveBeenCalledWith(countQuery(code), 1);
  }
});

it('offers only main sets: core, masters and draft innovation sets too, but no others', async () => {
  scryfall.sets.mockResolvedValue([
    scryfallSet('m21', { setType: 'core' }),
    scryfallSet('2xm', { setType: 'masters' }),
    scryfallSet('mb2', { setType: 'draft_innovation' }),
    scryfallSet('spg', { setType: 'masterpiece' }),
    scryfallSet('unf', { setType: 'funny' }),
    // A main set's type, but it comes with another set.
    scryfallSet('slx', { parentSetCode: 'sld' }),
  ]);
  scryfallAnswers({
    ...countAnswers({ m21: 1, '2xm': 1, mb2: 1 }),
  });

  const { sets } = await counted();

  expect(sets.map((set) => set.code)).toEqual(['m21', '2xm', 'mb2']);
});

it('leaves out a main set with no cards on the platform', async () => {
  scryfall.sets.mockResolvedValue([scryfallSet('mir'), scryfallSet('lea')]);
  scryfallAnswers({ ...countAnswers({ mir: 20, lea: 0 }) });

  const { sets } = await counted();

  expect(sets.map((set) => set.code)).toEqual(['mir']);
});

it('counts the cards on MTGO for an MTGO draft', async () => {
  scryfall.sets.mockResolvedValue([scryfallSet('mir')]);
  scryfallAnswers({ ...countAnswers({ mir: 335 }, 'MTGO') });

  const { sets } = await counted('MTGO');

  expect(sets).toMatchObject([{ code: 'mir', cards: 335 }]);
});

it('says it is still counting until every set is counted, offering those counted so far', async () => {
  scryfall.sets.mockResolvedValue([
    scryfallSet('otj', { releasedAt: '2024-04-19' }),
    scryfallSet('dmu', { releasedAt: '2022-09-09' }),
  ]);
  let countDmu!: () => void;
  const dmuCounted = new Promise<void>((resolve) => (countDmu = resolve));
  scryfall.search.mockImplementation(async (query) => {
    if (query === countQuery('dmu')) await dmuCounted;
    return { totalCards: 10, hasMore: false, cards: [], warnings: [] };
  });

  const first = await setsRequest('Arena').expect(200);
  expect(first.body).toEqual({ sets: [], counting: true });
  await vi.waitFor(() =>
    expect(scryfall.search).toHaveBeenCalledWith(countQuery('dmu'), 1),
  );
  const partway = await setsRequest('Arena').expect(200);
  expect(partway.body).toMatchObject({
    sets: [{ code: 'otj' }],
    counting: true,
  });

  countDmu();
  const { sets } = await counted();
  expect(sets.map((set) => set.code)).toEqual(['otj', 'dmu']);
});

it('remembers the counts, so asking again searches no more', async () => {
  scryfall.sets.mockResolvedValue(OTJ_SETS);
  scryfallAnswers(countAnswers(OTJ_COUNTS));
  const firstAnswer = await counted();
  const searches = scryfall.search.mock.calls.length;

  expect(await counted()).toEqual(firstAnswer);
  expect(scryfall.search).toHaveBeenCalledTimes(searches);
  expect(scryfall.sets).toHaveBeenCalledTimes(1);
});

it('counts a set again once its count is a week old', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    scryfall.sets.mockResolvedValue([
      scryfallSet('mir', { releasedAt: '1996-10-08' }),
    ]);
    scryfallAnswers(countAnswers({ mir: 20 }));
    await counted();

    vi.setSystemTime(new Date('2026-01-07T12:00:00Z'));
    scryfallAnswers(countAnswers({ mir: 21 }));
    expect((await counted()).sets).toMatchObject([{ cards: 20 }]);

    vi.setSystemTime(new Date('2026-01-08T12:01:00Z'));
    await setsRequest('Arena').expect(200);
    expect((await counted()).sets).toMatchObject([{ cards: 21 }]);
  } finally {
    vi.useRealTimers();
  }
});

it('says so when Scryfall can’t be reached for its sets', async () => {
  scryfall.sets.mockRejectedValue(new ScryfallUnavailableError(503));

  const res = await setsRequest('Arena').expect(502);

  expect(res.body).toEqual({
    error: 'scryfall-unavailable',
    message: 'Scryfall could not be reached. Try again in a moment.',
  });
});

it('refuses a platform other than Arena or MTGO', async () => {
  const res = await setsRequest('Paper').expect(400);

  expect(res.body).toEqual({
    error: 'invalid',
    message: 'Choose Arena or MTGO.',
  });
});

it('is only for signed-in users', async () => {
  await request(app.getHttpServer())
    .get('/api/sets')
    .query({ platform: 'Arena' })
    .expect(401);
});
