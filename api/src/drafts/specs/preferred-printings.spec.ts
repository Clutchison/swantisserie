import type { BasicLandPrintingView, PlanView } from 'contract';
import request from 'supertest';
import { ScryfallUnavailableError } from '../../scryfall/scryfall-client.js';
import {
  aliceCookie,
  app,
  bob,
  card,
  plan,
  playingTournament,
  readyDraft,
  scryfall,
  setBasic,
  signIn,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

/** Sets the signed-in player's preferred printing of `land`, sending `body`. */
function setPreferred(land: string, body: unknown, cookie = aliceCookie) {
  return request(app.getHttpServer())
    .put(`/api/preferred-printings/${land}`)
    .set('Cookie', cookie)
    .send(body as object);
}

/** Clears the signed-in player's preferred printing of `land`. */
function clearPreferred(land: string, cookie = aliceCookie) {
  return request(app.getHttpServer())
    .delete(`/api/preferred-printings/${land}`)
    .set('Cookie', cookie);
}

/** The preferred printings the player's plan in draft `id` shows. */
async function preferredIn(id: string, cookie = aliceCookie) {
  return ((await plan(id, cookie).expect(200)).body as PlanView)
    .preferredPrintings;
}

const kaldheimIsland = '0a9e4a3b-1d47-4c3a-a3a7-6d0d5d3a4c1e';
/** Scryfall's card object of an English Island printing, Kaldheim's #395. */
const islandCard = card('Island', {
  id: kaldheimIsland,
  set: 'khm',
  collector_number: '395',
  type_line: 'Basic Land — Island',
  rarity: 'common',
  image_uris: {
    small: `https://cards.scryfall.io/small/front/0/a/${kaldheimIsland}.jpg`,
    normal: `https://cards.scryfall.io/normal/front/0/a/${kaldheimIsland}.jpg`,
    large: `https://cards.scryfall.io/large/front/0/a/${kaldheimIsland}.jpg`,
  },
});
const kaldheimIslandView: BasicLandPrintingView = {
  scryfallId: kaldheimIsland,
  set: 'khm',
  collectorNumber: '395',
  images: islandCard.image_uris!,
};

describe('preferred printings', () => {
  let bobCookie: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
    scryfall.card.mockImplementation(async (id) =>
      id === kaldheimIsland ? islandCard : null,
    );
  });

  it('sets a player’s preferred printing, once Scryfall shows it is an English printing of that land, for their plans in every draft', async () => {
    const first = await readyDraft([aliceCookie, bobCookie]);
    const second = await readyDraft([aliceCookie]);
    expect(await preferredIn(first)).toEqual({});

    const set = await setPreferred('Island', {
      scryfallId: kaldheimIsland,
    }).expect(200);

    expect(scryfall.card).toHaveBeenCalledWith(kaldheimIsland);
    expect(set.body).toEqual({ Island: kaldheimIslandView });
    expect(await preferredIn(first)).toEqual({ Island: kaldheimIslandView });
    expect(await preferredIn(second)).toEqual({ Island: kaldheimIslandView });
    // Only Alice's: Bob's plan shows his own, which he hasn't set.
    expect(await preferredIn(first, bobCookie)).toEqual({});
  });

  it('replaces a preferred printing, and clears it so the land shows its default printing again', async () => {
    const id = await readyDraft([aliceCookie]);
    const forest = card('Forest', {
      id: '11111111-2222-4333-8444-555555555555',
      set: 'unf',
      collector_number: '239',
    });
    const otherIsland = card('Island', {
      id: '66666666-7777-4888-8999-aaaaaaaaaaaa',
      set: 'ons',
      collector_number: '336',
    });
    scryfall.card.mockImplementation(
      async (scryfallId) =>
        [islandCard, otherIsland, forest].find((c) => c.id === scryfallId) ??
        null,
    );
    await setPreferred('Island', { scryfallId: kaldheimIsland }).expect(200);
    await setPreferred('Forest', { scryfallId: forest.id }).expect(200);

    await setPreferred('Island', { scryfallId: otherIsland.id }).expect(200);
    expect((await preferredIn(id)).Island).toMatchObject({
      scryfallId: otherIsland.id,
      set: 'ons',
      collectorNumber: '336',
    });

    const cleared = await clearPreferred('Island').expect(200);
    expect(Object.keys(cleared.body)).toEqual(['Forest']);
    expect(Object.keys(await preferredIn(id))).toEqual(['Forest']);
    // Clearing one there is none of changes nothing.
    await clearPreferred('Island').expect(200);
  });

  it('refuses anything but an English printing of that basic land, saving nothing', async () => {
    const id = await readyDraft([aliceCookie]);
    const printings: Record<string, ReturnType<typeof card>> = {
      snow: card('Snow-Covered Island', {
        id: '10000000-0000-4000-8000-000000000001',
      }),
      forest: card('Forest', { id: '10000000-0000-4000-8000-000000000002' }),
      japanese: card('Island', {
        id: '10000000-0000-4000-8000-000000000003',
        lang: 'ja',
      }),
      offCdn: card('Island', {
        id: '10000000-0000-4000-8000-000000000005',
        image_uris: {
          small: 'https://example.com/small.jpg',
          normal: 'https://example.com/normal.jpg',
          large: 'https://example.com/large.jpg',
        },
      }),
    };
    scryfall.card.mockImplementation(
      async (scryfallId) =>
        Object.values(printings).find((c) => c.id === scryfallId) ?? null,
    );

    for (const scryfallId of [
      printings.snow.id,
      printings.forest.id,
      printings.japanese.id,
      printings.offCdn.id,
      // No printing on Scryfall at all.
      '10000000-0000-4000-8000-000000000004',
    ]) {
      const refused = await setPreferred('Island', { scryfallId }).expect(400);
      expect(refused.body).toMatchObject({ error: 'invalid' });
    }
    // Checked before asking Scryfall.
    scryfall.card.mockClear();
    await setPreferred('Island', {}).expect(400);
    await setPreferred('Island', { scryfallId: 'not-an-id' }).expect(400);
    await setPreferred('Island', { scryfallId: 7 }).expect(400);
    await setPreferred('Snow-Covered Island', {
      scryfallId: kaldheimIsland,
    }).expect(400);
    await clearPreferred('Lotus').expect(400);
    expect(scryfall.card).not.toHaveBeenCalled();
    expect(await preferredIn(id)).toEqual({});
  });

  it('says so when Scryfall can’t be reached, saving nothing', async () => {
    const id = await readyDraft([aliceCookie]);
    scryfall.card.mockRejectedValue(new ScryfallUnavailableError(503));

    const refused = await setPreferred('Island', {
      scryfallId: kaldheimIsland,
    }).expect(502);

    expect(refused.body).toMatchObject({ error: 'scryfall-unavailable' });
    expect(await preferredIn(id)).toEqual({});
  });

  it('is only for a signed-in player, who changes only their own', async () => {
    await request(app.getHttpServer())
      .put('/api/preferred-printings/Island')
      .send({ scryfallId: kaldheimIsland })
      .expect(401);
    await request(app.getHttpServer())
      .delete('/api/preferred-printings/Island')
      .expect(401);
  });

  it('changes while the player’s deck is locked, leaving the deck alone', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    await setBasic(id, 'Mountain', 1, bobCookie).expect(409);
    const before = (await plan(id, bobCookie).expect(200)).body as PlanView;

    await setPreferred(
      'Island',
      { scryfallId: kaldheimIsland },
      bobCookie,
    ).expect(200);

    expect((await plan(id, bobCookie).expect(200)).body).toEqual({
      ...before,
      preferredPrintings: { Island: kaldheimIslandView },
    });
  });
});
