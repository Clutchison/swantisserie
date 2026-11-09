import type { ViewerTournamentView } from 'contract';
import { answered, bobCookie, describeRaces, race } from './race-harness.js';
import {
  aliceCookie,
  bob,
  inRegistration,
  markReady,
  setBasic,
  tournament,
} from './tournament-harness.js';

describeRaces('marking ready against a deck change', () => {
  it('never leaves the player ready with fewer than 40 cards: the change clears the ready marked first, or the mark sees the smaller deck', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);

    // 38 Mountains and Bob's one pick make 39 cards, too few to be ready, so
    // whichever lands second sees what the first did.
    const [marked, shrunk] = await race(
      () => markReady(id, bobCookie),
      () => setBasic(id, 'Mountain', 38, bobCookie),
    );

    const view = (await tournament(id).expect(200))
      .body as ViewerTournamentView;
    expect(shrunk.status).toBe(200);
    expect([
      { marked: 200, ready: false },
      { marked: '409 deck-too-small-for-ready', ready: false },
    ]).toContainEqual({
      marked: answered(marked),
      ready: view.entries.find((entry) => entry.playerId === bob.id)?.ready,
    });
  });
});
