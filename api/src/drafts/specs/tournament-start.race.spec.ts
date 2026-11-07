import {
  answered,
  bobCookie,
  describeRaces,
  planOf,
  race,
} from './race-harness.js';
import {
  aliceCookie,
  clearBasics,
  completeDraft,
  fullDeck,
  setUpTournament,
  startTournament,
  tournamentView,
} from './tournament-harness.js';

describeRaces('starting a tournament against a deck change', () => {
  it('locks the deck the player had before the write, which is then refused, or refuses the deck the write left', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await fullDeck(id, aliceCookie);
    await fullDeck(id, bobCookie);
    await setUpTournament(id).expect(201);

    // Clearing Bob's 39 Mountains leaves his mainboard 1 card, too small to
    // start with, so whichever lands second sees what the first did.
    const [started, cleared] = await race(
      () => startTournament(id),
      () => clearBasics(id, bobCookie),
    );

    const bobs = await planOf(id, bobCookie);
    expect([
      {
        started: 200,
        cleared: '409 deck-locked',
        state: 'Playing',
        basics: [{ land: 'Mountain', count: 39 }],
      },
      {
        started: '409 deck-too-small',
        cleared: 200,
        state: 'Registration',
        basics: [],
      },
    ]).toContainEqual({
      started: answered(started),
      cleared: answered(cleared),
      state: (await tournamentView(id)).state,
      basics: bobs.basics,
    });
  });
});
