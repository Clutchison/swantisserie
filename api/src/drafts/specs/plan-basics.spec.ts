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
  putBasicsOnSideboard,
  removeBasic,
} from './harness.js';
import {
  inRegistration,
  markReady,
  playingTournament,
  tournament,
} from './tournament-harness.js';

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
    await setBasic(id, 'Forest', 1, carolCookie).expect(200);
    const set = await setBasic(id, 'Plains', 2, carolCookie).expect(200);

    expect(set.body).toEqual({
      mainboard: [],
      sideboard: [],
      basics: [
        { land: 'Plains', board: 'Mainboard', count: 2 },
        { land: 'Mountain', board: 'Mainboard', count: 7 },
        { land: 'Forest', board: 'Mainboard', count: 1 },
      ],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
    await setBasic(id, 'Mountain', 6, carolCookie).expect(200);
    await setBasic(id, 'Forest', 0, carolCookie).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual([
      { land: 'Plains', board: 'Mainboard', count: 2 },
      { land: 'Mountain', board: 'Mainboard', count: 6 },
    ]);
  });

  it('lists the mainboard’s basics first, then the sideboard’s, each in the basic lands’ order', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await setBasic(id, 'Forest', 2, carolCookie).expect(200);
    await setBasic(id, 'Island', 3, carolCookie).expect(200);
    await putBasicsOnSideboard(id, carol.id, 'Mountain', 4);
    await putBasicsOnSideboard(id, carol.id, 'Plains', 1);
    await putBasicsOnSideboard(id, carol.id, 'Island', 5);

    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual([
      { land: 'Island', board: 'Mainboard', count: 3 },
      { land: 'Forest', board: 'Mainboard', count: 2 },
      { land: 'Plains', board: 'Sideboard', count: 1 },
      { land: 'Island', board: 'Sideboard', count: 5 },
      { land: 'Mountain', board: 'Sideboard', count: 4 },
    ]);
  });

  it('sets a count on the mainboard, leaving the sideboard’s copies of that land alone', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await putBasicsOnSideboard(id, carol.id, 'Island', 2);

    await setBasic(id, 'Island', 3, carolCookie).expect(200);
    await setBasic(id, 'Island', 4, carolCookie).expect(200);
    const zero = await setBasic(id, 'Island', 0, carolCookie).expect(200);

    expect(zero.body.basics).toEqual([
      { land: 'Island', board: 'Sideboard', count: 2 },
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
      basics: [{ land: 'Island', board: 'Mainboard', count: 3 }],
    });
  });

  it('clears every basic from both plan boards, leaving the rest of the plan', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock, carolCookie).expect(200);
    await setBasic(id, 'Plains', 2, carolCookie).expect(200);
    await setBasic(id, 'Swamp', 3, carolCookie).expect(200);
    await putBasicsOnSideboard(id, carol.id, 'Island', 2);

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

  it('clears only the player’s own basics', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 1, fourCards);
    await setBasic(id, 'Mountain', 3, aliceCookie).expect(200);
    await setBasic(id, 'Island', 2, bobCookie).expect(200);

    await clearBasics(id, aliceCookie).expect(200);

    expect((await plan(id, bobCookie).expect(200)).body.basics).toEqual([
      { land: 'Island', board: 'Mainboard', count: 2 },
    ]);
  });

  it('refuses a land that isn’t basic, Wastes among them, or a count that isn’t a whole number from 0 to 99', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);

    const notBasic = await setBasic(id, 'Shock', 1, carolCookie).expect(400);
    expect(notBasic.body).toEqual({
      error: 'invalid',
      message: 'Choose a basic land.',
    });
    await setBasic(id, 'plains', 1, carolCookie).expect(400);
    const wastes = await setBasic(id, 'Wastes', 1, carolCookie).expect(400);
    expect(wastes.body).toEqual({
      error: 'invalid',
      message: 'Choose a basic land.',
    });
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

    expect(complete.body.basics).toEqual([
      { land: 'Mountain', board: 'Mainboard', count: 4 },
    ]);
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
      { land: 'Mountain', board: 'Mainboard', count: 5 },
    ]);
  });

  it('lets every player set their basics, and keeps them private to that player', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 1, fourCards);
    // Alice isn't an app admin.
    const set = await setBasic(id, 'Plains', 1, aliceCookie).expect(200);
    expect(set.body.basics).toEqual([
      { land: 'Plains', board: 'Mainboard', count: 1 },
    ]);

    await setBasic(id, 'Plains', 1, carolCookie).expect(403);
    await clearBasics(id, carolCookie).expect(403);
    await setBasic('no-such-draft', 'Plains', 1, carolCookie).expect(404);
  });
});

describe('taking a basic land’s copy out of the plan', () => {
  let carolCookie: string;

  beforeEach(async () => {
    carolCookie = await signIn(carol);
  });

  it('takes one copy off the named plan board, leaving the other plan board alone', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await setBasic(id, 'Island', 2, carolCookie).expect(200);
    await putBasicsOnSideboard(id, carol.id, 'Island', 1);

    const fromMainboard = await removeBasic(
      id,
      'Island',
      'Mainboard',
      carolCookie,
    ).expect(200);
    expect(fromMainboard.body.basics).toEqual([
      { land: 'Island', board: 'Mainboard', count: 1 },
      { land: 'Island', board: 'Sideboard', count: 1 },
    ]);

    await removeBasic(id, 'Island', 'Sideboard', carolCookie).expect(200);
    const last = await removeBasic(
      id,
      'Island',
      'Mainboard',
      carolCookie,
    ).expect(200);
    expect(last.body.basics).toEqual([]);
  });

  it('refuses a plan board that holds no copy of the land, changing nothing', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await setBasic(id, 'Island', 2, carolCookie).expect(200);
    const before = (await plan(id, carolCookie).expect(200)).body;

    const refused = await removeBasic(id, 'Island', 'Sideboard', carolCookie);

    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({
      error: 'not-in-plan',
      message: 'Your sideboard holds no Island.',
    });
    const forest = await removeBasic(id, 'Forest', 'Mainboard', carolCookie);
    expect(forest.status).toBe(409);
    expect(forest.body).toEqual({
      error: 'not-in-plan',
      message: 'Your mainboard holds no Forest.',
    });
    expect((await plan(id, carolCookie).expect(200)).body).toEqual(before);
  });

  it('refuses a land that isn’t basic, or a plan board that isn’t one', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await setBasic(id, 'Plains', 1, carolCookie).expect(200);

    const wastes = await removeBasic(id, 'Wastes', 'Mainboard', carolCookie);
    expect(wastes.status).toBe(400);
    expect(wastes.body).toEqual({
      error: 'invalid',
      message: 'Choose a basic land.',
    });
    const board = await removeBasic(id, 'Plains', 'mainboard', carolCookie);
    expect(board.status).toBe(400);
    expect(board.body).toEqual({
      error: 'invalid',
      message: 'Choose the mainboard or the sideboard.',
    });
  });

  it('clears a ready player’s ready and raises the Ready notice when their mainboard drops below 40', async () => {
    const bobCookie = await signIn(bob);
    const id = await inRegistration([aliceCookie, bobCookie]);
    await markReady(id, bobCookie).expect(200);

    const answer = await removeBasic(
      id,
      'Mountain',
      'Mainboard',
      bobCookie,
    ).expect(200);

    expect(answer.body.readyNotice).toBe(true);
    const entries = (await tournament(id).expect(200)).body.entries as {
      playerId: string;
      ready: boolean;
    }[];
    expect(entries.find((entry) => entry.playerId === bob.id)?.ready).toBe(
      false,
    );
  });

  it('refuses on a locked deck, changing nothing', async () => {
    const bobCookie = await signIn(bob);
    const id = await playingTournament([aliceCookie, bobCookie]);
    const before = (await plan(id, bobCookie).expect(200)).body;

    const refused = await removeBasic(id, 'Mountain', 'Mainboard', bobCookie);

    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('deck-locked');
    expect((await plan(id, bobCookie).expect(200)).body).toEqual(before);
  });
});
