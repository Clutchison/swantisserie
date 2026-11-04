import {
  draftClosedMessage,
  draftCompleteMessage,
  draftMessages,
  draftPausedMessage,
  draftReopenedMessage,
  draftResumedMessage,
  draftStartedMessage,
  picksMessage,
  undoneMessage,
  type WebhookMessage,
} from './draft-messages.js';

const draft = { name: 'Red', url: 'https://roto.example/drafts/d1' };
const alice = { id: '80351110224678912', name: 'Alice', isBot: false };
const bob = { id: '80351110224678913', name: 'Bob', isBot: false };
const bot = { id: 'bot:5f0c', name: 'Bot 1', isBot: true };

describe('picksMessage', () => {
  it('says who picked what, and pings only the next player', () => {
    expect(
      picksMessage(draft, [
        {
          number: 23,
          player: alice,
          card: 'Shock',
          queued: false,
          next: bob,
        },
      ]),
    ).toEqual({
      content:
        '23- **Alice** picked **Shock**\n' +
        '<@80351110224678913> you’re up. ' +
        '[Open draft](<https://roto.example/drafts/d1>)',
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
          queued: false,
          next: null,
        },
      ]),
    ).toEqual({
      content: '80- **Bob** picked **Shock**',
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
          queued: false,
          next: bot,
        },
      ]),
    ).toEqual({
      content:
        '2- **Alice** picked **Shock**\n' +
        '**Bot 1** is up. [Open draft](<https://roto.example/drafts/d1>)',
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
          queued: false,
          next: alice,
        },
      ]),
    ).toEqual({
      content:
        '3- **Bot 1** picked **Shock**\n' +
        '<@80351110224678912> you’re up. [Open draft](<https://roto.example/drafts/d1>)',
      allowed_mentions: { parse: [], users: ['80351110224678912'] },
    });
  });

  it('names a player their by-hand pick leaves up, pinging no one', () => {
    expect(
      picksMessage(draft, [
        {
          number: 12,
          player: alice,
          card: 'Shock',
          queued: false,
          next: alice,
        },
      ]),
    ).toEqual({
      content:
        '12- **Alice** picked **Shock**\n' +
        '**Alice** is up. [Open draft](<https://roto.example/drafts/d1>)',
      allowed_mentions: { parse: [], users: [] },
    });
  });

  it('pings a player their queued pick leaves up, without saying it was queued', () => {
    expect(
      picksMessage(draft, [
        {
          number: 12,
          player: alice,
          card: 'Shock',
          queued: true,
          next: alice,
        },
      ]),
    ).toEqual({
      content:
        '12- **Alice** picked **Shock**\n' +
        '<@80351110224678912> you’re up. [Open draft](<https://roto.example/drafts/d1>)',
      allowed_mentions: { parse: [], users: ['80351110224678912'] },
    });
  });

  it('pings the player a cascade ends on after a by-hand pick', () => {
    expect(
      picksMessage(draft, [
        {
          number: 11,
          player: alice,
          card: 'Shock',
          queued: false,
          next: bob,
        },
        {
          number: 12,
          player: bob,
          card: 'Lava Spike',
          queued: true,
          next: alice,
        },
      ]),
    ).toEqual({
      content:
        '11- **Alice** picked **Shock**\n' +
        '12- **Bob** picked **Lava Spike**\n' +
        '<@80351110224678912> you’re up. [Open draft](<https://roto.example/drafts/d1>)',
      allowed_mentions: { parse: [], users: ['80351110224678912'] },
    });
  });

  it('names a bot a cascade ends on after a by-hand pick', () => {
    expect(
      picksMessage(draft, [
        {
          number: 1,
          player: alice,
          card: 'Shock',
          queued: false,
          next: bob,
        },
        {
          number: 2,
          player: bob,
          card: 'Lava Spike',
          queued: true,
          next: bot,
        },
      ]),
    ).toEqual({
      content:
        '1- **Alice** picked **Shock**\n' +
        '2- **Bob** picked **Lava Spike**\n' +
        '**Bot 1** is up. [Open draft](<https://roto.example/drafts/d1>)',
      allowed_mentions: { parse: [], users: [] },
    });
  });

  it('shows names as written, without their markdown taking effect', () => {
    const { content } = picksMessage(draft, [
      {
        number: 1,
        player: { id: '1', name: '*star*_ <@2>', isBot: false },
        card: 'Fire // Ice',
        queued: false,
        next: null,
      },
    ]);

    expect(content.split('\n')[0]).toBe(
      '1- **\\*star\\*\\_ \\<@2\\>** picked **Fire // Ice**',
    );
  });
});

describe('draftMessages', () => {
  const carol = { id: '80351110224678914', name: 'Carol', isBot: false };

  it('lists a pick and the cascade after it in one message, pinging only who must pick next', () => {
    expect(
      draftMessages(draft, [
        {
          type: 'picked',
          number: 4,
          player: alice,
          card: 'Shock',
          queued: false,
          next: bob,
        },
        {
          type: 'picked',
          number: 5,
          player: bob,
          card: 'Lava Spike',
          queued: true,
          next: carol,
        },
        {
          type: 'picked',
          number: 6,
          player: carol,
          card: 'Skewer the Critics',
          queued: true,
          next: alice,
        },
      ]),
    ).toEqual([
      {
        content:
          '4- **Alice** picked **Shock**\n' +
          '5- **Bob** picked **Lava Spike**\n' +
          '6- **Carol** picked **Skewer the Critics**\n' +
          '<@80351110224678912> you’re up. [Open draft](<https://roto.example/drafts/d1>)',
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
          queued: true,
          next: bob,
        },
      ]),
    ).toEqual([
      {
        content:
          '**Red** has started. Seat order:\n' +
          '1. **Alice**\n' +
          '2. **Bob**\n' +
          '1- **Alice** picked **Shock**\n' +
          '<@80351110224678913> you’re up. [Open draft](<https://roto.example/drafts/d1>)',
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
          queued: false,
          next: null,
        },
        { type: 'completed' },
      ]).map((message) => message.content),
    ).toEqual(['2- **Bob** picked **Shock**', '**Red** is complete']);
  });

  it('carries no link when a cascade straight after a start completes the draft', () => {
    expect(
      draftMessages(draft, [
        { type: 'started', seats: [alice] },
        {
          type: 'picked',
          number: 1,
          player: alice,
          card: 'Shock',
          queued: true,
          next: null,
        },
        { type: 'completed' },
      ]).map((message) => message.content),
    ).toEqual([
      '**Red** has started. Seat order:\n' +
        '1. **Alice**\n' +
        '1- **Alice** picked **Shock**',
      '**Red** is complete',
    ]);
  });
});

describe('draftStartedMessage', () => {
  it('lists the seat order, pings only the first player, linking to the draft on the up line', () => {
    expect(draftStartedMessage(draft, [bob, alice])).toEqual({
      content:
        '**Red** has started. Seat order:\n' +
        '1. **Bob**\n' +
        '2. **Alice**\n' +
        '<@80351110224678913> you’re up. [Open draft](<https://roto.example/drafts/d1>)',
      allowed_mentions: { parse: [], users: ['80351110224678913'] },
    });
  });

  it('names a bot in the seat order and as up, pinging no one', () => {
    expect(draftStartedMessage(draft, [bot, alice])).toEqual({
      content:
        '**Red** has started. Seat order:\n' +
        '1. **Bot 1**\n' +
        '2. **Alice**\n' +
        '**Bot 1** is up. [Open draft](<https://roto.example/drafts/d1>)',
      allowed_mentions: { parse: [], users: [] },
    });
  });
});

describe('draftCompleteMessage', () => {
  it('says the draft is complete and pings no one', () => {
    expect(draftCompleteMessage(draft)).toEqual({
      content: '**Red** is complete',
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
        'Undone: 23- **Alice** picked **Shock**\n' +
        '<@80351110224678912> you’re up. [Open draft](<https://roto.example/drafts/d1>)',
      allowed_mentions: { parse: [], users: ['80351110224678912'] },
    });
  });

  it('names a bot whose pick was undone without pinging it', () => {
    expect(
      undoneMessage(draft, { number: 2, player: bot, card: 'Shock' }),
    ).toEqual({
      content:
        'Undone: 2- **Bot 1** picked **Shock**\n' +
        '**Bot 1** is up. [Open draft](<https://roto.example/drafts/d1>)',
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

describe('draftPausedMessage', () => {
  it('says the draft is paused, pinging no one', () => {
    expect(draftPausedMessage(draft)).toEqual({
      content: '**Red** is paused',
      allowed_mentions: { parse: [], users: [] },
    });
  });

  it('is the one message for a pause', () => {
    expect(draftMessages(draft, [{ type: 'paused' }])).toEqual([
      draftPausedMessage(draft),
    ]);
  });
});

describe('draftClosedMessage', () => {
  it('says the draft has been closed, pinging no one', () => {
    expect(draftClosedMessage(draft)).toEqual({
      content: '**Red** has been closed',
      allowed_mentions: { parse: [], users: [] },
    });
  });

  it('is the announcement for a close', () => {
    expect(draftMessages(draft, [{ type: 'closed' }])).toEqual([
      draftClosedMessage(draft),
    ]);
  });
});

describe('draftReopenedMessage', () => {
  it('says the draft has reopened and pings whoever is up', () => {
    expect(draftReopenedMessage(draft, alice)).toEqual({
      content:
        '**Red** has reopened\n' +
        `<@${alice.id}> you’re up. [Open draft](<https://roto.example/drafts/d1>)`,
      allowed_mentions: { parse: [], users: [alice.id] },
    });
  });

  it('is the announcement for a reopen, naming a bot that is up', () => {
    expect(
      draftMessages(draft, [{ type: 'reopened', number: 2, player: bot }]),
    ).toEqual([
      {
        content:
          '**Red** has reopened\n' +
          `**${bot.name}** is up. [Open draft](<https://roto.example/drafts/d1>)`,
        allowed_mentions: { parse: [], users: [] },
      },
    ]);
  });
});

describe('draftResumedMessage', () => {
  it('says the draft has resumed and pings whoever is up', () => {
    expect(draftResumedMessage(draft, alice)).toEqual({
      content:
        '**Red** has resumed\n' +
        '<@80351110224678912> you’re up. [Open draft](<https://roto.example/drafts/d1>)',
      allowed_mentions: { parse: [], users: ['80351110224678912'] },
    });
  });

  it('lists the cascade after the resume, pinging whoever is up after it', () => {
    expect(
      draftMessages(draft, [
        { type: 'resumed', number: 5, player: alice },
        {
          type: 'picked',
          number: 5,
          player: alice,
          card: 'Shock',
          queued: true,
          next: bob,
        },
      ]),
    ).toEqual([
      {
        content:
          '**Red** has resumed\n' +
          '5- **Alice** picked **Shock**\n' +
          '<@80351110224678913> you’re up. [Open draft](<https://roto.example/drafts/d1>)',
        allowed_mentions: { parse: [], users: ['80351110224678913'] },
      },
    ]);
  });

  it('names a bot that is up without pinging it', () => {
    expect(
      draftMessages(draft, [{ type: 'resumed', number: 2, player: bot }]),
    ).toEqual([
      {
        content:
          '**Red** has resumed\n' +
          '**Bot 1** is up. [Open draft](<https://roto.example/drafts/d1>)',
        allowed_mentions: { parse: [], users: [] },
      },
    ]);
  });
});

describe('draftMessages for an announcement too long for one post', () => {
  const upLine =
    '<@80351110224678913> you’re up. [Open draft](<https://roto.example/drafts/d1>)';

  /** Picks `from` on, `count` of them, Alice and Bob in turn, queued after the first. */
  function cascade(from: number, count: number, { byHand = false } = {}) {
    return Array.from({ length: count }, (_, i) => {
      const number = from + i;
      const player = number % 2 === 0 ? bob : alice;
      return {
        type: 'picked' as const,
        number,
        player,
        card: `Card With A Long Enough Name ${number}`,
        queued: !(byHand && i === 0),
        next: number % 2 === 0 ? alice : bob,
      };
    });
  }

  /** The line each pick of `cascade(from, count)` gets. */
  function cascadeLines(from: number, count: number) {
    return Array.from({ length: count }, (_, i) => {
      const number = from + i;
      const name = number % 2 === 0 ? 'Bob' : 'Alice';
      return `${number}- **${name}** picked **Card With A Long Enough Name ${number}**`;
    });
  }

  /**
   * Checks that `messages` are `lines` split into as few posts as fit, with
   * only the last naming who is up and pinging Bob.
   */
  function expectSplit(messages: WebhookMessage[], lines: string[]) {
    expect(messages.length).toBeGreaterThan(1);
    for (const { content } of messages) {
      expect(content.length).toBeLessThanOrEqual(2000);
    }
    expect(messages.flatMap(({ content }) => content.split('\n'))).toEqual(
      lines,
    );
    // Each post is as full as it can be: the next line wouldn't have fit.
    for (let i = 0; i < messages.length - 1; i++) {
      const nextLine = messages[i + 1].content.split('\n')[0];
      expect(`${messages[i].content}\n${nextLine}`.length).toBeGreaterThan(
        2000,
      );
    }
    const earlier = messages.slice(0, -1);
    for (const message of earlier) {
      expect(message.allowed_mentions).toEqual({ parse: [], users: [] });
      expect(message.content).not.toContain('you’re up');
      expect(message.content).not.toContain('Open draft');
    }
    expect(messages[messages.length - 1].allowed_mentions).toEqual({
      parse: [],
      users: [bob.id],
    });
  }

  it('splits a by-hand pick and its long cascade between lines, pinging only in the last post', () => {
    expectSplit(draftMessages(draft, cascade(1, 61, { byHand: true })), [
      ...cascadeLines(1, 61),
      upLine,
    ]);
  });

  it('splits a start and its long cascade, seat order included', () => {
    const seats = Array.from({ length: 12 }, (_, i) => ({
      id: `8035111022467900${i}`,
      name: `Player ${i + 1}`,
      isBot: false,
    }));
    expectSplit(
      draftMessages(draft, [{ type: 'started', seats }, ...cascade(1, 61)]),
      [
        '**Red** has started. Seat order:',
        ...seats.map((_, i) => `${i + 1}. **Player ${i + 1}**`),
        ...cascadeLines(1, 61),
        upLine,
      ],
    );
  });

  it('splits a resume and its long cascade', () => {
    expectSplit(
      draftMessages(draft, [
        { type: 'resumed', number: 9, player: alice },
        ...cascade(9, 61),
      ]),
      ['**Red** has resumed', ...cascadeLines(9, 61), upLine],
    );
  });

  it('splits a reopen and its long cascade', () => {
    expectSplit(
      draftMessages(draft, [
        { type: 'reopened', number: 9, player: alice },
        ...cascade(9, 61),
      ]),
      ['**Red** has reopened', ...cascadeLines(9, 61), upLine],
    );
  });

  /** A by-hand pick of a card named to make its announcement `length` long. */
  function pickOfLength(length: number) {
    const [pick] = cascade(1, 1, { byHand: true });
    const unpadded = draftMessages(draft, [{ ...pick, card: '' }])[0].content
      .length;
    return [{ ...pick, card: 'x'.repeat(length - unpadded) }];
  }

  it('keeps an announcement of exactly 2000 characters in one post', () => {
    const [message, ...rest] = draftMessages(draft, pickOfLength(2000));
    expect(rest).toEqual([]);
    expect(message.content).toHaveLength(2000);
    expect(message.allowed_mentions.users).toEqual([bob.id]);
  });

  it('splits an announcement of 2001 characters into two posts', () => {
    const events = pickOfLength(2001);
    expect(draftMessages(draft, events)).toEqual([
      {
        content: `1- **Alice** picked **${events[0].card}**`,
        allowed_mentions: { parse: [], users: [] },
      },
      {
        content: upLine,
        allowed_mentions: { parse: [], users: [bob.id] },
      },
    ]);
  });
});
