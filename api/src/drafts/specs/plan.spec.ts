import type { DraftView } from 'contract';
import { PrismaService } from '../../prisma/prisma.service.js';
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
  undo,
  enqueue,
  post,
  pickLog,
  addBot,
  importPicks,
  fourCards,
  card,
  plan,
  movePlanned,
  poolCardIds,
  waitForBotPicks,
} from './harness.js';

useDraftsApp();

describe('plan', () => {
  let carolCookie: string;

  beforeEach(async () => {
    carolCookie = await signIn(carol);
  });

  it('puts every pick a player makes by hand on their mainboard', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [],
      sideboard: [],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });

    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt']).expect(200);
    await pick(id, ids['Skewer the Critics'], carolCookie).expect(200);

    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [
        { poolCardId: ids['Lava Spike'], name: 'Lava Spike', picked: true },
        {
          poolCardId: ids['Skewer the Critics'],
          name: 'Skewer the Critics',
          picked: true,
        },
      ],
      sideboard: [],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
  });

  it('lets a player move a card to the sideboard and back', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt']).expect(200);
    await pick(id, ids['Skewer the Critics'], carolCookie).expect(200);
    const spike = {
      poolCardId: ids['Lava Spike'],
      name: 'Lava Spike',
      picked: true,
    };
    const skewer = {
      poolCardId: ids['Skewer the Critics'],
      name: 'Skewer the Critics',
      picked: true,
    };

    const moved = await movePlanned(
      id,
      ids['Lava Spike'],
      'Sideboard',
      carolCookie,
    ).expect(200);

    expect(moved.body).toEqual({
      mainboard: [skewer],
      sideboard: [spike],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [skewer],
      sideboard: [spike],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
    // Moving it there again changes nothing.
    await movePlanned(id, ids['Lava Spike'], 'Sideboard', carolCookie).expect(
      200,
    );
    const back = await movePlanned(
      id,
      ids['Lava Spike'],
      'Mainboard',
      carolCookie,
    ).expect(200);
    expect(back.body).toEqual({
      mainboard: [spike, skewer],
      sideboard: [],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
  });

  it('refuses to move a card that isn’t in the plan, or to no board', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    await pick(id, ids.Shock).expect(200);

    // Alice's pick, not Carol's.
    const refused = await movePlanned(
      id,
      ids.Shock,
      'Sideboard',
      carolCookie,
    ).expect(409);

    expect(refused.body).toEqual({
      error: 'not-in-plan',
      message: 'That card isn’t in your deck.',
    });
    await movePlanned(id, 'no-such-card', 'Sideboard', carolCookie).expect(409);
    await movePlanned(id, ids['Lava Spike'], 'Bench', carolCookie).expect(400);
    await movePlanned(id, ids['Lava Spike'], undefined, carolCookie).expect(
      400,
    );
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [
        { poolCardId: ids['Lava Spike'], name: 'Lava Spike', picked: true },
      ],
      sideboard: [],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
  });

  it('puts picks made from the queue, by a bot and by pick import on the mainboard', async () => {
    // A pick import's picks are Carol's and Alice's; the bot's come after.
    const id = await readyDraft([carolCookie, aliceCookie], 2, [
      ...fourCards,
      'Play with Fire',
      'Burst Lightning',
    ]);
    const ids = await poolCardIds(id);
    const { body: withBot } = await addBot(id, carolCookie).expect(201);
    const botId = (withBot as DraftView).players[2].id;
    await importPicks(
      id,
      [',Ann,Ben,Bot,', '->,Shock,Lightning Bolt,Skewer the Critics,'].join(
        '\n',
      ),
      [carol.id, alice.id, botId],
    ).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [{ poolCardId: ids.Shock, name: 'Shock', picked: true }],
      sideboard: [],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
    // Alice isn't an app admin, and her plan holds Lightning Bolt.
    expect((await plan(id, aliceCookie).expect(200)).body.mainboard).toEqual([
      {
        poolCardId: ids['Lightning Bolt'],
        name: 'Lightning Bolt',
        picked: true,
      },
    ]);
    await movePlanned(
      id,
      ids['Lightning Bolt'],
      'Sideboard',
      aliceCookie,
    ).expect(200);
    // The import emptied every queue, so queue this after it.
    await enqueue(id, ids['Lava Spike'], carolCookie).expect(200);

    // Unfreezing has the bot pick 4, the first available card by name; Alice's
    // pick 5 then cascades Carol's queue into pick 6.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await post(id, 'unfreeze').expect(200);
    await waitForBotPicks(1, async () => {
      const draft = (await getDraft(id).expect(200)).body as DraftView;
      expect(draft.turn?.pick).toBe(5);
    });
    const last = await pick(id, ids['Play with Fire']).expect(200);
    expect(last.body.state).toBe('Complete');

    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [
        { poolCardId: ids['Lava Spike'], name: 'Lava Spike', picked: true },
        { poolCardId: ids.Shock, name: 'Shock', picked: true },
      ],
      sideboard: [],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
    // A bot can't sign in to see its plan, but its picks land there too.
    const botPlan = await app.get(PrismaService).plannedCard.findMany({
      where: { player: { userId: botId } },
      orderBy: { pick: { number: 'asc' } },
      select: { board: true, poolCard: { select: { name: true } } },
    });
    expect(botPlan).toEqual([
      {
        board: 'Mainboard',
        poolCard: { name: 'Skewer the Critics' },
      },
      {
        board: 'Mainboard',
        poolCard: { name: 'Burst Lightning' },
      },
    ]);
  });

  it('takes an undone pick out of its player’s plan, whichever board it was on', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 3, [
      ...fourCards,
      'Play with Fire',
      'Burst Lightning',
    ]);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt']).expect(200);
    await pick(id, ids['Skewer the Critics'], carolCookie).expect(200);
    await movePlanned(
      id,
      ids['Skewer the Critics'],
      'Sideboard',
      carolCookie,
    ).expect(200);

    await undo(id, 4).expect(200);

    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [
        { poolCardId: ids['Lava Spike'], name: 'Lava Spike', picked: true },
      ],
      sideboard: [],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
    // Picked again, it lands on the mainboard, not where it was.
    await pick(id, ids['Skewer the Critics'], carolCookie).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body.mainboard).toEqual([
      { poolCardId: ids['Lava Spike'], name: 'Lava Spike', picked: true },
      {
        poolCardId: ids['Skewer the Critics'],
        name: 'Skewer the Critics',
        picked: true,
      },
    ]);
  });

  it('can be read in the lobby and changed while frozen, closed and complete', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 1, fourCards);
    const ids = await poolCardIds(id);
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [],
      sideboard: [],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
    await start(id).expect(200);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    const spike = {
      poolCardId: ids['Lava Spike'],
      name: 'Lava Spike',
      picked: true,
    };

    await post(id, 'freeze').expect(200);
    const frozen = await movePlanned(
      id,
      ids['Lava Spike'],
      'Sideboard',
      carolCookie,
    ).expect(200);
    expect(frozen.body).toEqual({
      mainboard: [],
      sideboard: [spike],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });

    await post(id, 'close').expect(200);
    const closed = await movePlanned(
      id,
      ids['Lava Spike'],
      'Mainboard',
      carolCookie,
    ).expect(200);
    expect(closed.body).toEqual({
      mainboard: [spike],
      sideboard: [],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });

    await post(id, 'reopen').expect(200);
    const lastPick = await pick(id, ids.Shock).expect(200);
    expect(lastPick.body.state).toBe('Complete');
    const complete = await movePlanned(
      id,
      ids['Lava Spike'],
      'Sideboard',
      carolCookie,
    ).expect(200);
    expect(complete.body).toEqual({
      mainboard: [],
      sideboard: [spike],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
    // The draft itself is left alone.
    expect((await getDraft(id).expect(200)).body.version).toBe(
      lastPick.body.version,
    );
  });

  it('keeps each plan private to its player, even from an app admin who isn’t in the draft', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 1, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock).expect(200);

    const refused = await plan(id, carolCookie).expect(403);

    expect(refused.body).toEqual({
      error: 'not-a-player',
      message: 'Only the draft’s players have decks.',
    });
    await movePlanned(id, ids.Shock, 'Sideboard', carolCookie).expect(403);
    // No board shows in what everyone sees, either.
    const seen = JSON.stringify([
      (await getDraft(id, carolCookie).expect(200)).body,
      (await pickLog(id)).body,
    ]);
    expect(seen).not.toMatch(/board/i);
    await plan('no-such-draft', carolCookie).expect(404);
  });

  it('sorts each board by mana value, then name', async () => {
    // Alice's picks are the fillers; Carol's, in snake order, are picks 1, 4, 5, 8 and 9.
    const fillers = [
      'Fire Ant',
      'Goblin Guide',
      'Hellspark Elemental',
      'Ironclaw Orcs',
      'Jackal Pup',
    ];
    const id = await readyDraft([carolCookie, aliceCookie], 5, [
      card('Shock', { cmc: 1 }),
      card('Fireblast', { cmc: 6 }),
      card('Lava Spike', { cmc: 1 }),
      card('Firebolt', { cmc: 1 }),
      card('Burst Lightning', { cmc: 1 }),
      ...fillers.map((name) => card(name, { cmc: 2 })),
    ]);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock, carolCookie).expect(200);
    await pick(id, ids[fillers[0]]).expect(200);
    await pick(id, ids[fillers[1]]).expect(200);
    await pick(id, ids.Fireblast, carolCookie).expect(200);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    await pick(id, ids[fillers[2]]).expect(200);
    await pick(id, ids[fillers[3]]).expect(200);
    await pick(id, ids.Firebolt, carolCookie).expect(200);
    await pick(id, ids['Burst Lightning'], carolCookie).expect(200);
    await movePlanned(id, ids.Fireblast, 'Sideboard', carolCookie).expect(200);

    const moved = await movePlanned(
      id,
      ids.Firebolt,
      'Sideboard',
      carolCookie,
    ).expect(200);

    expect(moved.body.mainboard.map((c: { name: string }) => c.name)).toEqual([
      'Burst Lightning',
      'Lava Spike',
      'Shock',
    ]);
    expect(moved.body.sideboard.map((c: { name: string }) => c.name)).toEqual([
      'Firebolt',
      'Fireblast',
    ]);
  });
});
