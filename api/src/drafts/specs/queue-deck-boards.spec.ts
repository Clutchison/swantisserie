import type { DraftView } from 'contract';
import {
  alice,
  bob,
  carol,
  aliceCookie,
  useDraftsApp,
  signIn,
  readyDraft,
  readyDraftWithCopies,
  start,
  pick,
  undo,
  enqueue,
  queue,
  queued,
  moveQueued,
  removeFromQueue,
  setSeats,
  setQueuePaused,
  getDraft,
  plan,
  poolCardIds,
  fourCards,
  addBot,
  waitForBotPicks,
  queueInLobby,
  importPicks,
} from './harness.js';
import { playingTournament } from './tournament-harness.js';

useDraftsApp();

/** One of the player's picks, as their deck lists it. */
const picked = (poolCardId: string, name: string) => ({
  poolCardId,
  name,
});

/** The player's deck: its mainboard and sideboard, as their plan lists them. */
async function deckOf(id: string, cookie: string) {
  const { mainboard, sideboard } = (await plan(id, cookie).expect(200)).body;
  return { mainboard, sideboard };
}

/**
 * Alice and Bob in a started draft of `fourCards`, two picks each, with Bob
 * in the first seat: it's his turn, so Alice can queue.
 */
async function draftOnBobsTurn() {
  const bobCookie = await signIn(bob);
  const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
  await setSeats(id, [bob.id, alice.id]).expect(200);
  await start(id).expect(200);
  return { id, ids: await poolCardIds(id), bobCookie };
}

describe('a queued copy’s deck board', () => {
  it('starts on the mainboard, and moves to the sideboard and back without changing its place in the queue', async () => {
    const { id, ids } = await draftOnBobsTurn();
    await enqueue(id, ids.Shock).expect(200);
    await enqueue(id, ids['Lava Spike']).expect(200);
    expect((await queue(id).expect(200)).body.cards).toEqual([
      queued('Shock'),
      queued('Lava Spike'),
    ]);

    const moved = await moveQueued(id, ids.Shock, 'Sideboard').expect(200);

    expect(moved.body.cards).toEqual([
      { poolCardId: ids.Shock, name: 'Shock', board: 'Sideboard' },
      { poolCardId: ids['Lava Spike'], name: 'Lava Spike', board: 'Mainboard' },
    ]);
    expect((await queue(id).expect(200)).body.cards).toEqual(moved.body.cards);

    const back = await moveQueued(id, ids.Shock, 'Mainboard').expect(200);

    expect(back.body.cards).toEqual([queued('Shock'), queued('Lava Spike')]);
  });

  it('bumps no version, as the move is private to the player', async () => {
    const { id, ids } = await draftOnBobsTurn();
    await enqueue(id, ids.Shock).expect(200);
    const before = (await getDraft(id).expect(200)).body as DraftView;

    await moveQueued(id, ids.Shock, 'Sideboard').expect(200);

    expect((await getDraft(id).expect(200)).body.version).toBe(before.version);
  });

  it('refuses a card that isn’t queued, and a deck board that isn’t one', async () => {
    const { id, ids } = await draftOnBobsTurn();
    await enqueue(id, ids.Shock).expect(200);

    const notQueued = await moveQueued(id, ids['Lava Spike'], 'Sideboard');

    expect(notQueued.status).toBe(409);
    expect(notQueued.body).toEqual({
      error: 'not-queued',
      message: 'That card isn’t in your queue.',
    });
    const invalid = await moveQueued(id, ids.Shock, 'Maybeboard').expect(400);
    expect(invalid.body).toEqual({
      error: 'invalid',
      message: 'Choose the mainboard or the sideboard.',
    });
  });

  it('refuses a move while the deck is locked', async () => {
    const bobCookie = await signIn(bob);
    const id = await playingTournament([aliceCookie, bobCookie]);
    const ids = await poolCardIds(id);

    const locked = await moveQueued(id, ids.Shock, 'Sideboard').expect(409);

    expect(locked.body).toEqual({
      error: 'deck-locked',
      message:
        'Your deck is locked until this draft’s tournament is complete or cancelled.',
    });
  });

  it('is 403 for a user who isn’t in the draft', async () => {
    const { id, ids } = await draftOnBobsTurn();

    await moveQueued(id, ids.Shock, 'Sideboard', await signIn(carol)).expect(
      403,
    );
  });

  it('starts a card taken out of the queue and queued again on the mainboard', async () => {
    const { id, ids } = await draftOnBobsTurn();
    await enqueue(id, ids.Shock).expect(200);
    await moveQueued(id, ids.Shock, 'Sideboard').expect(200);
    await removeFromQueue(id, ids.Shock).expect(200);

    const again = await enqueue(id, ids.Shock).expect(200);

    expect(again.body.cards).toEqual([queued('Shock')]);
  });
});

describe('where a pick lands', () => {
  it('lands a card picked by hand on its queued copy’s deck board', async () => {
    const { id, ids, bobCookie } = await draftOnBobsTurn();
    await enqueue(id, ids.Shock).expect(200);
    await moveQueued(id, ids.Shock, 'Sideboard').expect(200);
    await setQueuePaused(id, true).expect(200);
    await pick(id, ids['Lava Spike'], bobCookie).expect(200);

    await pick(id, ids.Shock).expect(200);

    expect(await deckOf(id, aliceCookie)).toEqual({
      mainboard: [],
      sideboard: [picked(ids.Shock, 'Shock')],
    });
    expect((await queue(id).expect(200)).body.cards).toEqual([]);
  });

  it('lands a card picked by hand that the queue holds only another copy of on that copy’s deck board', async () => {
    const bobCookie = await signIn(bob);
    const { id, first, second } = await readyDraftWithCopies(
      [aliceCookie, bobCookie],
      2,
    );
    await setSeats(id, [bob.id, alice.id]).expect(200);
    await start(id).expect(200);
    await enqueue(id, second).expect(200);
    await moveQueued(id, second, 'Sideboard').expect(200);
    await setQueuePaused(id, true).expect(200);
    const ids = await poolCardIds(id);
    await pick(id, ids.Shock, bobCookie).expect(200);

    await pick(id, first).expect(200);

    expect((await deckOf(id, aliceCookie)).sideboard).toEqual([
      picked(first, 'Lightning Bolt'),
    ]);
    expect((await queue(id).expect(200)).body.cards).toEqual([]);
  });

  it('lands a card the player didn’t queue on the mainboard, whatever another player’s queue says', async () => {
    const { id, ids, bobCookie } = await draftOnBobsTurn();
    await enqueue(id, ids['Lava Spike']).expect(200);
    await moveQueued(id, ids['Lava Spike'], 'Sideboard').expect(200);

    await pick(id, ids['Lava Spike'], bobCookie).expect(200);

    expect(await deckOf(id, bobCookie)).toEqual({
      mainboard: [picked(ids['Lava Spike'], 'Lava Spike')],
      sideboard: [],
    });
  });

  it('lands a card the cascade picks on its queued copy’s deck board', async () => {
    const { id, ids, bobCookie } = await draftOnBobsTurn();
    await enqueue(id, ids.Shock).expect(200);
    await enqueue(id, ids['Skewer the Critics']).expect(200);
    await moveQueued(id, ids.Shock, 'Sideboard').expect(200);

    await pick(id, ids['Lava Spike'], bobCookie).expect(200);

    expect(await deckOf(id, aliceCookie)).toEqual({
      mainboard: [picked(ids['Skewer the Critics'], 'Skewer the Critics')],
      sideboard: [picked(ids.Shock, 'Shock')],
    });
  });

  it('keeps a copy queued in place of one another player picks on the same deck board, where its pick lands', async () => {
    const carolCookie = await signIn(carol);
    const { id, ids, first, second } = await readyDraftWithCopies([
      aliceCookie,
      await signIn(bob),
      carolCookie,
    ]);
    await start(id).expect(200);
    await enqueue(id, ids.Shock, carolCookie).expect(200);
    await enqueue(id, first, carolCookie).expect(200);
    await moveQueued(id, first, 'Sideboard', carolCookie).expect(200);

    await pick(id, first).expect(200);

    expect((await queue(id, carolCookie).expect(200)).body.cards).toEqual([
      { poolCardId: ids.Shock, name: 'Shock', board: 'Mainboard' },
      { poolCardId: second, name: 'Lightning Bolt', board: 'Sideboard' },
    ]);
  });

  it('lands a card a bot’s pick leaves to a player’s cascade on its queued copy’s deck board', async () => {
    const { id, ids } = await readyDraftWithCopies([aliceCookie]);
    await addBot(id, await signIn(carol)).expect(201);
    // The bot picks at once at the start, so Alice queued in the lobby.
    await queueInLobby(id, alice, ids.Shock);
    await moveQueued(id, ids.Shock, 'Sideboard').expect(200);
    // The bot picks first: the first card by name, Lava Spike.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const draft = (await getDraft(id).expect(200)).body as DraftView;
    await setSeats(id, draft.players.map((p) => p.id).reverse()).expect(200);

    await start(id).expect(200);

    await waitForBotPicks(1, async () => {
      expect(await deckOf(id, aliceCookie)).toEqual({
        mainboard: [],
        sideboard: [picked(ids.Shock, 'Shock')],
      });
    });
  });

  it('lands a pick import’s pick of a queued card on its queued copy’s deck board', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 2, [
      'Ash Golem',
      'Brine Wisp',
      'Cinder Hound',
      'Dusk Heron',
    ]);
    const ids = await poolCardIds(id);
    await queueInLobby(id, alice, ids['Ash Golem']);
    await moveQueued(id, ids['Ash Golem'], 'Sideboard').expect(200);

    await importPicks(
      id,
      ',Ann,Ben,\n->,Ash Golem,Brine Wisp,\n,,Cinder Hound,<-',
      [alice.id, bob.id],
    ).expect(200);

    expect(await deckOf(id, aliceCookie)).toEqual({
      mainboard: [],
      sideboard: [picked(ids['Ash Golem'], 'Ash Golem')],
    });
    expect((await deckOf(id, bobCookie)).sideboard).toEqual([]);
  });
});

describe('undoing a pick', () => {
  it('puts a lost card back in the queue on the deck board it was on', async () => {
    const { id, ids, bobCookie } = await draftOnBobsTurn();
    await enqueue(id, ids['Lava Spike']).expect(200);
    await enqueue(id, ids.Shock).expect(200);
    await moveQueued(id, ids['Lava Spike'], 'Sideboard').expect(200);
    await pick(id, ids['Lava Spike'], bobCookie).expect(200);

    await undo(id, 1).expect(200);

    expect((await queue(id).expect(200)).body.cards).toEqual([
      queued('Lava Spike', 'Sideboard'),
      queued('Shock'),
    ]);
  });

  it('puts the player’s own picked card back in the queue on its deck board, and out of the deck', async () => {
    const { id, ids, bobCookie } = await draftOnBobsTurn();
    await enqueue(id, ids.Shock).expect(200);
    await moveQueued(id, ids.Shock, 'Sideboard').expect(200);
    await setQueuePaused(id, true).expect(200);
    await pick(id, ids['Lava Spike'], bobCookie).expect(200);
    await pick(id, ids.Shock).expect(200);

    await undo(id, 2).expect(200);

    expect((await queue(id).expect(200)).body.cards).toEqual([
      queued('Shock', 'Sideboard'),
    ]);
    expect(await deckOf(id, aliceCookie)).toEqual({
      mainboard: [],
      sideboard: [],
    });
  });
});
