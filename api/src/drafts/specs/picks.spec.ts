import {
  alice,
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
    });
    expect((await getDraft(id).expect(200)).body.turn.playerId).toBe(bob.id);
    expect((await pickLog(id)).body).toEqual([
      {
        pick: 1,
        playerId: alice.id,
        poolCardId: ids.Shock,
        name: 'Shock',
        layout: 'normal',
        typeLine: 'Creature — Dragon',
        set: 'ima',
        collectorNumber: '1',
      },
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
    });
    expect((await pickLog(id)).body).toEqual([
      {
        pick: 1,
        playerId: alice.id,
        poolCardId: ids.Shock,
        name: 'Shock',
        layout: 'normal',
        typeLine: 'Creature — Dragon',
        set: 'ima',
        collectorNumber: '1',
      },
      {
        pick: 2,
        playerId: bob.id,
        poolCardId: ids['Lightning Bolt'],
        name: 'Lightning Bolt',
        layout: 'normal',
        typeLine: 'Creature — Dragon',
        set: 'ima',
        collectorNumber: '1',
      },
      {
        pick: 3,
        playerId: bob.id,
        poolCardId: ids['Lava Spike'],
        name: 'Lava Spike',
        layout: 'normal',
        typeLine: 'Creature — Dragon',
        set: 'ima',
        collectorNumber: '1',
      },
    ]);
  });

  it('refuses a pick out of turn, or by someone not in the draft', async () => {
    const bobCookie = await signIn(bob);
    const id = await startedDraft(bobCookie);
    const ids = await poolCardIds(id);

    const refused = await pick(id, ids.Shock, bobCookie).expect(409);
    expect(refused.body).toEqual({
      error: 'not-your-turn',
      message: 'It’s not your turn.',
    });
    await pick(id, ids.Shock, await signIn(carol)).expect(409);
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

    expect(
      (await pickLog(id)).body.map(
        ({ pick, playerId, poolCardId, name }: Record<string, unknown>) => ({
          pick,
          playerId,
          poolCardId,
          name,
        }),
      ),
    ).toEqual([
      {
        pick: 1,
        playerId: alice.id,
        poolCardId: first,
        name: 'Lightning Bolt',
      },
      { pick: 2, playerId: bob.id, poolCardId: second, name: 'Lightning Bolt' },
      { pick: 3, playerId: bob.id, poolCardId: third, name: 'Lightning Bolt' },
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
    expect(
      (await pickLog(id)).body.map((logged: { name: string }) => logged.name),
    ).toEqual(['Shock', 'Lightning Bolt']);
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

  it('is 404 for a draft that does not exist', async () => {
    await pick('no-such-draft', 'no-such-card').expect(404);
    await pickLog('no-such-draft', 404);
  });
});
