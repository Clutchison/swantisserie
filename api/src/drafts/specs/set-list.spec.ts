import type { Platform } from 'contract';
import request from 'supertest';
import { ScryfallUnavailableError } from '../../scryfall/scryfall-client.js';
import {
  countAnswers,
  OTJ_SETS,
  scryfallSet,
} from '../../testing/scryfall-sets.js';
import {
  aliceCookie,
  app,
  bob,
  card,
  createDraft,
  join,
  listDrafts,
  page,
  pool,
  post,
  scryfall,
  scryfallAnswers,
  signIn,
  snapshotted,
  start,
  useDraftsApp,
} from './harness.js';
import type {
  ScryfallCard,
  ScryfallSearchPage,
} from '../../scryfall/scryfall-client.js';

useDraftsApp();

const NO_BASICS =
  '-!"Plains" -!"Island" -!"Swamp" -!"Mountain" -!"Forest" -!"Wastes"';
const game = (platform: Platform) => (platform === 'Arena' ? 'arena' : 'mtgo');
/** The search for the set's printings on the platform, one per card. */
const onPlatformQuery = (code: string, platform: Platform = 'Arena') =>
  `e:${code} ${NO_BASICS} game:${game(platform)} unique:cards`;
/** The search for the set's cards printed there only off the platform, though on it elsewhere. */
const elsewhereQuery = (code: string, platform: Platform = 'Arena') =>
  `e:${code} ${NO_BASICS} -game:${game(platform)} in:${game(platform)} unique:cards`;

/** Karlov Manor, released before Thunder Junction. */
const MKM = scryfallSet('mkm', {
  name: 'Murders at Karlov Manor',
  releasedAt: '2024-02-09',
});
const CATALOG = [...OTJ_SETS, MKM];
const COUNTS = { otj: 276, big: 30, otp: 65, yotj: 30, otc: 0, mkm: 286 };

/** A printing of the card in the set: a card's printings share its oracle id. */
const printing = (name: string, set: string) =>
  card(name, { id: `${name}-${set}`, set });

/**
 * Scryfall lists the catalog's sets, counts their cards on `platform`, and
 * answers each of `searches`; the set list picker has then counted them.
 */
async function scryfallHas(
  searches: Record<string, ScryfallSearchPage | null | Error>,
  platform: Platform = 'Arena',
) {
  scryfall.sets.mockResolvedValue(CATALOG);
  scryfallAnswers({ ...countAnswers(COUNTS, platform), ...searches });
  await vi.waitFor(async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sets')
      .query({ platform })
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(res.body.counting).toBe(false);
  });
}

/** Scryfall has a printing on the platform of each card given, and of no other. */
function printingsOn(...printings: ScryfallCard[]) {
  scryfall.printingsOn.mockImplementation(async (_game, oracleIds) =>
    printings.filter((p) => oracleIds.includes(p.oracle_id!)),
  );
}

/** Each pool card's name and the set of its printing, by name. */
async function poolPrintings(id: string) {
  const res = await pool(id).expect(200);
  return (res.body as { name: string; set: string }[])
    .map((c) => `${c.name} (${c.set})`)
    .sort();
}

/** Creates a draft from a Thunder Junction set list with its bonus sheets, all on Arena. */
async function thunderJunction(picksPerPlayer = 1) {
  await scryfallHas({
    [onPlatformQuery('otj')]: page(printing('Slickshot Show-Off', 'otj')),
    [elsewhereQuery('otj')]: null,
    [onPlatformQuery('big')]: page(printing('Collector’s Cage', 'big')),
    [elsewhereQuery('big')]: null,
    [onPlatformQuery('otp')]: page(printing('Tranquil Frillback', 'otp')),
    [elsewhereQuery('otp')]: null,
  });
  return createDraft({
    name: 'Outlaws',
    picksPerPlayer,
    poolSource: {
      kind: 'set-list',
      setList: [{ code: 'otj', sublists: ['otp', 'big'] }],
    },
  }).expect(201);
}

describe('creating a draft from a set list', () => {
  it('shows the set list, each set with the sublists it includes', async () => {
    const created = await thunderJunction();

    expect(created.body.poolSource).toEqual({
      kind: 'set-list',
      setList: [{ code: 'otj', sublists: ['big', 'otp'] }],
    });
    const list = await listDrafts().expect(200);
    expect(list.body[0].poolSource).toEqual(created.body.poolSource);
  });

  it('keeps the sets oldest first', async () => {
    await scryfallHas({});

    const created = await createDraft({
      name: 'Spring 2024',
      poolSource: {
        kind: 'set-list',
        setList: [
          { code: 'otj', sublists: [] },
          { code: 'mkm', sublists: [] },
        ],
      },
    }).expect(201);

    expect(created.body.poolSource.setList).toEqual([
      { code: 'mkm', sublists: [] },
      { code: 'otj', sublists: [] },
    ]);
  });

  it('refuses a set the picker doesn’t offer on the platform', async () => {
    await scryfallHas({});

    for (const code of ['otc', 'totj', 'zzz']) {
      const refused = await createDraft({
        name: 'Nope',
        poolSource: { kind: 'set-list', setList: [{ code, sublists: [] }] },
      }).expect(422);
      expect(refused.body).toEqual({
        error: 'set-not-offered',
        message: `${code.toUpperCase()} isn’t a set with cards on Arena.`,
      });
    }
    await listDrafts().expect(200).expect([]);
  });

  it('refuses a sublist the picker doesn’t offer with its set', async () => {
    await scryfallHas({});

    for (const sublist of ['otc', 'totj', 'mkm']) {
      const refused = await createDraft({
        name: 'Nope',
        poolSource: {
          kind: 'set-list',
          setList: [{ code: 'otj', sublists: [sublist] }],
        },
      }).expect(422);
      expect(refused.body).toEqual({
        error: 'set-not-offered',
        message: `${sublist.toUpperCase()} isn’t a sublist of OTJ with cards on Arena.`,
      });
    }
  });

  it('refuses a set list with no sets, or that isn’t a list of sets', async () => {
    for (const setList of [
      [],
      undefined,
      'otj',
      [{ code: 'otj' }],
      [{ code: 7, sublists: [] }],
      [{ code: 'otj', sublists: [3] }],
    ]) {
      const refused = await createDraft({
        name: 'Nope',
        poolSource: { kind: 'set-list', setList },
      }).expect(400);
      expect(refused.body).toEqual({
        error: 'invalid',
        message: 'Choose at least one set.',
      });
    }
  });

  it('refuses a set chosen twice', async () => {
    const refused = await createDraft({
      name: 'Nope',
      poolSource: {
        kind: 'set-list',
        setList: [
          { code: 'otj', sublists: [] },
          { code: 'otj', sublists: ['big'] },
        ],
      },
    }).expect(400);

    expect(refused.body).toEqual({
      error: 'invalid',
      message: 'Choose each set once.',
    });
  });

  it('says so when Scryfall can’t be reached for its sets', async () => {
    scryfall.sets.mockRejectedValue(new ScryfallUnavailableError(503));

    const refused = await createDraft({
      name: 'Outlaws',
      poolSource: {
        kind: 'set-list',
        setList: [{ code: 'otj', sublists: [] }],
      },
    }).expect(502);

    expect(refused.body.error).toBe('scryfall-unavailable');
  });
});

describe('the pool snapshot of a set list', () => {
  it('holds the cards of each set and included sublist on the platform', async () => {
    const created = await thunderJunction();

    const draft = await snapshotted(created.body.id);

    expect(draft.snapshot).toEqual({ state: 'Complete', cards: 3, total: 3 });
    expect(await poolPrintings(created.body.id)).toEqual([
      'Collector’s Cage (big)',
      'Slickshot Show-Off (otj)',
      'Tranquil Frillback (otp)',
    ]);
  });

  it('leaves out a sublist the organizer left out', async () => {
    await scryfallHas({
      [onPlatformQuery('otj')]: page(printing('Slickshot Show-Off', 'otj')),
      [elsewhereQuery('otj')]: null,
    });

    const created = await createDraft({
      name: 'Outlaws',
      poolSource: {
        kind: 'set-list',
        setList: [{ code: 'otj', sublists: [] }],
      },
    }).expect(201);
    await snapshotted(created.body.id);

    expect(await poolPrintings(created.body.id)).toEqual([
      'Slickshot Show-Off (otj)',
    ]);
  });

  it('leaves out cards with no printing on the platform, and takes those on it elsewhere in a printing there', async () => {
    await scryfallHas({
      [onPlatformQuery('mkm')]: page(
        printing('Massacre Girl, Known Killer', 'mkm'),
      ),
      // Printed in Karlov Manor only off Arena: one has an Arena printing
      // elsewhere, and the other none, so Scryfall's `in:arena` leaves it out.
      [elsewhereQuery('mkm')]: page(printing('Doppelgang', 'mkm')),
    });
    printingsOn(printing('Doppelgang', 'y24'));

    const created = await createDraft({
      name: 'Karlov',
      poolSource: {
        kind: 'set-list',
        setList: [{ code: 'mkm', sublists: [] }],
      },
    }).expect(201);
    const draft = await snapshotted(created.body.id);

    expect(draft.snapshot.state).toBe('Complete');
    expect(await poolPrintings(created.body.id)).toEqual([
      'Doppelgang (y24)',
      'Massacre Girl, Known Killer (mkm)',
    ]);
    expect(scryfall.printingsOn).toHaveBeenCalledWith('arena', [
      'doppelgang-oracle',
    ]);
  });

  it('holds a card printed in two sets once, in its printing on the platform from the earliest released', async () => {
    await scryfallHas({
      [onPlatformQuery('mkm')]: page(printing('Lightning Helix', 'mkm')),
      [elsewhereQuery('mkm')]: page(
        printing('Fblthp, Lost on the Range', 'mkm'),
      ),
      [onPlatformQuery('otj')]: page(
        printing('Lightning Helix', 'otj'),
        printing('Fblthp, Lost on the Range', 'otj'),
      ),
      [elsewhereQuery('otj')]: page(printing('Lightning Helix', 'otj')),
    });

    const created = await createDraft({
      name: 'Spring 2024',
      poolSource: {
        kind: 'set-list',
        setList: [
          { code: 'otj', sublists: [] },
          { code: 'mkm', sublists: [] },
        ],
      },
    }).expect(201);
    await snapshotted(created.body.id);

    expect(await poolPrintings(created.body.id)).toEqual([
      // Karlov Manor's printing isn't on Arena; Thunder Junction's is.
      'Fblthp, Lost on the Range (otj)',
      'Lightning Helix (mkm)',
    ]);
    expect(scryfall.printingsOn).not.toHaveBeenCalled();
  });

  it('takes an MTGO draft’s cards on MTGO', async () => {
    await scryfallHas(
      {
        [onPlatformQuery('otj', 'MTGO')]: page(
          printing('Slickshot Show-Off', 'otj'),
        ),
        [elsewhereQuery('otj', 'MTGO')]: null,
      },
      'MTGO',
    );

    const created = await createDraft({
      name: 'Outlaws',
      platform: 'MTGO',
      poolSource: {
        kind: 'set-list',
        setList: [{ code: 'otj', sublists: [] }],
      },
    }).expect(201);
    const draft = await snapshotted(created.body.id);

    expect(draft.snapshot.state).toBe('Complete');
    expect(await poolPrintings(created.body.id)).toEqual([
      'Slickshot Show-Off (otj)',
    ]);
  });

  it('fails when Scryfall can’t be reached, and can be retried', async () => {
    await scryfallHas({
      [onPlatformQuery('otj')]: new ScryfallUnavailableError(503),
    });
    const created = await createDraft({
      name: 'Outlaws',
      poolSource: {
        kind: 'set-list',
        setList: [{ code: 'otj', sublists: [] }],
      },
    }).expect(201);
    expect((await snapshotted(created.body.id)).snapshot).toMatchObject({
      state: 'Failed',
      error: 'Scryfall could not be reached.',
    });

    scryfallAnswers({
      [onPlatformQuery('otj')]: page(printing('Slickshot Show-Off', 'otj')),
      [elsewhereQuery('otj')]: null,
    });
    await post(created.body.id, 'snapshot').expect(202);

    expect((await snapshotted(created.body.id)).snapshot).toEqual({
      state: 'Complete',
      cards: 1,
      total: 1,
    });
  });

  it('refuses a start when picks × players is more than the pool', async () => {
    const created = await thunderJunction(2);
    const { id } = created.body;
    await snapshotted(id);
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
