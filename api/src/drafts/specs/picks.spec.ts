import request from 'supertest';
import {
  alice,
  bob,
  carol,
  app,
  aliceCookie,
  useDraftsApp,
  signIn,
  getDraft,
  readyDraft,
  start,
  pick,
} from './harness.js';

useDraftsApp();

describe('picks', () => {
  /**
   * A started draft of Alice then Bob, over Shock, Lightning Bolt, Lava
   * Spike and Skewer the Critics.
   */
  async function startedDraft(bobCookie: string, picksPerPlayer = 1) {
    const id = await readyDraft([aliceCookie, bobCookie], picksPerPlayer, [
      'Shock',
      'Lightning Bolt',
      'Lava Spike',
      'Skewer the Critics',
    ]);
    await start(id).expect(200);
    return id;
  }

  function picks(id: string, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .get(`/api/drafts/${id}/picks`)
      .set('Cookie', cookie);
  }

  it('lets the player whose turn it is pick a card, and the turn passes on', async () => {
    const id = await startedDraft(await signIn(bob));

    const picked = await pick(id, 'shock-oracle').expect(200);

    expect(picked.body.turn).toEqual({
      pick: 2,
      round: 1,
      playerId: bob.id,
    });
    expect((await getDraft(id).expect(200)).body.turn.playerId).toBe(bob.id);
    expect((await picks(id).expect(200)).body).toEqual([
      {
        pick: 1,
        playerId: alice.id,
        oracleId: 'shock-oracle',
        name: 'Shock',
        layout: 'normal',
        set: 'ima',
        collectorNumber: '1',
      },
    ]);
  });

  it('follows snake order across rounds, logging every pick', async () => {
    const bobCookie = await signIn(bob);
    const id = await startedDraft(bobCookie, 2);

    await pick(id, 'shock-oracle').expect(200);
    await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);
    const third = await pick(id, 'lava-spike-oracle', bobCookie).expect(200);

    expect(third.body.turn).toEqual({
      pick: 4,
      round: 2,
      playerId: alice.id,
    });
    expect((await picks(id).expect(200)).body).toEqual([
      {
        pick: 1,
        playerId: alice.id,
        oracleId: 'shock-oracle',
        name: 'Shock',
        layout: 'normal',
        set: 'ima',
        collectorNumber: '1',
      },
      {
        pick: 2,
        playerId: bob.id,
        oracleId: 'lightning-bolt-oracle',
        name: 'Lightning Bolt',
        layout: 'normal',
        set: 'ima',
        collectorNumber: '1',
      },
      {
        pick: 3,
        playerId: bob.id,
        oracleId: 'lava-spike-oracle',
        name: 'Lava Spike',
        layout: 'normal',
        set: 'ima',
        collectorNumber: '1',
      },
    ]);
  });

  it('refuses a pick out of turn, or by someone not in the draft', async () => {
    const bobCookie = await signIn(bob);
    const id = await startedDraft(bobCookie);

    const refused = await pick(id, 'shock-oracle', bobCookie).expect(409);
    expect(refused.body).toEqual({
      error: 'not-your-turn',
      message: 'It’s not your turn.',
    });
    await pick(id, 'shock-oracle', await signIn(carol)).expect(409);
    expect((await picks(id).expect(200)).body).toEqual([]);
  });

  it('refuses a card that has already been picked', async () => {
    const bobCookie = await signIn(bob);
    const id = await startedDraft(bobCookie);
    await pick(id, 'shock-oracle').expect(200);

    const refused = await pick(id, 'shock-oracle', bobCookie).expect(409);

    expect(refused.body).toEqual({
      error: 'already-picked',
      message: 'That card has already been picked.',
    });
    expect((await getDraft(id).expect(200)).body.turn.playerId).toBe(bob.id);
  });

  it('refuses a card that is not in the pool', async () => {
    const id = await startedDraft(await signIn(bob));

    const refused = await pick(id, 'shivan-dragon-oracle').expect(404);

    expect(refused.body).toEqual({
      error: 'not-in-pool',
      message: 'That card isn’t in this pool.',
    });
    await pick(id, '').expect(400);
    await pick(id, 42).expect(400);
  });

  it('refuses picks before the draft starts', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)]);

    const refused = await pick(id, 'shock-oracle').expect(409);

    expect(refused.body).toEqual({
      error: 'not-drafting',
      message: 'This draft isn’t taking picks.',
    });
  });

  it('completes the draft with the last pick, and keeps it viewable', async () => {
    const bobCookie = await signIn(bob);
    const id = await startedDraft(bobCookie);
    await pick(id, 'shock-oracle').expect(200);

    const last = await pick(id, 'lightning-bolt-oracle', bobCookie).expect(200);

    expect(last.body).toMatchObject({ state: 'Complete', turn: null });
    expect((await getDraft(id).expect(200)).body.state).toBe('Complete');
    const listed = await request(app.getHttpServer())
      .get('/api/drafts')
      .set('Cookie', aliceCookie)
      .expect(200);
    expect(
      listed.body.find((draft: { id: string }) => draft.id === id).state,
    ).toBe('Complete');
    expect(
      (await picks(id).expect(200)).body.map(
        (logged: { name: string }) => logged.name,
      ),
    ).toEqual(['Shock', 'Lightning Bolt']);
    const refused = await pick(id, 'lava-spike-oracle').expect(409);
    expect(refused.body.error).toBe('not-drafting');
  });

  it('makes concurrent picks one at a time, so only one of a player’s double pick lands', async () => {
    const id = await startedDraft(await signIn(bob));

    const responses = await Promise.all([
      pick(id, 'shock-oracle'),
      pick(id, 'lightning-bolt-oracle'),
    ]);

    expect(responses.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    const log = (await picks(id).expect(200)).body;
    expect(log).toHaveLength(1);
    expect(log[0].playerId).toBe(alice.id);
  });

  it('takes a pick sent twice at once only once', async () => {
    const id = await startedDraft(await signIn(bob));

    const responses = await Promise.all([
      pick(id, 'shock-oracle'),
      pick(id, 'shock-oracle'),
    ]);

    expect(responses.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect((await picks(id).expect(200)).body).toHaveLength(1);
  });

  it('is 404 for a draft that does not exist', async () => {
    await pick('no-such-draft', 'shock-oracle').expect(404);
    await picks('no-such-draft').expect(404);
  });
});
