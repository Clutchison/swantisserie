import {
  answered,
  bobCookie,
  describeRaces,
  planOf,
  race,
} from './race-harness.js';
import {
  aliceCookie,
  bob,
  clearBasics,
  completeDraft,
  fullDeck,
  joinedPlayers,
  joinTournament,
  setUpTournament,
} from './tournament-harness.js';

describeRaces('joining a tournament against a deck change', () => {
  it('locks the deck the player had before the write, which is then refused, or refuses the deck the write left', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await fullDeck(id, bobCookie);
    await setUpTournament(id).expect(201);

    // Clearing Bob's 39 Mountains leaves his mainboard 1 card, too small to
    // join with, so whichever lands second sees what the first did.
    const [joined, cleared] = await race(
      () => joinTournament(id, bobCookie),
      () => clearBasics(id, bobCookie),
    );

    const bobs = await planOf(id, bobCookie);
    expect([
      {
        joined: 201,
        cleared: '409 deck-locked',
        entries: [bob.id],
        mainboard: ['Lightning Bolt'],
        basics: [{ land: 'Mountain', count: 39 }],
      },
      {
        joined: '409 deck-too-small',
        cleared: 200,
        entries: [],
        mainboard: ['Lightning Bolt'],
        basics: [],
      },
    ]).toContainEqual({
      joined: answered(joined),
      cleared: answered(cleared),
      entries: await joinedPlayers(id),
      mainboard: bobs.mainboard.map((card) => card.name),
      basics: bobs.basics,
    });
  });
});
