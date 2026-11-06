import {
  addToPlan,
  alice,
  aliceCookie,
  bob,
  cancelTournament,
  clearBasics,
  completeDraft,
  dismissPlanNotice,
  fullDeck,
  joinTournament,
  movePlanned,
  plan,
  poolCardIds,
  removeEntry,
  removeFromPlan,
  setBasic,
  setUpTournament,
  signIn,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

let bobCookie: string;
let id: string;
let ids: Record<string, string>;

beforeEach(async () => {
  bobCookie = await signIn(bob);
  id = await completeDraft([aliceCookie, bobCookie]);
  ids = await poolCardIds(id);
  await fullDeck(id, aliceCookie);
  await setUpTournament(id).expect(201);
  await joinTournament(id, aliceCookie).expect(201);
});

/** Every plan write Alice can send, each answering with its status. */
const planWrites = () => [
  () => movePlanned(id, ids.Shock, 'Sideboard', aliceCookie),
  () => setBasic(id, 'Island', 2, aliceCookie),
  () => clearBasics(id, aliceCookie),
  () => addToPlan(id, ids['Lava Spike'], aliceCookie),
  () => removeFromPlan(id, ids.Shock, aliceCookie),
];

describe('a locked deck', () => {
  it('refuses every plan write while its player has joined a tournament in registration, saying the deck is locked', async () => {
    const before = (await plan(id, aliceCookie).expect(200)).body;

    for (const write of planWrites()) {
      expect((await write().expect(409)).body).toEqual({
        error: 'deck-locked',
        message:
          'Your deck is locked while you are in this draft’s tournament.',
      });
    }
    expect((await plan(id, aliceCookie).expect(200)).body).toEqual(before);
  });

  it('still serves the deck, which the exports are built from, and still lets its notice be dismissed', async () => {
    const deck = (await plan(id, aliceCookie).expect(200)).body;

    expect(deck.mainboard).toEqual([
      { poolCardId: ids.Shock, name: 'Shock', picked: true },
    ]);
    expect(deck.basics).toEqual([{ land: 'Mountain', count: 39 }]);
    await dismissPlanNotice(id, aliceCookie).expect(200);
  });

  it('leaves the decks of players who haven’t joined unlocked', async () => {
    await setBasic(id, 'Island', 2, bobCookie).expect(200);
    await movePlanned(id, ids['Lightning Bolt'], 'Sideboard', bobCookie).expect(
      200,
    );
  });

  it('unlocks once its player leaves', async () => {
    await removeEntry(id, alice.id, aliceCookie).expect(200);

    await setBasic(id, 'Island', 2, aliceCookie).expect(200);
  });

  it('unlocks once an organizer removes its player', async () => {
    await removeEntry(id, alice.id, aliceCookie).expect(200);
    await fullDeck(id, bobCookie);
    await joinTournament(id, bobCookie).expect(201);

    await removeEntry(id, bob.id, aliceCookie).expect(200);

    await setBasic(id, 'Island', 2, bobCookie).expect(200);
  });

  it('unlocks once the tournament is cancelled', async () => {
    await cancelTournament(id).expect(200);

    await movePlanned(id, ids.Shock, 'Sideboard', aliceCookie).expect(200);
    await clearBasics(id, aliceCookie).expect(200);
  });
});
