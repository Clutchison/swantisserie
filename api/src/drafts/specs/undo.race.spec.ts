import {
  aliceThenBob,
  answered,
  bobCookie,
  describeRaces,
  mainboard,
  race,
  sortedAnswers,
} from './race-harness.js';
import { aliceCookie, pick, pickLogLines, undo } from './harness.js';

describeRaces('undo', () => {
  it('lets a pick land on the pick before it, or the undo take that back and the pick be refused', async () => {
    const { id, ids } = await aliceThenBob();
    await pick(id, ids.Shock).expect(200);

    const [picked, undone] = await race(
      () => pick(id, ids['Lightning Bolt'], bobCookie),
      () => undo(id, 1),
    );

    expect([
      {
        picked: 200,
        undone: '409 not-latest',
        log: ['Alice: Shock', 'Bob: Lightning Bolt'],
        alice: ['Shock'],
        bob: ['Lightning Bolt'],
      },
      {
        picked: '409 not-your-turn',
        undone: 200,
        log: [],
        alice: [],
        bob: [],
      },
    ]).toContainEqual({
      picked: answered(picked),
      undone: answered(undone),
      log: await pickLogLines(id),
      alice: await mainboard(id, aliceCookie),
      bob: await mainboard(id, bobCookie),
    });
  });

  it('takes back one pick for an undo sent twice', async () => {
    const { id, ids } = await aliceThenBob();
    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);

    const answers = await race(
      () => undo(id, 2),
      () => undo(id, 2),
    );

    expect(sortedAnswers(answers)).toEqual([200, '409 not-latest']);
    expect(await pickLogLines(id)).toEqual(['Alice: Shock']);
    expect(await mainboard(id, aliceCookie)).toEqual(['Shock']);
    expect(await mainboard(id, bobCookie)).toEqual([]);
  });
});
