import {
  draftCompleteMessage,
  draftMessages,
  draftStartedMessage,
  picksMessage,
  undoneMessage,
} from './draft-messages.js';

const draft = { name: 'Red', url: 'https://roto.example/drafts/d1' };
const alice = { id: '80351110224678912', name: 'Alice', isBot: false };
const bob = { id: '80351110224678913', name: 'Bob', isBot: false };
const bot = { id: 'bot:5f0c', name: 'Bot 1', isBot: true };

describe('picksMessage', () => {
  it('says who picked what, pings only the next player, and links to the draft', () => {
    expect(
      picksMessage(draft, [
        {
          number: 23,
          player: alice,
          card: 'Shock',
          next: bob,
          queued: false,
        },
      ]),
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
      picksMessage(draft, [
        {
          number: 80,
          player: bob,
          card: 'Shock',
          next: null,
          queued: false,
        },
      ]),
    ).toEqual({
      content:
        '**Bob** picked **Shock** (pick 80)\n' +
        '<https://roto.example/drafts/d1>',
      allowed_mentions: { parse: [], users: [] },
    });
  });

  it('names a bot whose turn it is without pinging it', () => {
    expect(
      picksMessage(draft, [
        {
          number: 2,
          player: alice,
          card: 'Shock',
          next: bot,
          queued: false,
        },
      ]),
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
      picksMessage(draft, [
        {
          number: 3,
          player: bot,
          card: 'Shock',
          next: alice,
          queued: false,
        },
      ]),
    ).toEqual({
      content:
        '**Bot 1** picked **Shock** (pick 3)\n' +
        '<@80351110224678912> you’re up\n' +
        '<https://roto.example/drafts/d1>',
      allowed_mentions: { parse: [], users: ['80351110224678912'] },
    });
  });

  it('shows names as written, without their markdown taking effect', () => {
    const { content } = picksMessage(draft, [
      {
        number: 1,
        player: { id: '1', name: '*star*_ <@2>', isBot: false },
        card: 'Fire // Ice',
        next: null,
        queued: false,
      },
    ]);

    expect(content.split('\n')[0]).toBe(
      '**\\*star\\*\\_ \\<@2\\>** picked **Fire // Ice** (pick 1)',
    );
  });
});

describe('draftMessages', () => {
  const carol = { id: '80351110224678914', name: 'Carol', isBot: false };

  it('lists a pick and the cascade after it in one message, marking queued picks and pinging only who must pick next', () => {
    expect(
      draftMessages(draft, [
        {
          type: 'picked',
          number: 4,
          player: alice,
          card: 'Shock',
          next: bob,
          queued: false,
        },
        {
          type: 'picked',
          number: 5,
          player: bob,
          card: 'Lava Spike',
          next: carol,
          queued: true,
        },
        {
          type: 'picked',
          number: 6,
          player: carol,
          card: 'Skewer the Critics',
          next: alice,
          queued: true,
        },
      ]),
    ).toEqual([
      {
        content:
          '**Alice** picked **Shock** (pick 4)\n' +
          '**Bob** picked **Lava Spike** (pick 5, queued)\n' +
          '**Carol** picked **Skewer the Critics** (pick 6, queued)\n' +
          '<@80351110224678912> you’re up\n' +
          '<https://roto.example/drafts/d1>',
        allowed_mentions: { parse: [], users: ['80351110224678912'] },
      },
    ]);
  });

  it('lists queued picks right after a start in the start’s message, pinging only who must pick next', () => {
    expect(
      draftMessages(draft, [
        { type: 'started', seats: [alice, bob] },
        {
          type: 'picked',
          number: 1,
          player: alice,
          card: 'Shock',
          next: bob,
          queued: true,
        },
      ]),
    ).toEqual([
      {
        content:
          '**Red** has started. Seat order:\n' +
          '1. **Alice**\n' +
          '2. **Bob**\n' +
          '**Alice** picked **Shock** (pick 1, queued)\n' +
          '<@80351110224678913> you’re up\n' +
          '<https://roto.example/drafts/d1>',
        allowed_mentions: { parse: [], users: ['80351110224678913'] },
      },
    ]);
  });

  it('announces completion separately, after the picks that complete the draft', () => {
    expect(
      draftMessages(draft, [
        {
          type: 'picked',
          number: 2,
          player: bob,
          card: 'Shock',
          next: null,
          queued: true,
        },
        { type: 'completed' },
      ]).map((message) => message.content),
    ).toEqual([
      '**Bob** picked **Shock** (pick 2, queued)\n' +
        '<https://roto.example/drafts/d1>',
      '**Red** is complete. See everyone’s picks:\n' +
        '<https://roto.example/drafts/d1>',
    ]);
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

describe('undoneMessage', () => {
  it('says which pick was undone and pings its player, whose turn it is again', () => {
    expect(
      undoneMessage(draft, { number: 23, player: alice, card: 'Shock' }),
    ).toEqual({
      content:
        'Pick 23 (**Shock** by **Alice**) was undone\n' +
        '<@80351110224678912> you’re up\n' +
        '<https://roto.example/drafts/d1>',
      allowed_mentions: { parse: [], users: ['80351110224678912'] },
    });
  });

  it('names a bot whose pick was undone without pinging it', () => {
    expect(
      undoneMessage(draft, { number: 2, player: bot, card: 'Shock' }),
    ).toEqual({
      content:
        'Pick 2 (**Shock** by **Bot 1**) was undone\n' +
        '**Bot 1** is up\n' +
        '<https://roto.example/drafts/d1>',
      allowed_mentions: { parse: [], users: [] },
    });
  });

  it('is the one message for an undo', () => {
    expect(
      draftMessages(draft, [
        { type: 'undone', number: 23, player: alice, card: 'Shock' },
      ]),
    ).toEqual([
      undoneMessage(draft, { number: 23, player: alice, card: 'Shock' }),
    ]);
  });
});
