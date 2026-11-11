import { Logger } from '@nestjs/common';
import type { BasicLandPrintingsView } from 'contract';
import request from 'supertest';
import { ScryfallUnavailableError } from '../scryfall/scryfall-client.js';
import {
  aliceCookie,
  app,
  scryfall,
  scryfallAnswers,
  startApp,
  useDraftsApp,
} from '../drafts/specs/harness.js';
import {
  landPrinting,
  printingsAnswers,
  printingsQuery,
  viewOf,
} from '../testing/scryfall-printings.js';
import { scryfallSet } from '../testing/scryfall-sets.js';

useDraftsApp();

function printingsRequest(land: string, cookie: string | null = aliceCookie) {
  const req = request(app.getHttpServer()).get(
    `/api/basic-land-printings/${encodeURIComponent(land)}`,
  );
  return cookie ? req.set('Cookie', cookie) : req;
}

/** The land's printings, once the refresh under way has stored some. */
function stored(land: string): Promise<BasicLandPrintingsView> {
  return vi.waitFor(async () => {
    const res = await printingsRequest(land).expect(200);
    expect(res.body.sets).not.toEqual([]);
    return res.body as BasicLandPrintingsView;
  });
}

const KHM = scryfallSet('khm', { name: 'Kaldheim', releasedAt: '2021-02-05' });
const ONS = scryfallSet('ons', { name: 'Onslaught', releasedAt: '2002-10-07' });
const UNF = scryfallSet('unf', { name: 'Unfinity', releasedAt: '2022-10-07' });

const khm394 = landPrinting(
  'Island',
  'a0000000-0000-4000-8000-000000000394',
  'khm',
  '394',
);
const khm395 = landPrinting(
  'Island',
  'a0000000-0000-4000-8000-000000000395',
  'khm',
  '395',
);
const khm10 = landPrinting(
  'Island',
  'a0000000-0000-4000-8000-000000000010',
  'khm',
  '10',
);
const ons336 = landPrinting(
  'Island',
  'b0000000-0000-4000-8000-000000000336',
  'ons',
  '336',
);
const unf236 = landPrinting(
  'Island',
  'c0000000-0000-4000-8000-000000000236',
  'unf',
  '236',
);
const unfForest = landPrinting(
  'Forest',
  'c0000000-0000-4000-8000-000000000239',
  'unf',
  '239',
);

it('answers with one basic land’s printings grouped by set, newest set first, each set’s in collector-number order', async () => {
  scryfall.sets.mockResolvedValue([ONS, KHM, UNF]);
  scryfallAnswers(
    printingsAnswers([khm394, ons336, khm10, unf236, khm395, unfForest]),
  );

  expect(await stored('Island')).toEqual({
    sets: [
      {
        code: 'unf',
        name: 'Unfinity',
        releasedAt: '2022-10-07',
        printings: [viewOf(unf236)],
      },
      {
        code: 'khm',
        name: 'Kaldheim',
        releasedAt: '2021-02-05',
        printings: [khm10, khm394, khm395].map(viewOf),
      },
      {
        code: 'ons',
        name: 'Onslaught',
        releasedAt: '2002-10-07',
        printings: [viewOf(ons336)],
      },
    ],
  });
  expect((await stored('Forest')).sets).toEqual([
    expect.objectContaining({
      code: 'unf',
      printings: [viewOf(unfForest)],
    }),
  ]);
  expect(scryfall.search).toHaveBeenCalledWith(printingsQuery('Island'), 1);
});

it('stores only English printings named exactly that land with a single-faced image on Scryfall’s CDN, page by page', async () => {
  scryfall.sets.mockResolvedValue([ONS, KHM]);
  const notStored = [
    landPrinting('Island', 'd0000000-0000-4000-8000-000000000001', 'khm', '1', {
      name: 'Snow-Covered Island',
    }),
    landPrinting('Island', 'd0000000-0000-4000-8000-000000000002', 'khm', '2', {
      lang: 'ja',
    }),
    landPrinting('Island', 'd0000000-0000-4000-8000-000000000003', 'khm', '3', {
      image_uris: undefined,
    }),
    landPrinting('Island', 'd0000000-0000-4000-8000-000000000004', 'khm', '4', {
      image_uris: {
        small: 'https://example.com/small.jpg',
        normal: 'https://example.com/normal.jpg',
        large: 'https://example.com/large.jpg',
      },
    }),
  ];
  scryfallAnswers({
    ...printingsAnswers([]),
    [printingsQuery('Island')]: {
      totalCards: 6,
      hasMore: true,
      cards: [khm394, ...notStored],
      warnings: [],
    },
    [`${printingsQuery('Island')} page 2`]: {
      totalCards: 6,
      hasMore: false,
      cards: [ons336],
      warnings: [],
    },
  });

  await vi.waitFor(async () => {
    const { sets } = await stored('Island');
    expect(sets).toEqual([
      expect.objectContaining({
        code: 'khm',
        printings: [viewOf(khm394)],
      }),
      expect.objectContaining({
        code: 'ons',
        printings: [viewOf(ons336)],
      }),
    ]);
  });
});

it('refuses any other land, Wastes among them, and is only for signed-in users', async () => {
  await printingsRequest('Snow-Covered Island').expect(400);
  await printingsRequest('Wastes').expect(400);
  const refused = await printingsRequest('Lotus').expect(400);
  expect(refused.body).toMatchObject({ error: 'invalid' });
  await printingsRequest('Island', null).expect(401);
});

it('answers at once while the first refresh runs, and starts no second one', async () => {
  scryfall.sets.mockResolvedValue([KHM]);
  const answers = printingsAnswers([khm394]);
  let answerIsland!: () => void;
  const islandAnswered = new Promise<void>(
    (resolve) => (answerIsland = resolve),
  );
  scryfall.search.mockImplementation(async (query) => {
    if (query === printingsQuery('Island')) await islandAnswered;
    return answers[query];
  });

  expect((await printingsRequest('Island').expect(200)).body).toEqual({
    sets: [],
  });
  await vi.waitFor(() =>
    expect(scryfall.search).toHaveBeenCalledWith(printingsQuery('Island'), 1),
  );
  expect((await printingsRequest('Island').expect(200)).body).toEqual({
    sets: [],
  });
  await printingsRequest('Forest').expect(200);

  answerIsland();
  await stored('Island');
  // One search per basic land, Wastes not among them: the later requests started no refresh of their own.
  expect(scryfall.search).toHaveBeenCalledTimes(5);
  expect(scryfall.search).not.toHaveBeenCalledWith(
    '!"Wastes" lang:en unique:prints',
    1,
  );
});

it('refreshes again only once a set has been released since the last refresh started, keeping every printing it stored', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(new Date('2026-01-10T12:00:00Z'));
    const next = scryfallSet('nxt', {
      name: 'Next Set',
      releasedAt: '2026-01-20',
    });
    scryfall.sets.mockResolvedValue([KHM, next]);
    scryfallAnswers(printingsAnswers([khm394]));
    await stored('Island');
    const searches = scryfall.search.mock.calls.length;

    // The set is still in spoiler season: its basic lands may be incomplete.
    vi.setSystemTime(new Date('2026-01-19T12:00:00Z'));
    await printingsRequest('Island').expect(200);
    await vi.waitFor(() => expect(scryfall.sets).toHaveBeenCalledTimes(2));
    await printingsRequest('Island').expect(200);
    expect(scryfall.search).toHaveBeenCalledTimes(searches);

    // Released: refreshed, and Kaldheim's printing, which Scryfall no longer lists, kept.
    vi.setSystemTime(new Date('2026-01-21T12:00:00Z'));
    const nxt1 = landPrinting(
      'Island',
      'e0000000-0000-4000-8000-000000000001',
      'nxt',
      '1',
    );
    scryfallAnswers(printingsAnswers([nxt1]));
    await vi.waitFor(async () => {
      const { sets } = await stored('Island');
      expect(sets).toEqual([
        {
          code: 'nxt',
          name: 'Next Set',
          releasedAt: '2026-01-20',
          printings: [viewOf(nxt1)],
        },
        expect.objectContaining({
          code: 'khm',
          printings: [viewOf(khm394)],
        }),
      ]);
    });
    const refreshed = scryfall.search.mock.calls.length;

    // That refresh started after the release, so it isn't due again.
    await printingsRequest('Island').expect(200);
    await printingsRequest('Island').expect(200);
    expect(scryfall.search).toHaveBeenCalledTimes(refreshed);
  } finally {
    vi.useRealTimers();
  }
});

it('answers from what is stored when Scryfall fails, and refreshes on a later request', async () => {
  const errors = vi
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => {});
  scryfall.sets.mockResolvedValue([KHM]);
  scryfallAnswers({
    ...printingsAnswers([khm394]),
    [printingsQuery('Island')]: new ScryfallUnavailableError(503),
  });

  await printingsRequest('Island').expect(200);
  await vi.waitFor(() => expect(errors).toHaveBeenCalled());

  scryfallAnswers(printingsAnswers([khm394]));
  await stored('Island');
});

it('stops a refresh at shutdown, and refreshes on the next request after', async () => {
  scryfall.sets.mockResolvedValue([KHM]);
  const answers = printingsAnswers([khm394]);
  let answerIsland!: () => void;
  const islandAnswered = new Promise<void>(
    (resolve) => (answerIsland = resolve),
  );
  scryfall.search.mockImplementation(async (query) => {
    if (query === printingsQuery('Island')) await islandAnswered;
    return answers[query];
  });
  await printingsRequest('Island').expect(200);
  await vi.waitFor(() =>
    expect(scryfall.search).toHaveBeenCalledWith(printingsQuery('Island'), 1),
  );
  const errors = vi.spyOn(Logger.prototype, 'error');

  const closed = app.close();
  answerIsland();
  // Shutting down waits for the search under way, then searches no more.
  await closed;
  expect(errors).not.toHaveBeenCalled();
  expect(scryfall.search).toHaveBeenCalledTimes(2);

  await startApp();
  scryfallAnswers(answers);
  await stored('Island');
});
