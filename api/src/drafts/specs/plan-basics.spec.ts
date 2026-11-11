import {
  aliceCookie,
  bob,
  carol,
  useDraftsApp,
  signIn,
  readyDraft,
  start,
  plan,
  addBasicsUpTo,
  addBasic,
  clearBasics,
  draftsRequest,
  poolCardIds,
  pick,
  undo,
  enqueue,
  post,
  getDraft,
  fourCards,
  moveBasic,
  moveBasics,
  removeBasic,
} from './harness.js';
import {
  inRegistration,
  markReady,
  playingTournament,
  tournamentView,
} from './tournament-harness.js';

useDraftsApp();

describe('basic lands in a plan', () => {
  let carolCookie: string;

  beforeEach(async () => {
    carolCookie = await signIn(carol);
  });

  it('adds one copy of a basic land to the mainboard at a time', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await start(id).expect(200);

    await addBasic(id, 'Mountain', carolCookie).expect(200);
    await addBasic(id, 'Plains', carolCookie).expect(200);
    const added = await addBasic(id, 'Mountain', carolCookie).expect(200);

    expect(added.body).toEqual({
      mainboard: [],
      sideboard: [],
      basics: [
        { land: 'Plains', board: 'Mainboard', count: 1 },
        { land: 'Mountain', board: 'Mainboard', count: 2 },
      ],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual(
      added.body.basics,
    );
  });

  it('lists the mainboard’s basics first, then the sideboard’s, each in the basic lands’ order', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await addBasicsUpTo(id, 'Forest', 2, carolCookie);
    await addBasicsUpTo(id, 'Island', 8, carolCookie);
    await addBasicsUpTo(id, 'Mountain', 4, carolCookie);
    await addBasicsUpTo(id, 'Plains', 1, carolCookie);
    await moveBasics(id, 'Mountain', 'Sideboard', 4, carolCookie);
    await moveBasics(id, 'Plains', 'Sideboard', 1, carolCookie);
    await moveBasics(id, 'Island', 'Sideboard', 5, carolCookie);

    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual([
      { land: 'Island', board: 'Mainboard', count: 3 },
      { land: 'Forest', board: 'Mainboard', count: 2 },
      { land: 'Plains', board: 'Sideboard', count: 1 },
      { land: 'Island', board: 'Sideboard', count: 5 },
      { land: 'Mountain', board: 'Sideboard', count: 4 },
    ]);
  });

  it('adds a copy to the mainboard, leaving the sideboard’s copies of that land alone', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await addBasicsUpTo(id, 'Island', 2, carolCookie);
    await moveBasics(id, 'Island', 'Sideboard', 2, carolCookie);

    const added = await addBasic(id, 'Island', carolCookie).expect(200);

    expect(added.body.basics).toEqual([
      { land: 'Island', board: 'Mainboard', count: 1 },
      { land: 'Island', board: 'Sideboard', count: 2 },
    ]);
  });

  it('refuses a copy once the plan holds 99 of that land across both plan boards', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await addBasicsUpTo(id, 'Island', 99, carolCookie);
    await moveBasics(id, 'Island', 'Sideboard', 9, carolCookie);
    await addBasicsUpTo(id, 'Forest', 99, carolCookie);

    const refused = await addBasic(id, 'Island', carolCookie).expect(409);
    expect(refused.body).toEqual({
      error: 'most-basics',
      message: 'Your plan already holds 99 copies of Island.',
    });
    await addBasic(id, 'Forest', carolCookie).expect(409);
    await addBasic(id, 'Plains', carolCookie).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual([
      { land: 'Plains', board: 'Mainboard', count: 1 },
      { land: 'Island', board: 'Mainboard', count: 90 },
      { land: 'Forest', board: 'Mainboard', count: 99 },
      { land: 'Island', board: 'Sideboard', count: 9 },
    ]);
  });

  it('clears every basic from both plan boards, leaving the rest of the plan', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock, carolCookie).expect(200);
    await addBasicsUpTo(id, 'Plains', 2, carolCookie);
    await addBasicsUpTo(id, 'Swamp', 3, carolCookie);
    await addBasicsUpTo(id, 'Island', 2, carolCookie);
    await moveBasics(id, 'Island', 'Sideboard', 2, carolCookie);

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
    await addBasicsUpTo(id, 'Mountain', 3, aliceCookie);
    await addBasicsUpTo(id, 'Island', 2, bobCookie);

    await clearBasics(id, aliceCookie).expect(200);

    expect((await plan(id, bobCookie).expect(200)).body.basics).toEqual([
      { land: 'Island', board: 'Mainboard', count: 2 },
    ]);
  });

  it('refuses to add a land that isn’t basic, Wastes among them', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);

    const notBasic = await addBasic(id, 'Shock', carolCookie).expect(400);
    expect(notBasic.body).toEqual({
      error: 'invalid',
      message: 'Choose a basic land.',
    });
    await addBasic(id, 'plains', carolCookie).expect(400);
    const wastes = await addBasic(id, 'Wastes', carolCookie).expect(400);
    expect(wastes.body).toEqual({
      error: 'invalid',
      message: 'Choose a basic land.',
    });
    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual([]);
  });

  it('refuses a body that names a count of copies, not a plan board, leaving the plan alone', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await addBasic(id, 'Island', carolCookie).expect(200);

    const refused = await draftsRequest(
      'put',
      `/${id}/plan/basics/Island`,
      carolCookie,
      { count: 3 },
    ).expect(400);

    expect(refused.body).toEqual({
      error: 'invalid',
      message: 'Choose the mainboard or the sideboard.',
    });
    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual([
      { land: 'Island', board: 'Mainboard', count: 1 },
    ]);
  });

  it('changes basics in the lobby and while active, paused, closed and complete, leaving the draft alone', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 1, fourCards);
    const ids = await poolCardIds(id);
    await addBasicsUpTo(id, 'Plains', 1, carolCookie);
    await start(id).expect(200);
    await addBasicsUpTo(id, 'Plains', 2, carolCookie);
    await post(id, 'pause').expect(200);
    await addBasicsUpTo(id, 'Plains', 3, carolCookie);
    await post(id, 'close').expect(200);
    await addBasicsUpTo(id, 'Plains', 4, carolCookie);
    await post(id, 'reopen').expect(200);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    const lastPick = await pick(id, ids.Shock).expect(200);
    expect(lastPick.body.state).toBe('Complete');

    await clearBasics(id, carolCookie).expect(200);
    const complete = await addBasicsUpTo(id, 'Mountain', 4, carolCookie);

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
    await addBasicsUpTo(id, 'Mountain', 5, carolCookie);

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
    const set = await addBasicsUpTo(id, 'Plains', 1, aliceCookie);
    expect(set.body.basics).toEqual([
      { land: 'Plains', board: 'Mainboard', count: 1 },
    ]);

    await addBasic(id, 'Plains', carolCookie).expect(403);
    await clearBasics(id, carolCookie).expect(403);
    await addBasic('no-such-draft', 'Plains', carolCookie).expect(404);
  });
});

describe('moving a basic land between plan boards', () => {
  let carolCookie: string;

  beforeEach(async () => {
    carolCookie = await signIn(carol);
  });

  it('moves one copy to the sideboard and back, taking it from the other plan board', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await addBasicsUpTo(id, 'Island', 3, carolCookie);

    const toSideboard = await moveBasic(
      id,
      'Island',
      'Sideboard',
      carolCookie,
    ).expect(200);
    expect(toSideboard.body.basics).toEqual([
      { land: 'Island', board: 'Mainboard', count: 2 },
      { land: 'Island', board: 'Sideboard', count: 1 },
    ]);

    await moveBasic(id, 'Island', 'Sideboard', carolCookie).expect(200);
    await moveBasic(id, 'Island', 'Sideboard', carolCookie).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual([
      { land: 'Island', board: 'Sideboard', count: 3 },
    ]);

    const back = await moveBasic(id, 'Island', 'Mainboard', carolCookie).expect(
      200,
    );
    expect(back.body.basics).toEqual([
      { land: 'Island', board: 'Mainboard', count: 1 },
      { land: 'Island', board: 'Sideboard', count: 2 },
    ]);
  });

  it('refuses moving a copy from a plan board that holds none of that land, leaving the plan alone', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await addBasicsUpTo(id, 'Island', 2, carolCookie);

    const toMainboard = await moveBasic(id, 'Island', 'Mainboard', carolCookie);
    expect(toMainboard.status).toBe(409);
    expect(toMainboard.body).toEqual({
      error: 'not-in-plan',
      message: 'Your sideboard holds no Island.',
    });
    const forest = await moveBasic(id, 'Forest', 'Sideboard', carolCookie);
    expect(forest.status).toBe(409);
    expect(forest.body).toEqual({
      error: 'not-in-plan',
      message: 'Your mainboard holds no Forest.',
    });

    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual([
      { land: 'Island', board: 'Mainboard', count: 2 },
    ]);
  });

  it('refuses a land that isn’t basic or a plan board that isn’t one', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await addBasicsUpTo(id, 'Island', 2, carolCookie);

    expect(
      (await moveBasic(id, 'Wastes', 'Sideboard', carolCookie).expect(400))
        .body,
    ).toEqual({ error: 'invalid', message: 'Choose a basic land.' });
    for (const board of ['sideboard', 'Maybeboard', null, 1]) {
      expect(
        (await moveBasic(id, 'Island', board, carolCookie).expect(400)).body,
      ).toEqual({
        error: 'invalid',
        message: 'Choose the mainboard or the sideboard.',
      });
    }
  });

  it('moves only the player’s own basics', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 1, fourCards);
    await addBasicsUpTo(id, 'Island', 2, aliceCookie);
    await addBasicsUpTo(id, 'Island', 2, bobCookie);

    await moveBasic(id, 'Island', 'Sideboard', aliceCookie).expect(200);

    expect((await plan(id, bobCookie).expect(200)).body.basics).toEqual([
      { land: 'Island', board: 'Mainboard', count: 2 },
    ]);
    await moveBasic(id, 'Island', 'Sideboard', carolCookie).expect(403);
  });

  it('clears a ready player’s ready, with the Ready notice, when a move takes their mainboard below 40, bumping the version', async () => {
    const bobCookie = await signIn(bob);
    const id = await inRegistration([aliceCookie, bobCookie]);
    await markReady(id, bobCookie).expect(200);
    const before = (await getDraft(id).expect(200)).body.version;

    const moved = await moveBasic(
      id,
      'Mountain',
      'Sideboard',
      bobCookie,
    ).expect(200);

    expect(moved.body.readyNotice).toBe(true);
    expect((await getDraft(id).expect(200)).body.version).toBe(before + 1);
    expect(
      (await tournamentView(id)).entries.find(
        (entry) => entry.playerId === bob.id,
      )?.ready,
    ).toBe(false);
  });

  it('refuses a move on a locked deck', async () => {
    const id = await playingTournament([aliceCookie, await signIn(bob)]);

    expect(
      (await moveBasic(id, 'Mountain', 'Sideboard', aliceCookie).expect(409))
        .body.error,
    ).toBe('deck-locked');
    expect((await plan(id, aliceCookie).expect(200)).body.basics).toEqual([
      { land: 'Mountain', board: 'Mainboard', count: 39 },
    ]);
  });
});

describe('taking a basic land’s copy out of the plan', () => {
  let carolCookie: string;

  beforeEach(async () => {
    carolCookie = await signIn(carol);
  });

  it('takes one copy off the named plan board, leaving the other plan board alone', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await addBasicsUpTo(id, 'Island', 3, carolCookie);
    await moveBasics(id, 'Island', 'Sideboard', 1, carolCookie);

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
    await addBasicsUpTo(id, 'Island', 2, carolCookie);
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
    await addBasicsUpTo(id, 'Plains', 1, carolCookie);

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
    expect(
      (await tournamentView(id)).entries.find(
        (entry) => entry.playerId === bob.id,
      )?.ready,
    ).toBe(false);
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
