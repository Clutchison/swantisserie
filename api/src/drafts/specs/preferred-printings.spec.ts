import type { BasicLandPrintingView, PlanView } from 'contract';
import request from 'supertest';
import { landPrinting, viewOf } from '../../testing/scryfall-printings.js';
import {
  aliceCookie,
  app,
  bob,
  plan,
  playingTournament,
  readyDraft,
  scryfall,
  setBasic,
  signIn,
  storePrintings,
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
/** An English Island printing, Kaldheim's #395. */
const islandCard = landPrinting('Island', kaldheimIsland, 'khm', '395');
const kaldheimIslandView: BasicLandPrintingView = viewOf(islandCard);
const otherIsland = landPrinting(
  'Island',
  '66666666-7777-4888-8999-aaaaaaaaaaaa',
  'ons',
  '336',
);
const forest = landPrinting(
  'Forest',
  '11111111-2222-4333-8444-555555555555',
  'unf',
  '239',
);

describe('preferred printings', () => {
  let bobCookie: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
    await storePrintings([islandCard, otherIsland, forest]);
    scryfall.search.mockClear();
    scryfall.sets.mockClear();
  });

  it('sets a player’s preferred printing to a stored printing of that land, for their plans in every draft', async () => {
    const first = await readyDraft([aliceCookie, bobCookie]);
    const second = await readyDraft([aliceCookie]);
    expect(await preferredIn(first)).toEqual({});
    scryfall.search.mockClear();

    const set = await setPreferred('Island', {
      scryfallId: kaldheimIsland,
    }).expect(200);

    expect(set.body).toEqual({ Island: kaldheimIslandView });
    expect(await preferredIn(first)).toEqual({ Island: kaldheimIslandView });
    expect(await preferredIn(second)).toEqual({ Island: kaldheimIslandView });
    // Only Alice's: Bob's plan shows his own, which he hasn't set.
    expect(await preferredIn(first, bobCookie)).toEqual({});
    // Checked against the stored printings, not Scryfall.
    expect(scryfall.search).not.toHaveBeenCalled();
  });

  it('replaces a preferred printing, and clears it so the land shows its default printing again', async () => {
    const id = await readyDraft([aliceCookie]);
    await setPreferred('Island', { scryfallId: kaldheimIsland }).expect(200);
    await setPreferred('Forest', { scryfallId: forest.id }).expect(200);

    await setPreferred('Island', { scryfallId: otherIsland.id }).expect(200);
    expect((await preferredIn(id)).Island).toEqual(viewOf(otherIsland));

    const cleared = await clearPreferred('Island').expect(200);
    expect(Object.keys(cleared.body)).toEqual(['Forest']);
    expect(Object.keys(await preferredIn(id))).toEqual(['Forest']);
    // Clearing one there is none of changes nothing.
    await clearPreferred('Island').expect(200);
  });

  it('refuses anything but a stored printing of that basic land, saving nothing', async () => {
    const id = await readyDraft([aliceCookie]);

    for (const scryfallId of [
      // A stored printing, of another land.
      forest.id,
      // No stored printing at all.
      '10000000-0000-4000-8000-000000000004',
    ]) {
      const refused = await setPreferred('Island', { scryfallId }).expect(400);
      expect(refused.body).toEqual({
        error: 'invalid',
        message: 'That isn’t an English printing of Island.',
      });
    }
    await setPreferred('Island', {}).expect(400);
    await setPreferred('Island', { scryfallId: 'not-an-id' }).expect(400);
    await setPreferred('Island', { scryfallId: 7 }).expect(400);
    await setPreferred('Snow-Covered Island', {
      scryfallId: kaldheimIsland,
    }).expect(400);
    await clearPreferred('Lotus').expect(400);
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
