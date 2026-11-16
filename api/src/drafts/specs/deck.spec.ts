import {
  bob,
  aliceCookie,
  signIn,
  movePlanned,
  addBasicsUpTo,
  useDraftsApp,
  readyDraft,
  start,
  pick,
  plan,
  poolCardIds,
} from './harness.js';

useDraftsApp();

const cards = [
  'Shock',
  'Lightning Bolt',
  'Lava Spike',
  'Skewer the Critics',
  'Play with Fire',
  'Burst Lightning',
];

const picked = (poolCardId: string, name: string) => ({
  poolCardId,
  name,
});

describe('a plan becomes a deck when its draft completes', () => {
  let bobCookie: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
  });

  it('leaves picks, boards and basics as they were when the last pick is made', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 1, cards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await addBasicsUpTo(id, 'Mountain', 16, aliceCookie);
    await addBasicsUpTo(id, 'Swamp', 3, bobCookie);
    await pick(id, ids.Shock, aliceCookie).expect(200);
    await movePlanned(id, ids.Shock, 'Sideboard', aliceCookie).expect(200);

    const done = await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);

    expect(done.body.state).toBe('Complete');
    expect((await plan(id, aliceCookie).expect(200)).body).toEqual({
      mainboard: [],
      sideboard: [picked(ids.Shock, 'Shock')],
      basics: [{ land: 'Mountain', board: 'Mainboard', count: 16 }],
      readyNotice: false,
      preferredPrintings: {},
    });
    expect((await plan(id, bobCookie).expect(200)).body).toEqual({
      mainboard: [picked(ids['Lightning Bolt'], 'Lightning Bolt')],
      sideboard: [],
      basics: [{ land: 'Swamp', board: 'Mainboard', count: 3 }],
      readyNotice: false,
      preferredPrintings: {},
    });
  });
});
