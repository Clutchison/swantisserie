import {
  addToPlan,
  aliceCookie,
  bob,
  cancelTournament,
  carol,
  clearBasics,
  completeDraft,
  completeTournament,
  dismissPlanNotice,
  dismissReadyNotice,
  fullDeck,
  movePlanned,
  plan,
  poolCardIds,
  removeEntry,
  removeFromPlan,
  addBasicsUpTo,
  addBasic,
  setUpTournament,
  signIn,
  startTournament,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

let bobCookie: string;
let carolCookie: string;
let id: string;
let ids: Record<string, string>;

beforeEach(async () => {
  bobCookie = await signIn(bob);
  carolCookie = await signIn(carol);
  id = await completeDraft([aliceCookie, bobCookie, carolCookie]);
  ids = await poolCardIds(id);
  for (const cookie of [aliceCookie, bobCookie]) await fullDeck(id, cookie);
  await setUpTournament(id).expect(201);
});

/** Every plan write Alice can send, each answering with its status. */
const planWrites = () => [
  () => movePlanned(id, ids.Shock, 'Sideboard', aliceCookie),
  () => addBasic(id, 'Island', aliceCookie),
  () => clearBasics(id, aliceCookie),
  () => addToPlan(id, ids['Lava Spike'], aliceCookie),
  () => removeFromPlan(id, ids.Shock, aliceCookie),
];

/** Carol, whose deck is too small, leaves, and Alice starts the tournament. */
async function startPlaying() {
  await removeEntry(id, carol.id, carolCookie).expect(200);
  await startTournament(id).expect(200);
}

describe('a joined player’s deck', () => {
  it('takes every plan write during registration, though setup joined its player', async () => {
    await movePlanned(id, ids.Shock, 'Sideboard', aliceCookie).expect(200);
    await addBasicsUpTo(id, 'Island', 2, aliceCookie);
    await clearBasics(id, aliceCookie).expect(200);
    await movePlanned(id, ids.Shock, 'Mainboard', aliceCookie).expect(200);

    expect((await plan(id, aliceCookie).expect(200)).body).toMatchObject({
      mainboard: [{ poolCardId: ids.Shock, name: 'Shock', picked: true }],
      basics: [],
    });
  });

  it('refuses every plan write once the tournament is playing, saying the deck is locked', async () => {
    await startPlaying();
    const before = (await plan(id, aliceCookie).expect(200)).body;

    for (const write of planWrites()) {
      expect((await write().expect(409)).body).toEqual({
        error: 'deck-locked',
        message:
          'Your deck is locked until this draft’s tournament is complete or cancelled.',
      });
    }
    expect((await plan(id, aliceCookie).expect(200)).body).toEqual(before);
  });

  it('still serves the deck, which the exports are built from, and lets its notices be dismissed, before and after Start', async () => {
    for (const step of [() => Promise.resolve(), startPlaying]) {
      await step();
      const deck = (await plan(id, aliceCookie).expect(200)).body;

      expect(deck.mainboard).toEqual([
        { poolCardId: ids.Shock, name: 'Shock', picked: true },
      ]);
      expect(deck.basics).toEqual([
        { land: 'Mountain', board: 'Mainboard', count: 39 },
      ]);
      await dismissPlanNotice(id, aliceCookie).expect(200);
      await dismissReadyNotice(id, aliceCookie).expect(200);
    }
  });

  it('leaves the deck of a player who left before Start unlocked', async () => {
    await removeEntry(id, carol.id, carolCookie).expect(200);
    await startTournament(id).expect(200);

    await addBasicsUpTo(id, 'Island', 2, carolCookie);
  });

  it('unlocks once the tournament is complete', async () => {
    await startPlaying();
    await completeTournament(id).expect(200);

    await movePlanned(id, ids.Shock, 'Sideboard', aliceCookie).expect(200);
    await clearBasics(id, aliceCookie).expect(200);
  });

  it('unlocks once the tournament is cancelled', async () => {
    await startPlaying();
    await cancelTournament(id).expect(200);

    await movePlanned(id, ids.Shock, 'Sideboard', aliceCookie).expect(200);
    await clearBasics(id, aliceCookie).expect(200);
  });

  it('locks the deck as its player last edited it during registration', async () => {
    await addBasicsUpTo(id, 'Island', 2, aliceCookie);
    await removeEntry(id, carol.id, carolCookie).expect(200);
    await startTournament(id).expect(200);

    expect(
      (await addBasic(id, 'Island', aliceCookie).expect(409)).body.error,
    ).toBe('deck-locked');
    expect((await plan(id, aliceCookie).expect(200)).body.basics).toEqual([
      { land: 'Island', board: 'Mainboard', count: 2 },
      { land: 'Mountain', board: 'Mainboard', count: 39 },
    ]);
  });
});
