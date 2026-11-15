import {
  answered,
  describeRaces,
  mainboard,
  planOf,
  race,
  raceBehindLongCommit,
} from './race-harness.js';
import {
  aliceCookie,
  addToPlan,
  bob,
  bobCookie,
  carol,
  enqueue,
  pick,
  pickLogLines,
  poolCardIds,
  readyDraft,
  signIn,
  start,
} from './harness.js';

describeRaces('plan changes against a cascade', () => {
  it('adds a card the cascade then takes out of the plan, listing it on the Deck notice, or is refused once it is picked', async () => {
    // Carol neither picks nor is picked for, so only the locks order her
    // change against the cascade.
    const carolCookie = await signIn(carol);
    const id = await readyDraft([aliceCookie, bobCookie, carolCookie]);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);

    const [picked, added] = await race(
      () => pick(id, ids.Shock),
      () => addToPlan(id, ids['Lava Spike'], carolCookie),
    );

    const carols = await planOf(id, carolCookie);
    expect([
      { added: 200, mainboard: [], lost: [`Lava Spike picked by ${bob.id}`] },
      { added: '409 already-picked', mainboard: [], lost: [] },
    ]).toContainEqual({
      added: answered(added),
      mainboard: carols.mainboard.map((card) => card.name),
      lost: carols.lost.map(
        (card) => `${card.name} picked by ${card.pickedBy}`,
      ),
    });
    expect(picked.status).toBe(200);
    expect(await pickLogLines(id)).toEqual(['Alice: Shock', 'Bob: Lava Spike']);
  });

  it('adds a card once a cascade committing after Prisma’s default timeout has picked', async () => {
    // Carol neither picks nor is picked for, so only the lock holds her
    // change back, until the cascade commits.
    const carolCookie = await signIn(carol);
    const id = await readyDraft([aliceCookie, bobCookie, carolCookie]);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);

    const [picked, added] = await raceBehindLongCommit(
      () => pick(id, ids.Shock),
      () => addToPlan(id, ids['Lightning Bolt'], carolCookie),
    );

    expect(picked.status).toBe(200);
    expect(answered(added)).toBe(200);
    expect(await pickLogLines(id)).toEqual(['Alice: Shock', 'Bob: Lava Spike']);
    expect(await mainboard(id, carolCookie)).toEqual([
      'Lightning Bolt (unpicked)',
    ]);
  });
});
