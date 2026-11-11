import type { DraftView } from 'contract';
import {
  bob,
  carol,
  aliceCookie,
  signIn,
  addBot,
  enqueue,
  getDraft,
  post,
  waitForBotPicks,
  addToPlan,
  movePlanned,
  addBasicsUpTo,
  useDraftsApp,
  readyDraft,
  start,
  pick,
  undo,
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
  picked: true,
});

describe('a plan becomes a deck when its draft completes', () => {
  let bobCookie: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
  });

  it('takes every unpicked card out of every plan when the last pick is made by hand, leaving picks, boards and basics as they were', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 1, cards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await addToPlan(id, ids['Lava Spike'], aliceCookie).expect(200);
    await addToPlan(id, ids['Play with Fire'], aliceCookie).expect(200);
    await movePlanned(id, ids['Play with Fire'], 'Sideboard', aliceCookie);
    await addBasicsUpTo(id, 'Mountain', 16, aliceCookie);
    await addToPlan(id, ids['Burst Lightning'], bobCookie).expect(200);
    await addBasicsUpTo(id, 'Swamp', 3, bobCookie);
    await pick(id, ids.Shock, aliceCookie).expect(200);
    await movePlanned(id, ids.Shock, 'Sideboard', aliceCookie).expect(200);

    const done = await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);

    expect(done.body.state).toBe('Complete');
    expect((await plan(id, aliceCookie).expect(200)).body).toEqual({
      mainboard: [],
      sideboard: [picked(ids.Shock, 'Shock')],
      basics: [{ land: 'Mountain', board: 'Mainboard', count: 16 }],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
    expect((await plan(id, bobCookie).expect(200)).body).toEqual({
      mainboard: [picked(ids['Lightning Bolt'], 'Lightning Bolt')],
      sideboard: [],
      basics: [{ land: 'Swamp', board: 'Mainboard', count: 3 }],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
  });

  it('takes the unpicked cards out when a queued pick completes the draft', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 1, cards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await addToPlan(id, ids['Burst Lightning'], bobCookie).expect(200);
    await enqueue(id, ids['Lightning Bolt'], bobCookie).expect(200);

    // Bob's queued pick follows Alice's, as the last pick.
    await pick(id, ids.Shock, aliceCookie).expect(200);

    expect((await getDraft(id).expect(200)).body.state).toBe('Complete');
    expect((await plan(id, bobCookie).expect(200)).body).toEqual({
      mainboard: [picked(ids['Lightning Bolt'], 'Lightning Bolt')],
      sideboard: [],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
  });

  it('takes the unpicked cards out when a bot’s pick completes the draft', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const id = await readyDraft([aliceCookie], 1, cards);
    await addBot(id, await signIn(carol)).expect(201);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await addToPlan(id, ids['Lava Spike'], aliceCookie).expect(200);

    await pick(id, ids.Shock, aliceCookie).expect(200);

    await waitForBotPicks(1, async () => {
      const draft = (await getDraft(id).expect(200)).body as DraftView;
      expect(draft.state).toBe('Complete');
    });
    expect((await plan(id, aliceCookie).expect(200)).body).toEqual({
      mainboard: [picked(ids.Shock, 'Shock')],
      sideboard: [],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
  });

  it('keeps a closed draft’s unpicked cards, and takes them out once it reopens and completes', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 1, cards);
    const ids = await poolCardIds(id);
    await enqueue(id, ids.Shock, aliceCookie).expect(200);
    await start(id).expect(200);
    // Shock was picked for Alice; undoing it brings back her turn, with
    // Shock back in her queue.
    await undo(id, 1).expect(200);
    await enqueue(id, ids['Lightning Bolt'], bobCookie).expect(200);
    await addToPlan(id, ids['Lava Spike'], aliceCookie).expect(200);
    await post(id, 'close').expect(200);

    expect((await plan(id, aliceCookie).expect(200)).body.mainboard).toEqual([
      { poolCardId: ids['Lava Spike'], name: 'Lava Spike', picked: false },
    ]);

    // Reopening cascades both queued picks, the second the last.
    const reopened = await post(id, 'reopen').expect(200);

    expect(reopened.body.state).toBe('Complete');
    expect((await plan(id, aliceCookie).expect(200)).body.mainboard).toEqual([
      picked(ids.Shock, 'Shock'),
    ]);
  });
});
