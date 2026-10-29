import {
  draftCompleteMessage,
  draftStartedMessage,
  pickMessage,
} from './draft-messages.js';

const draft = { name: 'Red', url: 'https://roto.example/drafts/d1' };
const alice = { id: '80351110224678912', name: 'Alice', isBot: false };
const bob = { id: '80351110224678913', name: 'Bob', isBot: false };
const bot = { id: 'bot:5f0c', name: 'Bot 1', isBot: true };

describe('pickMessage', () => {
  it('says who picked what, pings only the next player, and links to the draft', () => {
    expect(
      pickMessage(draft, {
        number: 23,
        player: alice,
        card: 'Shock',
        next: bob,
      }),
    ).toEqual({
      content:
        '**Alice** picked **Shock** (pick 23)\n' +
        '<@80351110224678913> you’re up\n' +
        '<https://roto.example/drafts/d1>',
      allowed_mentions: { parse: [], users: ['80351110224678913'] },
    });
  });

  it('pings no one after the last pick', () => {
    expect(
      pickMessage(draft, {
        number: 80,
        player: bob,
        card: 'Shock',
        next: null,
      }),
    ).toEqual({
      content:
        '**Bob** picked **Shock** (pick 80)\n' +
        '<https://roto.example/drafts/d1>',
      allowed_mentions: { parse: [], users: [] },
    });
  });

  it('names a bot whose turn it is without pinging it', () => {
    expect(
      pickMessage(draft, {
        number: 2,
        player: alice,
        card: 'Shock',
        next: bot,
      }),
    ).toEqual({
      content:
        '**Alice** picked **Shock** (pick 2)\n' +
        '**Bot 1** is up\n' +
        '<https://roto.example/drafts/d1>',
      allowed_mentions: { parse: [], users: [] },
    });
  });

  it('pings the next player after a bot’s pick', () => {
    expect(
      pickMessage(draft, {
        number: 3,
        player: bot,
        card: 'Shock',
        next: alice,
      }),
    ).toEqual({
      content:
        '**Bot 1** picked **Shock** (pick 3)\n' +
        '<@80351110224678912> you’re up\n' +
        '<https://roto.example/drafts/d1>',
      allowed_mentions: { parse: [], users: ['80351110224678912'] },
    });
  });

  it('shows names as written, without their markdown taking effect', () => {
    const { content } = pickMessage(draft, {
      number: 1,
      player: { id: '1', name: '*star*_ <@2>', isBot: false },
      card: 'Fire // Ice',
      next: null,
    });

    expect(content.split('\n')[0]).toBe(
      '**\\*star\\*\\_ \\<@2\\>** picked **Fire // Ice** (pick 1)',
    );
  });
});

describe('draftStartedMessage', () => {
  it('lists the seat order and pings only the first player', () => {
    expect(draftStartedMessage(draft, [bob, alice])).toEqual({
      content:
        '**Red** has started. Seat order:\n' +
        '1. **Bob**\n' +
        '2. **Alice**\n' +
        '<@80351110224678913> you’re up\n' +
        '<https://roto.example/drafts/d1>',
      allowed_mentions: { parse: [], users: ['80351110224678913'] },
    });
  });

  it('names a bot in the seat order and as up, pinging no one', () => {
    expect(draftStartedMessage(draft, [bot, alice])).toEqual({
      content:
        '**Red** has started. Seat order:\n' +
        '1. **Bot 1**\n' +
        '2. **Alice**\n' +
        '**Bot 1** is up\n' +
        '<https://roto.example/drafts/d1>',
      allowed_mentions: { parse: [], users: [] },
    });
  });
});

describe('draftCompleteMessage', () => {
  it('says the draft is complete, pings no one, and links to everyone’s picks', () => {
    expect(draftCompleteMessage(draft)).toEqual({
      content:
        '**Red** is complete. See everyone’s picks:\n' +
        '<https://roto.example/drafts/d1>',
      allowed_mentions: { parse: [], users: [] },
    });
  });
});
