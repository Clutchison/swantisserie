import {
  aliceThenBob,
  describeRaces,
  mainboard,
  race,
  sortedAnswers,
} from './race-harness.js';
import { aliceCookie, pick, pickLogLines } from './harness.js';

describeRaces('picks', () => {
  it('takes one of a player’s two picks of different cards in one turn', async () => {
    const { id, ids } = await aliceThenBob();
    const cards = ['Shock', 'Lightning Bolt'];

    const answers = await race(
      () => pick(id, ids[cards[0]]),
      () => pick(id, ids[cards[1]]),
    );

    const landed = cards[answers.findIndex((res) => res.status === 200)];
    expect(sortedAnswers(answers)).toEqual([200, '409 not-your-turn']);
    expect(await pickLogLines(id)).toEqual([`Alice: ${landed}`]);
    expect(await mainboard(id, aliceCookie)).toEqual([landed]);
  });

  it('takes a pick sent twice at once only once', async () => {
    const { id, ids } = await aliceThenBob();

    const answers = await race(
      () => pick(id, ids.Shock),
      () => pick(id, ids.Shock),
    );

    expect(sortedAnswers(answers)).toEqual([200, '409 not-your-turn']);
    expect(await pickLogLines(id)).toEqual(['Alice: Shock']);
    expect(await mainboard(id, aliceCookie)).toEqual(['Shock']);
  });
});
