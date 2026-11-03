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
  moveBasic,
  clearBasics,
  poolCardIds,
  pick,
  undo,
  enqueue,
  post,
  getDraft,
} from './harness.js';

useDraftsApp();

/** Plans are only open to app admins for now, and Carol is one. */
describe('basic lands in a plan', () => {
  const cards = ['Shock', 'Lightning Bolt', 'Lava Spike', 'Skewer the Critics'];
  let carolCookie: string;

  beforeEach(async () => {
    carolCookie = await signIn(carol);
  });

  it('adds basics to the mainboard by count, and takes them out at 0', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, cards);
    await start(id).expect(200);

    await setBasic(id, 'Mountain', 7, carolCookie).expect(200);
    await setBasic(id, 'Wastes', 1, carolCookie).expect(200);
    const set = await setBasic(id, 'Plains', 2, carolCookie).expect(200);

    expect(set.body).toEqual({
      mainboard: [],
      sideboard: [],
      basics: [
        { land: 'Plains', board: 'Mainboard', count: 2 },
        { land: 'Mountain', board: 'Mainboard', count: 7 },
        { land: 'Wastes', board: 'Mainboard', count: 1 },
      ],
      lost: [],
    });
    await setBasic(id, 'Mountain', 6, carolCookie).expect(200);
    await setBasic(id, 'Wastes', 0, carolCookie).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual([
      { land: 'Plains', board: 'Mainboard', count: 2 },
      { land: 'Mountain', board: 'Mainboard', count: 6 },
    ]);
    // They're no pool cards.
    expect(Object.keys(await poolCardIds(id))).toEqual(
      expect.not.arrayContaining(['Plains', 'Mountain']),
    );
  });

  it('moves a basic to the sideboard and back, one copy at a time', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, cards);
    await setBasic(id, 'Island', 3, carolCookie).expect(200);

    await moveBasic(id, 'Island', 'Sideboard', carolCookie).expect(200);
    const moved = await moveBasic(id, 'Island', 'Sideboard', carolCookie);

    expect(moved.body.basics).toEqual([
      { land: 'Island', board: 'Mainboard', count: 1 },
      { land: 'Island', board: 'Sideboard', count: 2 },
    ]);
    const back = await moveBasic(id, 'Island', 'Mainboard', carolCookie);
    expect(back.body.basics).toEqual([
      { land: 'Island', board: 'Mainboard', count: 2 },
      { land: 'Island', board: 'Sideboard', count: 1 },
    ]);
    const refused = await moveBasic(id, 'Swamp', 'Sideboard', carolCookie);
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({
      error: 'basic-not-on-board',
      message: 'There’s no Swamp on your mainboard.',
    });
  });

  it('counts a basic across both boards, adding to the mainboard and taking from it first', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, cards);
    await setBasic(id, 'Forest', 4, carolCookie).expect(200);
    await moveBasic(id, 'Forest', 'Sideboard', carolCookie).expect(200);
    await moveBasic(id, 'Forest', 'Sideboard', carolCookie).expect(200);

    const raised = await setBasic(id, 'Forest', 5, carolCookie).expect(200);
    expect(raised.body.basics).toEqual([
      { land: 'Forest', board: 'Mainboard', count: 3 },
      { land: 'Forest', board: 'Sideboard', count: 2 },
    ]);
    const lowered = await setBasic(id, 'Forest', 1, carolCookie).expect(200);
    expect(lowered.body.basics).toEqual([
      { land: 'Forest', board: 'Sideboard', count: 1 },
    ]);
    const none = await setBasic(id, 'Forest', 0, carolCookie).expect(200);
    expect(none.body.basics).toEqual([]);
  });

  it('clears every basic, on both boards, leaving the rest of the plan', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, cards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock, carolCookie).expect(200);
    await setBasic(id, 'Plains', 2, carolCookie).expect(200);
    await setBasic(id, 'Swamp', 3, carolCookie).expect(200);
    await moveBasic(id, 'Swamp', 'Sideboard', carolCookie).expect(200);

    const cleared = await clearBasics(id, carolCookie).expect(200);

    expect(cleared.body).toEqual({
      mainboard: [{ poolCardId: ids.Shock, name: 'Shock', picked: true }],
      sideboard: [],
      basics: [],
      lost: [],
    });
  });

  it('refuses a land that isn’t basic, or a count that isn’t a whole number from 0 to 99', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, cards);

    const notBasic = await setBasic(id, 'Shock', 1, carolCookie).expect(400);
    expect(notBasic.body).toEqual({
      error: 'invalid',
      message: 'Choose a basic land.',
    });
    await moveBasic(id, 'plains', 'Sideboard', carolCookie).expect(400);
    for (const count of [-1, 1.5, 100, '2', null]) {
      const refused = await setBasic(id, 'Plains', count, carolCookie);
      expect(refused.status).toBe(400);
      expect(refused.body).toEqual({
        error: 'invalid',
        message: 'Choose a number of copies from 0 to 99.',
      });
    }
    await setBasic(id, 'Plains', 99, carolCookie).expect(200);
    await setBasic(id, 'Plains', 1, carolCookie).expect(200);
    await moveBasic(id, 'Plains', 'Nowhere', carolCookie).expect(400);
  });

  it('changes basics in the lobby and while active, paused, closed and complete, leaving the draft alone', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 1, cards);
    const ids = await poolCardIds(id);
    await setBasic(id, 'Plains', 1, carolCookie).expect(200);
    await start(id).expect(200);
    await setBasic(id, 'Plains', 2, carolCookie).expect(200);
    await post(id, 'pause').expect(200);
    await setBasic(id, 'Plains', 3, carolCookie).expect(200);
    await post(id, 'close').expect(200);
    await moveBasic(id, 'Plains', 'Sideboard', carolCookie).expect(200);
    await post(id, 'reopen').expect(200);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    const done = await pick(id, ids.Shock).expect(200);
    expect(done.body.state).toBe('Complete');

    await clearBasics(id, carolCookie).expect(200);
    const complete = await setBasic(id, 'Mountain', 4, carolCookie);

    expect(complete.body.basics).toEqual([
      { land: 'Mountain', board: 'Mainboard', count: 4 },
    ]);
    expect((await getDraft(id).expect(200)).body.version).toBe(
      done.body.version,
    );
  });

  it('keeps basics out of the queue, and through other players’ picks and undo', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, cards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await setBasic(id, 'Mountain', 5, carolCookie).expect(200);
    await moveBasic(id, 'Mountain', 'Sideboard', carolCookie).expect(200);

    await pick(id, ids.Shock, carolCookie).expect(200);
    const queued = await enqueue(id, 'Mountain', carolCookie).expect(404);
    expect(queued.body.error).toBe('not-in-pool');
    await pick(id, ids['Lightning Bolt']).expect(200);
    await undo(id, 2).expect(200);
    await undo(id, 1).expect(200);

    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual([
      { land: 'Mountain', board: 'Mainboard', count: 4 },
      { land: 'Mountain', board: 'Sideboard', count: 1 },
    ]);
  });

  it('keeps basics private to their player', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 1, cards);

    await setBasic(id, 'Plains', 1, carolCookie).expect(403);
    await moveBasic(id, 'Plains', 'Sideboard', carolCookie).expect(403);
    await clearBasics(id, carolCookie).expect(403);
    await setBasic('no-such-draft', 'Plains', 1, carolCookie).expect(404);
  });
});
