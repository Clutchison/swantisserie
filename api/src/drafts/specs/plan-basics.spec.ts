import {
  aliceCookie,
  bob,
  carol,
  useDraftsApp,
  signIn,
  readyDraft,
  start,
  plan,
  setBasic,
  clearBasics,
  movePlanned,
  poolCardIds,
  pick,
  undo,
  enqueue,
  post,
  getDraft,
  fourCards,
} from './harness.js';

useDraftsApp();

describe('basic lands in a plan', () => {
  let carolCookie: string;

  beforeEach(async () => {
    carolCookie = await signIn(carol);
  });

  it('adds basics to the mainboard by count, and takes them out at 0', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await start(id).expect(200);

    await setBasic(id, 'Mountain', 7, carolCookie).expect(200);
    await setBasic(id, 'Wastes', 1, carolCookie).expect(200);
    const set = await setBasic(id, 'Plains', 2, carolCookie).expect(200);

    expect(set.body).toEqual({
      mainboard: [],
      sideboard: [],
      basics: [
        { land: 'Plains', count: 2 },
        { land: 'Mountain', count: 7 },
        { land: 'Wastes', count: 1 },
      ],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
    await setBasic(id, 'Mountain', 6, carolCookie).expect(200);
    await setBasic(id, 'Wastes', 0, carolCookie).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual([
      { land: 'Plains', count: 2 },
      { land: 'Mountain', count: 6 },
    ]);
  });

  it('never puts a basic on the sideboard', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await setBasic(id, 'Island', 3, carolCookie).expect(200);

    const moved = await movePlanned(id, 'Island', 'Sideboard', carolCookie);

    expect(moved.status).toBe(409);
    expect(moved.body.error).toBe('not-in-plan');
    expect((await plan(id, carolCookie).expect(200)).body).toMatchObject({
      sideboard: [],
      basics: [{ land: 'Island', count: 3 }],
    });
  });

  it('clears every basic, leaving the rest of the plan', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock, carolCookie).expect(200);
    await setBasic(id, 'Plains', 2, carolCookie).expect(200);
    await setBasic(id, 'Swamp', 3, carolCookie).expect(200);

    const cleared = await clearBasics(id, carolCookie).expect(200);

    expect(cleared.body).toEqual({
      mainboard: [{ poolCardId: ids.Shock, name: 'Shock', picked: true }],
      sideboard: [],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
  });

  it('refuses a land that isn’t basic, or a count that isn’t a whole number from 0 to 99', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);

    const notBasic = await setBasic(id, 'Shock', 1, carolCookie).expect(400);
    expect(notBasic.body).toEqual({
      error: 'invalid',
      message: 'Choose a basic land.',
    });
    await setBasic(id, 'plains', 1, carolCookie).expect(400);
    for (const count of [-1, 1.5, 100, '2', null]) {
      const refused = await setBasic(id, 'Plains', count, carolCookie);
      expect(refused.status).toBe(400);
      expect(refused.body).toEqual({
        error: 'invalid',
        message: 'Choose a number of copies from 0 to 99.',
      });
    }
    await setBasic(id, 'Plains', 99, carolCookie).expect(200);
  });

  it('changes basics in the lobby and while active, paused, closed and complete, leaving the draft alone', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 1, fourCards);
    const ids = await poolCardIds(id);
    await setBasic(id, 'Plains', 1, carolCookie).expect(200);
    await start(id).expect(200);
    await setBasic(id, 'Plains', 2, carolCookie).expect(200);
    await post(id, 'pause').expect(200);
    await setBasic(id, 'Plains', 3, carolCookie).expect(200);
    await post(id, 'close').expect(200);
    await setBasic(id, 'Plains', 4, carolCookie).expect(200);
    await post(id, 'reopen').expect(200);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    const lastPick = await pick(id, ids.Shock).expect(200);
    expect(lastPick.body.state).toBe('Complete');

    await clearBasics(id, carolCookie).expect(200);
    const complete = await setBasic(id, 'Mountain', 4, carolCookie).expect(200);

    expect(complete.body.basics).toEqual([{ land: 'Mountain', count: 4 }]);
    expect((await getDraft(id).expect(200)).body.version).toBe(
      lastPick.body.version,
    );
  });

  it('keeps basics out of the queue, and through other players’ picks and undo', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await setBasic(id, 'Mountain', 5, carolCookie).expect(200);

    await pick(id, ids.Shock, carolCookie).expect(200);
    const queued = await enqueue(id, 'Mountain', carolCookie).expect(404);
    expect(queued.body.error).toBe('not-in-pool');
    await pick(id, ids['Lightning Bolt']).expect(200);
    await undo(id, 2).expect(200);
    await undo(id, 1).expect(200);

    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual([
      { land: 'Mountain', count: 5 },
    ]);
  });

  it('lets every player set their basics, and keeps them private to that player', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 1, fourCards);
    // Alice isn't an app admin.
    const set = await setBasic(id, 'Plains', 1, aliceCookie).expect(200);
    expect(set.body.basics).toEqual([{ land: 'Plains', count: 1 }]);

    await setBasic(id, 'Plains', 1, carolCookie).expect(403);
    await clearBasics(id, carolCookie).expect(403);
    await setBasic('no-such-draft', 'Plains', 1, carolCookie).expect(404);
  });
});
