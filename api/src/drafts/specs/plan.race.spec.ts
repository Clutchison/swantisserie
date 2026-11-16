import {
  answered,
  describeRaces,
  planOf,
  raceBehindLongCommit,
} from './race-harness.js';
import {
  aliceCookie,
  addBasic,
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
  it('adds a basic land once a cascade committing after Prisma’s default timeout has picked', async () => {
    // Carol neither picks nor is picked for, so only the lock holds her
    // change back, until the cascade commits.
    const carolCookie = await signIn(carol);
    const id = await readyDraft([aliceCookie, bobCookie, carolCookie]);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);

    const [picked, added] = await raceBehindLongCommit(
      () => pick(id, ids.Shock),
      () => addBasic(id, 'Mountain', carolCookie),
    );

    expect(picked.status).toBe(200);
    expect(answered(added)).toBe(200);
    expect(await pickLogLines(id)).toEqual(['Alice: Shock', 'Bob: Lava Spike']);
    expect((await planOf(id, carolCookie)).basics).toEqual([
      { land: 'Mountain', board: 'Mainboard', count: 1 },
    ]);
  });
});
