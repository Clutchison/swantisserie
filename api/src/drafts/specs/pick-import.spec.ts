import type { DraftView } from 'contract';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  alice,
  bob,
  carol,
  app,
  aliceCookie,
  webhookClient,
  useDraftsApp,
  signIn,
  getDraft,
  readyDraft,
  pickLog,
  pickedIds,
  pickedNames,
  pool,
  undo,
  poolCardIds,
  copyIds,
  importPicks,
  queue,
  join,
  leave,
  setSeats,
  registerWebhook,
  post,
  announcementsSettled,
  addBot,
  draftsRequest,
  queueInLobby,
} from './harness.js';

useDraftsApp();

describe('pick import', () => {
  /** The seat order a preview of Alice then Bob showed, to confirm the file with. */
  const previewed = [alice.id, bob.id];

  /** Made up: 'Ann' and 'Ben' are not the draft's players' names. */
  const csv = [
    ',Ann,Ben,',
    '->,Ash Golem,Brine Wisp,',
    ',,Cinder Hound,<-',
  ].join('\n');
  const cards = ['Ash Golem', 'Brine Wisp', 'Cinder Hound', 'Dusk Heron'];

  it('starts the draft frozen, with fixed seats, the picks logged and the turn on the next player', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    const before = await getDraft(id).expect(200);

    const answer = await importPicks(id, csv, previewed).expect(200);

    expect(answer.body.state).toBe('Frozen');
    expect(answer.body.version).toBe(before.body.version + 1);
    expect(answer.body.players.map((p: { id: string }) => p.id)).toEqual([
      alice.id,
      bob.id,
    ]);
    expect(answer.body.turn).toEqual({
      pick: 4,
      round: 2,
      playerId: alice.id,
      picksLeftOnTurn: 1,
    });
    const log = await pickLog(id);
    const names = await pickedNames(id);
    expect(
      log.body.map((pick: { pick: number; playerId: string }, i: number) => [
        pick.pick,
        pick.playerId,
        names[i],
      ]),
    ).toEqual([
      [1, alice.id, 'Ash Golem'],
      [2, bob.id, 'Brine Wisp'],
      [3, bob.id, 'Cinder Hound'],
    ]);
  });

  it('takes a different copy for each use of a card’s name', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, [
      'Ash Golem',
      'Ash Golem',
      'Brine Wisp',
      'Cinder Hound',
    ]);
    const copies = await copyIds(id);

    await importPicks(
      id,
      ',Ann,Ben,\n->,Ash Golem,Ash Golem,\n,,Brine Wisp,<-',
      previewed,
    ).expect(200);

    expect((await pickedIds(id)).slice(0, 2).sort()).toEqual(
      [...copies['Ash Golem']].sort(),
    );
  });

  it('takes this draft’s copies of the cards, beside another draft whose pool shares their names', async () => {
    // Made first, so a pool read across drafts would meet its copies first.
    await readyDraft([await signIn(carol)], 2, cards);
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);

    await importPicks(id, csv, previewed).expect(200);

    // pickedNames throws on a pick of a card outside this draft's pool.
    expect(await pickedNames(id)).toEqual([
      'Ash Golem',
      'Brine Wisp',
      'Cinder Hound',
    ]);
  });

  it('gives the picks what the exports need of them', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);

    await importPicks(id, csv, previewed).expect(200);

    const [first] = (await pickLog(id)).body;
    const card = (await pool(id).expect(200)).body.find(
      (poolCard: { id: string }) => poolCard.id === first.poolCardId,
    );
    expect(card.set).toEqual(expect.any(String));
    expect(card.collectorNumber).toEqual(expect.any(String));
  });

  it('times every pick at the pick import', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);
    const before = Date.now();

    await importPicks(id, csv, previewed).expect(200);

    const picks = await app
      .get(PrismaService)
      .pick.findMany({ where: { draftId: id } });
    const times = new Set(picks.map((pick) => pick.createdAt.getTime()));
    expect(times.size).toBe(1);
    expect([...times][0]).toBeGreaterThanOrEqual(before - 1000);
  });

  it('empties every player’s queue', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    const ids = await poolCardIds(id);
    // Queues already filled in the lobby.
    for (const user of [alice, bob]) {
      await queueInLobby(id, user, ids['Dusk Heron']);
    }

    await importPicks(id, csv, previewed).expect(200);

    for (const cookie of [aliceCookie, bobCookie]) {
      expect((await queue(id, cookie).expect(200)).body.cards).toEqual([]);
    }
  });

  it('is for the organizer and app admins, not other guild members', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);

    await importPicks(id, csv, previewed, bobCookie).expect(403);
    expect((await getDraft(id).expect(200)).body.state).toBe('Lobby');

    await importPicks(id, csv, previewed, await signIn(carol)).expect(200);
  });

  it('refuses a file no longer valid, with its problems, and changes nothing', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 2, [
      ...cards,
      'Ember Stag',
      'Frost Newt',
    ]);
    // Someone joins after the file was previewed.
    await join(id, await signIn(carol)).expect(201);
    const before = await getDraft(id).expect(200);

    const refused = await importPicks(id, csv, previewed).expect(422);

    expect(refused.body).toEqual({
      error: 'invalid-pick-import',
      message: 'This file can’t be imported.',
      problems: ['The file has 2 player columns, but the draft has 3 players.'],
    });
    expect((await getDraft(id).expect(200)).body).toEqual(before.body);
    expect((await pickLog(id)).body).toEqual([]);
  });

  it('refuses the file if the seats changed after the preview, and changes nothing', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await setSeats(id, [bob.id, alice.id]).expect(200);
    const before = await getDraft(id).expect(200);

    const refused = await importPicks(id, csv, previewed).expect(422);

    expect(refused.body.problems).toEqual([
      'The seats have changed since the preview. Choose the file again to check it.',
    ]);
    expect((await getDraft(id).expect(200)).body).toEqual(before.body);
    expect((await pickLog(id)).body).toEqual([]);
  });

  it('refuses a seat list with more seats than the file has columns, and changes nothing', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);
    const before = await getDraft(id).expect(200);

    const refused = await importPicks(id, csv, [...previewed, carol.id]).expect(
      422,
    );

    expect(refused.body.error).toBe('invalid-pick-import');
    expect((await getDraft(id).expect(200)).body).toEqual(before.body);
    expect((await pickLog(id)).body).toEqual([]);
  });

  it('refuses the file if a player left and another joined after the preview', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await leave(id, bobCookie).expect(200);
    await join(id, await signIn(carol)).expect(201);

    const refused = await importPicks(id, csv, previewed).expect(422);

    expect(refused.body.error).toBe('invalid-pick-import');
    expect((await pickLog(id)).body).toEqual([]);
  });

  it('refuses a second pick import, as the draft has left the lobby', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);
    await importPicks(id, csv, previewed).expect(200);

    const refused = await importPicks(id, csv, previewed).expect(409);

    expect(refused.body.error).toBe('draft-started');
    expect((await pickLog(id)).body).toHaveLength(3);
  });

  it('refuses a draft that fails the start checks', async () => {
    const id = await readyDraft([aliceCookie], 1, cards);

    const refused = await importPicks(id, csv, previewed).expect(409);

    expect(refused.body.error).toBe('player-count');
  });

  it('answers 404 for a draft that does not exist', async () => {
    await importPicks('no-such-draft', csv, previewed).expect(404);
  });

  it('refuses a request with no file text', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);

    await importPicks(id, undefined, previewed).expect(400);
  });

  it('refuses a seat order sent as userIds rather than playerIds', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);

    const refused = await draftsRequest(
      'post',
      `/${id}/pick-import`,
      aliceCookie,
      {
        csv,
        userIds: previewed,
      },
    ).expect(400);
    expect(refused.body).toEqual({
      error: 'invalid',
      message: 'List each player once, in seat order.',
    });
  });

  it('posts no announcement and makes no queued or bot picks; the unfreeze announces and pings', async () => {
    const webhookId = await registerWebhook();
    // Seats: Alice, the bot; three picks each.
    const id = await readyDraft(
      [aliceCookie],
      3,
      [...cards, 'Ember Lynx', 'Frost Imp'],
      webhookId,
    );
    const { body: withBot } = await addBot(id, await signIn(carol)).expect(201);
    const bot = (withBot as DraftView).players[1];
    // Unless the import empties them, these are Alice's picks 4 and 5, then the bot picks 6.
    const ids = await poolCardIds(id);
    // Already queued in the lobby.
    await queueInLobby(id, alice, ids['Dusk Heron'], ids['Ember Lynx']);

    await importPicks(id, csv, [alice.id, bot.id]).expect(200);

    await announcementsSettled(id);
    expect(webhookClient.post).not.toHaveBeenCalled();
    expect((await pickLog(id)).body).toHaveLength(3);

    await post(id, 'unfreeze').expect(200);

    await announcementsSettled(id);
    expect((await pickLog(id)).body).toHaveLength(3);
    expect(webhookClient.post).toHaveBeenCalledOnce();
    const [, message] = webhookClient.post.mock.calls[0];
    expect(message.content).toContain(`<@${alice.id}>`);
    expect(message.allowed_mentions.users).toEqual([alice.id]);
  });

  it('undoes imported picks from the latest back', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);
    await importPicks(id, csv, previewed).expect(200);

    await undo(id, 2).expect(409);
    const answer = await undo(id, 3).expect(200);

    expect(answer.body.turn.playerId).toBe(bob.id);
    expect(answer.body.turn.pick).toBe(3);
    await undo(id, 2).expect(200);
    await undo(id, 1).expect(200);
    expect((await pickLog(id)).body).toEqual([]);
  });
});
