import {
  card,
  poolCardIds,
  readyDraft,
  aliceCookie,
  carol,
  useDraftsApp,
  signIn,
  readyDraftWithCopies,
  start,
  post,
  pick,
  addToPlan,
  movePlanned,
  enqueue,
  queue,
  queueUnpicked,
  bob,
  removeFromQueue,
  reorderQueue,
  removeFromPlan,
  undo,
  copyIds,
  importPicks,
  alice,
} from './harness.js';

useDraftsApp();

describe('queueing a plan’s unpicked cards', () => {
  let carolCookie: string;

  beforeEach(async () => {
    carolCookie = await signIn(carol);
  });

  /**
   * A draft in the lobby where Carol's plan holds both copies of Lightning
   * Bolt and Shock on her mainboard, and Lava Spike on her sideboard; her
   * queue already holds the second Bolt.
   */
  async function plannedDraft() {
    const draft = await readyDraftWithCopies([carolCookie, aliceCookie], 2);
    const { id, ids, first, second } = draft;
    for (const card of [ids.Shock, first, second, ids['Lava Spike']]) {
      await addToPlan(id, card, carolCookie).expect(200);
    }
    await movePlanned(id, ids['Lava Spike'], 'Sideboard', carolCookie).expect(
      200,
    );
    await enqueue(id, second, carolCookie).expect(200);
    return draft;
  }

  it('appends the mainboard’s unpicked copies in plan order, skipping the copies already queued', async () => {
    const { id, ids, first, second } = await plannedDraft();

    const queued = await queueUnpicked(
      id,
      { includeSideboard: false },
      carolCookie,
    ).expect(200);

    const bolt = (poolCardId: string) => ({
      poolCardId,
      name: 'Lightning Bolt',
    });
    expect(queued.body.cards).toEqual([
      bolt(second),
      bolt(first),
      { poolCardId: ids.Shock, name: 'Shock' },
    ]);
    expect((await queue(id, carolCookie).expect(200)).body.cards).toEqual(
      queued.body.cards,
    );
  });

  it('queues by mana value, then name', async () => {
    const id = await readyDraft([carolCookie], 2, [
      card('Fireblast', { cmc: 6 }),
      card('Shock', { cmc: 1 }),
      card('Lava Axe', { cmc: 5 }),
      card('Burst Lightning', { cmc: 1 }),
    ]);
    const ids = await poolCardIds(id);
    for (const name of ['Fireblast', 'Shock', 'Lava Axe', 'Burst Lightning']) {
      await addToPlan(id, ids[name], carolCookie).expect(200);
    }

    const queued = await queueUnpicked(
      id,
      { includeSideboard: false },
      carolCookie,
    ).expect(200);

    expect(queued.body.cards.map((c: { name: string }) => c.name)).toEqual([
      'Burst Lightning',
      'Shock',
      'Lava Axe',
      'Fireblast',
    ]);
  });

  it('appends the sideboard’s unpicked copies after the mainboard’s when asked to', async () => {
    const { id, ids, first, second } = await plannedDraft();

    const queued = await queueUnpicked(
      id,
      { includeSideboard: true },
      carolCookie,
    ).expect(200);

    expect(
      queued.body.cards.map((card: { poolCardId: string }) => card.poolCardId),
    ).toEqual([second, first, ids.Shock, ids['Lava Spike']]);
    // Everything is queued already, so a second go adds nothing.
    const again = await queueUnpicked(
      id,
      { includeSideboard: true },
      carolCookie,
    ).expect(200);
    expect(again.body.cards).toEqual(queued.body.cards);
  });

  it('leaves out picks', async () => {
    const { id, ids, first } = await readyDraftWithCopies(
      [carolCookie, aliceCookie],
      2,
    );
    await addToPlan(id, first, carolCookie).expect(200);
    await start(id).expect(200);
    // Carol picks first, and her pick lands in her plan.
    await pick(id, ids.Shock, carolCookie).expect(200);

    const queued = await queueUnpicked(
      id,
      { includeSideboard: true },
      carolCookie,
    ).expect(200);

    expect(queued.body.cards).toEqual([
      { poolCardId: first, name: 'Lightning Bolt' },
    ]);
  });

  it('refuses on the player’s own turn, and once the draft is closed', async () => {
    const { id, first } = await readyDraftWithCopies(
      [carolCookie, aliceCookie],
      2,
    );
    await addToPlan(id, first, carolCookie).expect(200);
    await start(id).expect(200);

    // Carol has the first turn, with nothing queued to pick for her.
    const yourTurn = await queueUnpicked(
      id,
      { includeSideboard: false },
      carolCookie,
    ).expect(409);
    expect(yourTurn.body).toEqual({
      error: 'your-turn',
      message: 'You can’t add to your queue on your turn.',
    });
    await post(id, 'close').expect(200);
    const closed = await queueUnpicked(
      id,
      { includeSideboard: false },
      carolCookie,
    ).expect(409);
    expect(closed.body.error).toBe('draft-closed');
    const queued = await queue(id, carolCookie).expect(200);
    expect(queued.body.cards).toEqual([]);
  });

  it('refuses once the draft is complete', async () => {
    const { id, ids, first } = await readyDraftWithCopies([
      carolCookie,
      aliceCookie,
    ]);
    await addToPlan(id, first, carolCookie).expect(200);
    await start(id).expect(200);
    await pick(id, ids.Shock, carolCookie).expect(200);
    await pick(id, ids['Lava Spike']).expect(200);

    const refused = await queueUnpicked(
      id,
      { includeSideboard: false },
      carolCookie,
    ).expect(409);

    expect(refused.body.error).toBe('draft-complete');
  });

  it('is for every player, and needs to know whether to include the sideboard', async () => {
    const { id, ids } = await plannedDraft();
    // Alice isn't an app admin; her plan holds only Shock.
    await addToPlan(id, ids.Shock, aliceCookie).expect(200);

    const alicesQueue = await queueUnpicked(
      id,
      { includeSideboard: false },
      aliceCookie,
    ).expect(200);

    expect(alicesQueue.body.cards).toEqual([
      { poolCardId: ids.Shock, name: 'Shock' },
    ]);
    await queueUnpicked(id, {}, carolCookie).expect(400);
    await queueUnpicked(id, { includeSideboard: 'yes' }, carolCookie).expect(
      400,
    );
  });

  describe('in queue order', () => {
    let bobCookie: string;

    beforeEach(async () => {
      bobCookie = await signIn(bob);
    });

    /**
     * Cards of the same mana value, so plan order is name order, with two
     * copies of Lightning Bolt.
     */
    const cards = [
      'Burst Lightning',
      'Fireblast',
      'Lava Axe',
      'Lava Spike',
      'Lightning Bolt',
      'Lightning Bolt',
      'Searing Spear',
      'Shock',
      'Skewer the Critics',
    ];

    /**
     * A draft in the lobby of `cards`, seated Carol, Alice, Bob, two picks
     * each, where Carol's plan holds `planned` on her mainboard. Answers with
     * its pool card ids by name, and Lightning Bolt's two copies as `first`
     * and `second`; `planned` names the first.
     */
    async function plannedLobby(...planned: string[]) {
      const id = await readyDraft([carolCookie, aliceCookie, bobCookie], 2, [
        ...cards,
      ]);
      const [first, second] = (await copyIds(id))['Lightning Bolt'];
      const ids: Record<string, string> = {
        ...(await poolCardIds(id)),
        'Lightning Bolt': first,
      };
      for (const name of planned) {
        await addToPlan(id, ids[name], carolCookie).expect(200);
      }
      return { id, ids, first, second };
    }

    /**
     * The draft `plannedLobby` makes, started, where Carol has made the
     * first pick, Searing Spear, so it is Alice's turn.
     */
    async function startedDraft(...planned: string[]) {
      const draft = await plannedLobby(...planned);
      await start(draft.id).expect(200);
      await pick(draft.id, draft.ids['Searing Spear'], carolCookie).expect(200);
      return draft;
    }

    /** Carol queues `names`, in order. */
    async function carolQueues(
      id: string,
      ids: Record<string, string>,
      ...names: string[]
    ) {
      for (const name of names) {
        await enqueue(id, ids[name], carolCookie).expect(200);
      }
    }

    /** The names in Carol's queue once she queues her plan's unpicked cards. */
    async function queuedUnpicked(id: string, includeSideboard = true) {
      const queued = await queueUnpicked(
        id,
        { includeSideboard },
        carolCookie,
      ).expect(200);
      return queued.body.cards.map((c: { name: string }) => c.name);
    }

    it('puts back cards a pick cleared in the order they were queued, ahead of the cards never queued', async () => {
      const { id, ids } = await startedDraft(
        'Burst Lightning',
        'Fireblast',
        'Lava Axe',
        'Shock',
        'Skewer the Critics',
      );
      await carolQueues(id, ids, 'Skewer the Critics', 'Shock', 'Lava Axe');
      // Alice picks Shock: lost from Carol's queue and plan, clearing the rest.
      await pick(id, ids.Shock).expect(200);

      expect(await queuedUnpicked(id)).toEqual([
        'Skewer the Critics',
        'Lava Axe',
        'Burst Lightning',
        'Fireblast',
      ]);
    });

    it('puts the cards that left the queue most recently first, each departure in the order its cards sat', async () => {
      const { id, ids } = await startedDraft(
        'Fireblast',
        'Lava Axe',
        'Lava Spike',
        'Lightning Bolt',
        'Shock',
        'Skewer the Critics',
      );
      await carolQueues(id, ids, 'Skewer the Critics', 'Lava Spike');
      // Alice's pick clears Skewer the Critics.
      await pick(id, ids['Lava Spike']).expect(200);
      await carolQueues(id, ids, 'Lava Axe', 'Fireblast', 'Shock');
      // Bob's pick clears Lava Axe and Fireblast, after.
      await pick(id, ids.Shock, bobCookie).expect(200);

      expect(await queuedUnpicked(id)).toEqual([
        'Lava Axe',
        'Fireblast',
        'Skewer the Critics',
        'Lightning Bolt',
      ]);
    });

    it('remembers where a card sat when the player took it out of their queue', async () => {
      const { id, ids } = await plannedLobby(
        'Fireblast',
        'Shock',
        'Skewer the Critics',
      );
      await carolQueues(id, ids, 'Skewer the Critics', 'Shock');
      await removeFromQueue(id, ids['Skewer the Critics'], carolCookie).expect(
        200,
      );

      // Shock is still queued, so it stays where it is.
      expect(await queuedUnpicked(id)).toEqual([
        'Shock',
        'Skewer the Critics',
        'Fireblast',
      ]);
    });

    it('remembers where cards sat in a queue a pick import emptied', async () => {
      const { id, ids } = await plannedLobby(
        'Fireblast',
        'Lava Axe',
        'Shock',
        'Skewer the Critics',
      );
      await carolQueues(id, ids, 'Skewer the Critics', 'Shock');
      const csv = [
        ',Cal,Ann,Ben,',
        '->,Searing Spear,Lava Spike,Burst Lightning,',
      ].join('\n');
      // The import leaves it Bob's turn.
      await importPicks(id, csv, [carol.id, alice.id, bob.id]).expect(200);

      expect(await queuedUnpicked(id)).toEqual([
        'Skewer the Critics',
        'Shock',
        'Fireblast',
        'Lava Axe',
      ]);
    });

    it('takes only the player’s own queued cards in a pick import’s departure, not another player’s', async () => {
      const { id, ids } = await plannedLobby('Fireblast', 'Lava Axe');
      // Carol never queued Lava Axe, so it must stay after Fireblast.
      await enqueue(id, ids['Lava Axe'], bobCookie).expect(200);
      const csv = [
        ',Cal,Ann,Ben,',
        '->,Searing Spear,Lava Spike,Burst Lightning,',
      ].join('\n');
      await importPicks(id, csv, [carol.id, alice.id, bob.id]).expect(200);

      expect(await queuedUnpicked(id)).toEqual(['Fireblast', 'Lava Axe']);
    });

    it('keeps a reordered queue’s order once the cards leave it', async () => {
      const { id, ids } = await startedDraft(
        'Fireblast',
        'Lava Axe',
        'Shock',
        'Skewer the Critics',
      );
      await carolQueues(id, ids, 'Skewer the Critics', 'Fireblast', 'Lava Axe');
      await reorderQueue(
        id,
        [ids['Lava Axe'], ids['Skewer the Critics'], ids.Fireblast],
        carolCookie,
      ).expect(200);
      await carolQueues(id, ids, 'Shock');
      await pick(id, ids.Shock).expect(200);

      expect(await queuedUnpicked(id)).toEqual([
        'Lava Axe',
        'Skewer the Critics',
        'Fireblast',
      ]);
    });

    it('takes the order from the clear after an undo, not the undone one', async () => {
      const { id, ids } = await startedDraft(
        'Burst Lightning',
        'Fireblast',
        'Shock',
        'Skewer the Critics',
      );
      await carolQueues(id, ids, 'Skewer the Critics', 'Fireblast', 'Shock');
      await pick(id, ids.Shock).expect(200);
      // The undo puts Carol's queue back as it was, and it is Alice's turn again.
      await undo(id, 2).expect(200);
      await reorderQueue(
        id,
        [ids.Fireblast, ids['Skewer the Critics'], ids.Shock],
        carolCookie,
      ).expect(200);
      await pick(id, ids.Shock).expect(200);

      expect(await queuedUnpicked(id)).toEqual([
        'Fireblast',
        'Skewer the Critics',
        'Burst Lightning',
      ]);
    });

    it('keeps a card’s order when another player’s pick swaps it for another copy', async () => {
      const { id, ids, first, second } = await startedDraft(
        'Burst Lightning',
        'Lightning Bolt',
      );
      await carolQueues(id, ids, 'Lightning Bolt');
      await removeFromQueue(id, first, carolCookie).expect(200);
      // Alice picks the first Bolt, and Carol's plan swaps it for the second.
      await pick(id, first).expect(200);

      const queued = await queueUnpicked(
        id,
        { includeSideboard: true },
        carolCookie,
      ).expect(200);
      expect(queued.body.cards).toEqual([
        { poolCardId: second, name: 'Lightning Bolt' },
        { poolCardId: ids['Burst Lightning'], name: 'Burst Lightning' },
      ]);
    });

    it('doesn’t take a card’s order from another copy that left the queue', async () => {
      const { id, second } = await plannedLobby(
        'Burst Lightning',
        'Lightning Bolt',
      );
      await enqueue(id, second, carolCookie).expect(200);
      await removeFromQueue(id, second, carolCookie).expect(200);

      expect(await queuedUnpicked(id)).toEqual([
        'Burst Lightning',
        'Lightning Bolt',
      ]);
    });

    it('forgets the order of a card taken out of the plan and added back', async () => {
      const { id, ids } = await plannedLobby('Fireblast', 'Skewer the Critics');
      const skewer = ids['Skewer the Critics'];
      await carolQueues(id, ids, 'Skewer the Critics');
      await removeFromQueue(id, skewer, carolCookie).expect(200);
      await removeFromPlan(id, skewer, carolCookie).expect(200);
      await addToPlan(id, skewer, carolCookie).expect(200);

      expect(await queuedUnpicked(id)).toEqual([
        'Fireblast',
        'Skewer the Critics',
      ]);
    });

    it('puts a sideboard card with an order ahead of mainboard cards without one, when the sideboard is included', async () => {
      /** Carol's plan with Skewer the Critics, then Lava Axe, out of her queue. */
      async function departedDraft() {
        const draft = await plannedLobby(
          'Fireblast',
          'Lava Axe',
          'Skewer the Critics',
        );
        const { id, ids } = draft;
        await movePlanned(
          id,
          ids['Skewer the Critics'],
          'Sideboard',
          carolCookie,
        ).expect(200);
        await carolQueues(id, ids, 'Lava Axe', 'Skewer the Critics');
        await removeFromQueue(id, ids['Lava Axe'], carolCookie).expect(200);
        await removeFromQueue(
          id,
          ids['Skewer the Critics'],
          carolCookie,
        ).expect(200);
        return draft;
      }

      const withSideboard = await departedDraft();
      expect(await queuedUnpicked(withSideboard.id, true)).toEqual([
        'Skewer the Critics',
        'Lava Axe',
        'Fireblast',
      ]);
      const mainboardOnly = await departedDraft();
      expect(await queuedUnpicked(mainboardOnly.id, false)).toEqual([
        'Lava Axe',
        'Fireblast',
      ]);
    });
  });
});
