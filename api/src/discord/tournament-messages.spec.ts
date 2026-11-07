import { draftMessages } from './draft-messages.js';
import { tournamentSetUpMessage } from './tournament-messages.js';

const draft = { name: 'Red', url: 'https://roto.example/drafts/d1' };
const link = '[Open tournament](<https://roto.example/drafts/d1?tab=play>)';
const alice = { id: '80351110224678912', name: 'Alice', isBot: false };
const bot = { id: 'bot:5f0c', name: 'Bot 1', isBot: true };

/** A player with a Discord user id `n` above Alice's. */
function player(n: number) {
  return { id: String(80351110224678912n + BigInt(n)), name: `P${n}` };
}

describe('tournamentSetUpMessage', () => {
  it('tells the humans they’re in, that they can leave on the Play tab and that decks lock at Start, never pinging a bot', () => {
    expect(tournamentSetUpMessage(draft, 'Swiss', [alice, bot])).toEqual({
      content:
        '**Red**’s Swiss tournament is in registration, and every player has joined.\n' +
        `<@${alice.id}> you’re in. If you won’t play, leave on the Play tab. Decks lock when the tournament starts. ${link}`,
      allowed_mentions: { parse: [], users: [alice.id] },
    });
  });

  it('pings nobody when every player is a bot', () => {
    expect(tournamentSetUpMessage(draft, 'Swiss', [bot])).toEqual({
      content:
        '**Red**’s Swiss tournament is in registration, and every player has joined.\n' +
        `If you won’t play, leave on the Play tab. Decks lock when the tournament starts. ${link}`,
      allowed_mentions: { parse: [], users: [] },
    });
  });
});

describe('a completed tournament round too long for one post', () => {
  // Far more matches than a draft has players, to pass 2000 characters.
  const matches = Array.from({ length: 60 }, (_, i) => {
    const [first, second] = [player(2 * i), player(2 * i + 1)];
    return [
      { ...first, isBot: false },
      { ...second, isBot: false },
    ] as [typeof alice, typeof alice];
  });
  const messages = draftMessages(draft, [
    { type: 'tournament-round-completed', round: 2, matches, byes: [] },
  ]);

  it('splits between lines, each post within 2000 characters', () => {
    expect(messages.length).toBeGreaterThan(1);
    for (const { content } of messages) {
      expect(content.length).toBeLessThanOrEqual(2000);
    }
    expect(messages.flatMap(({ content }) => content.split('\n'))).toEqual([
      'Tournament round 1 of **Red**’s tournament is complete. Tournament round 2:',
      ...matches.map(([a, b]) => `<@${a.id}> vs <@${b.id}>`),
      link,
    ]);
  });
});
