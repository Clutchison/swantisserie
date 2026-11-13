import { PrismaService } from '../../prisma/prisma.service.js';
import { readTurnState } from '../turn-state.js';
import {
  alice,
  app,
  bob,
  carol,
  aliceCookie,
  useDraftsApp,
  signIn,
  getDraft,
  readyDraft,
  start,
  pick,
  poolCardIds,
  copyIds,
  pickLog,
  pickedNames,
  pickLogLines,
  listDrafts,
  fourCards,
} from './harness.js';

useDraftsApp();

describe('picks', () => {
  /**
   * A started draft of Alice then Bob, over Shock, Lightning Bolt, Lava
   * Spike and Skewer the Critics.
   */
  async function startedDraft(bobCookie: string, picksPerPlayer = 1) {
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      picksPerPlayer,
      fourCards,
    );
    await start(id).expect(200);
    return id;
  }

  it('lets the player whose turn it is pick a card, and the turn passes on', async () => {
    const id = await startedDraft(await signIn(bob));
    const ids = await poolCardIds(id);

    const picked = await pick(id, ids.Shock).expect(200);

    expect(picked.body.turn).toEqual({
      pick: 2,
      round: 1,
      playerId: bob.id,
      picksBeforeTurnPasses: 1,
    });
    expect((await getDraft(id).expect(200)).body.turn.playerId).toBe(bob.id);
    expect((await pickLog(id)).body).toEqual([
      {
        pick: 1,
        playerId: alice.id,
        poolCardId: ids.Shock,
      },
    ]);
  });

  it('keeps a double turn with the player for their second pick, then passes it in snake order', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      2,
      fourCards,
      null,
      2,
    );
    await start(id).expect(200);
    const ids = await poolCardIds(id);
    expect((await getDraft(id).expect(200)).body.turn).toEqual({
      pick: 1,
      round: 1,
      playerId: alice.id,
      picksBeforeTurnPasses: 2,
    });

    const first = await pick(id, ids.Shock).expect(200);
    expect(first.body.turn).toEqual({
      pick: 2,
      round: 1,
      playerId: alice.id,
      picksBeforeTurnPasses: 1,
    });

    const second = await pick(id, ids['Lightning Bolt']).expect(200);
    expect(second.body.turn).toEqual({
      pick: 3,
      round: 1,
      playerId: bob.id,
      picksBeforeTurnPasses: 2,
    });
    await pick(id, ids['Lava Spike'], bobCookie).expect(200);
    const last = await pick(id, ids['Skewer the Critics'], bobCookie).expect(
      200,
    );
    expect(last.body).toMatchObject({ state: 'Complete', turn: null });
    expect(await pickLogLines(id)).toEqual([
      'Alice: Shock',
      'Alice: Lightning Bolt',
      'Bob: Lava Spike',
      'Bob: Skewer the Critics',
    ]);
  });

  it('logs only its own draft’s picks, while another draft holds picks', async () => {
    const bobCookie = await signIn(bob);
    const other = await startedDraft(bobCookie);
    const otherIds = await poolCardIds(other);
    await pick(other, otherIds.Shock).expect(200);
    const id = await startedDraft(bobCookie);
    const ids = await poolCardIds(id);

    await pick(id, ids['Lightning Bolt']).expect(200);

    expect((await pickLog(id)).body).toEqual([
      { pick: 1, playerId: alice.id, poolCardId: ids['Lightning Bolt'] },
    ]);
  });

  it('follows snake order across rounds, logging every pick', async () => {
    const bobCookie = await signIn(bob);
    const id = await startedDraft(bobCookie, 2);
    const ids = await poolCardIds(id);

    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);
    const third = await pick(id, ids['Lava Spike'], bobCookie).expect(200);

    expect(third.body.turn).toEqual({
      pick: 4,
      round: 2,
      playerId: alice.id,
      picksBeforeTurnPasses: 1,
    });
    expect((await pickLog(id)).body).toEqual([
      {
        pick: 1,
        playerId: alice.id,
        poolCardId: ids.Shock,
      },
      {
        pick: 2,
        playerId: bob.id,
        poolCardId: ids['Lightning Bolt'],
      },
      {
        pick: 3,
        playerId: bob.id,
        poolCardId: ids['Lava Spike'],
      },
    ]);
  });

  it('refuses a pick out of turn', async () => {
    const bobCookie = await signIn(bob);
    const id = await startedDraft(bobCookie);
    const ids = await poolCardIds(id);

    const refused = await pick(id, ids.Shock, bobCookie).expect(409);
    expect(refused.body).toEqual({
      error: 'not-your-turn',
      message: 'It’s not your turn.',
    });
    expect((await pickLog(id)).body).toEqual([]);
  });

  it('refuses a pick by someone not in the draft as not a player', async () => {
    const id = await startedDraft(await signIn(bob));
    const ids = await poolCardIds(id);

    const refused = await pick(id, ids.Shock, await signIn(carol)).expect(403);
    expect(refused.body).toEqual({
      error: 'not-a-player',
      message: 'Only the draft’s players can pick.',
    });
    expect((await pickLog(id)).body).toEqual([]);
  });

  it('refuses a card that has already been picked', async () => {
    const bobCookie = await signIn(bob);
    const id = await startedDraft(bobCookie);
    const ids = await poolCardIds(id);
    await pick(id, ids.Shock).expect(200);

    const refused = await pick(id, ids.Shock, bobCookie).expect(409);

    expect(refused.body).toEqual({
      error: 'already-picked',
      message: 'That card has already been picked.',
    });
    expect((await getDraft(id).expect(200)).body.turn.playerId).toBe(bob.id);
  });

  it('picks each copy of a card on its own, and a player can pick a second copy', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 2, [
      'Lightning Bolt',
      'Lightning Bolt',
      'Lightning Bolt',
      'Shock',
    ]);
    await start(id).expect(200);
    const [first, second, third] = (await copyIds(id))['Lightning Bolt'];

    await pick(id, first).expect(200);
    await pick(id, first, bobCookie).expect(409);
    await pick(id, second, bobCookie).expect(200);
    await pick(id, third, bobCookie).expect(200);

    expect((await pickLog(id)).body).toEqual([
      { pick: 1, playerId: alice.id, poolCardId: first },
      { pick: 2, playerId: bob.id, poolCardId: second },
      { pick: 3, playerId: bob.id, poolCardId: third },
    ]);
  });

  it('refuses a card that is not in the pool, even one in another draft’s', async () => {
    const id = await startedDraft(await signIn(bob));
    const other = await poolCardIds(await readyDraft([aliceCookie]));

    const refused = await pick(id, 'no-such-card').expect(404);

    expect(refused.body).toEqual({
      error: 'not-in-pool',
      message: 'That card isn’t in this pool.',
    });
    await pick(id, other.Shock).expect(404);
    await pick(id, '').expect(400);
    await pick(id, 42).expect(400);
  });

  it('refuses picks before the draft starts', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)]);
    const ids = await poolCardIds(id);

    const refused = await pick(id, ids.Shock).expect(409);

    expect(refused.body).toEqual({
      error: 'not-drafting',
      message: 'This draft isn’t taking picks.',
    });
  });

  it('completes the draft with the last pick, and keeps it viewable', async () => {
    const bobCookie = await signIn(bob);
    const id = await startedDraft(bobCookie);
    const ids = await poolCardIds(id);
    await pick(id, ids.Shock).expect(200);

    const lastPick = await pick(id, ids['Lightning Bolt'], bobCookie).expect(
      200,
    );

    expect(lastPick.body).toMatchObject({ state: 'Complete', turn: null });
    expect((await getDraft(id).expect(200)).body.state).toBe('Complete');
    const listed = await listDrafts().expect(200);
    expect(
      listed.body.find((draft: { id: string }) => draft.id === id).state,
    ).toBe('Complete');
    expect(await pickedNames(id)).toEqual(['Shock', 'Lightning Bolt']);
    const refused = await pick(id, ids['Lava Spike']).expect(409);
    expect(refused.body.error).toBe('not-drafting');
  });

  it('answers a player’s two picks of different cards sent at once with one 200 and one refusal', async () => {
    // On PGlite the two run one after the other; picks.race.spec.ts races
    // them on a real Postgres.
    const id = await startedDraft(await signIn(bob));
    const ids = await poolCardIds(id);

    const responses = await Promise.all([
      pick(id, ids.Shock),
      pick(id, ids['Lightning Bolt']),
    ]);

    expect(responses.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    const log = (await pickLog(id)).body;
    expect(log).toHaveLength(1);
    expect(log[0].playerId).toBe(alice.id);
  });

  it('answers a pick sent twice at once with one 200 and one refusal', async () => {
    // On PGlite the two run one after the other; picks.race.spec.ts races
    // them on a real Postgres.
    const id = await startedDraft(await signIn(bob));
    const ids = await poolCardIds(id);

    const responses = await Promise.all([
      pick(id, ids.Shock),
      pick(id, ids.Shock),
    ]);

    expect(responses.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect((await pickLog(id)).body).toHaveLength(1);
  });

  it('fails to read the pick log as lines once someone other than Alice, Bob, Carol or a bot has picked', async () => {
    const dave = { id: '80351110224678915', name: 'Dave' };
    const daveCookie = await signIn(dave);
    const id = await readyDraft([daveCookie, aliceCookie]);
    await start(id).expect(200);
    const ids = await poolCardIds(id);

    await pick(id, ids.Shock, daveCookie).expect(200);

    await expect(pickLogLines(id)).rejects.toThrow(dave.id);
  });

  it('reads the cards picked so far, for a turn, in pick order', async () => {
    const bobCookie = await signIn(bob);
    const id = await startedDraft(bobCookie, 2);
    const ids = Object.values(await poolCardIds(id)).toSorted();
    const [first, second] = [ids.at(-1), ids[0]];
    await pick(id, first).expect(200);
    await pick(id, second, bobCookie).expect(200);

    const state = await app
      .get(PrismaService)
      .$transaction((tx) => readTurnState(tx, id));

    expect(state.picked).toEqual([first, second]);
  });

  it('is 404 for a draft that does not exist', async () => {
    await pick('no-such-draft', 'no-such-card').expect(404);
    await pickLog('no-such-draft', 404);
  });
});
