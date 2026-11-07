import { Logger } from '@nestjs/common';
import type { TournamentSetupRequest } from 'contract';
import { WebhookGoneError } from '../../discord/webhook-client.js';
import {
  alice,
  aliceCookie,
  announcementsSettled,
  bob,
  cancelTournament,
  carol,
  changeWebhook,
  clearGameScore,
  completeDraft,
  completeDraftWithBots,
  completeRound,
  completeTournament,
  confirmMatch,
  dropPlayer,
  fullDeck,
  getDraft,
  joinTournament,
  matchOf,
  registerWebhook,
  removeEntry,
  reopenRound,
  reportCurrentRound,
  reportWin,
  roundRobin,
  setUpTournament,
  setWin,
  signIn,
  singleElimination,
  startTournament,
  swiss,
  tournamentView,
  useDraftsApp,
  webhookClient,
} from './tournament-harness.js';

useDraftsApp();

/** A fourth player, who signs in only where a spec needs four. */
const dave = { id: '80351110224678915', name: 'Dave' };

let bobCookie: string;
let carolCookie: string;
let daveCookie: string;
let webhookId: string;
/** Each player's cookie by their Discord user id. */
let cookieOf: Record<string, string>;
/** Each player's name by their Discord user id. */
const nameOf: Record<string, string> = Object.fromEntries(
  [alice, bob, carol, dave].map(({ id, name }) => [id, name]),
);

beforeEach(async () => {
  bobCookie = await signIn(bob);
  carolCookie = await signIn(carol);
  daveCookie = await signIn(dave);
  webhookId = await registerWebhook();
  cookieOf = {
    [alice.id]: aliceCookie,
    [bob.id]: bobCookie,
    [carol.id]: carolCookie,
    [dave.id]: daveCookie,
  };
});

/**
 * A complete draft of the cookies' users, announcing on the registered
 * webhook only from now on, so its draft announcements aren't posted.
 */
async function announcedDraft(cookies: string[]) {
  const id = await completeDraft(cookies);
  await changeWebhook(id, webhookId).expect(200);
  return id;
}

/** Each post, once the draft's announcements have settled, expecting exactly `count`. */
async function posts(id: string, count: number) {
  await announcementsSettled(id);
  expect(webhookClient.post).toHaveBeenCalledTimes(count);
  return webhookClient.post.mock.calls.map(([, message]) => message);
}

/**
 * A tournament set up as `setup` on an announced draft of the cookies'
 * users, with full decks, which setup joined them all to and Alice started,
 * with nothing posted yet.
 */
async function announcedTournament(
  cookies: string[],
  setup: TournamentSetupRequest,
) {
  const id = await announcedDraft(cookies);
  for (const cookie of cookies) await fullDeck(id, cookie);
  await setUpTournament(id, aliceCookie, setup).expect(201);
  await startTournament(id).expect(200);
  await announcementsSettled(id);
  webhookClient.post.mockClear();
  return id;
}

const tournamentLink = (id: string) =>
  `[Open tournament](<https://roto.example/drafts/${id}?tab=play>)`;

describe('tournament announcements', () => {
  it('announces registration at tournament setup, pinging each of the draft’s players, who are in, can leave and whose decks lock at Start', async () => {
    const id = await announcedDraft([aliceCookie, bobCookie, carolCookie]);

    await setUpTournament(id, aliceCookie, swiss()).expect(201);

    expect(await posts(id, 1)).toEqual([
      {
        content:
          '**Red**’s Swiss tournament is in registration, and every player has joined.\n' +
          `<@${alice.id}> <@${bob.id}> <@${carol.id}> you’re in. If you won’t play, leave on the Play tab. Decks lock when the tournament starts. ${tournamentLink(id)}`,
        allowed_mentions: { parse: [], users: [alice.id, bob.id, carol.id] },
      },
    ]);
  });

  it('announces the start, naming the format and the joined players in join order, bots included and pinging nobody', async () => {
    const { id } = await completeDraftWithBots(
      [aliceCookie, bobCookie, carolCookie],
      1,
    );
    await changeWebhook(id, webhookId).expect(200);
    for (const cookie of [carolCookie, aliceCookie]) await fullDeck(id, cookie);
    // Setup joins Alice, Bob, Carol and Bot 1; Bob leaves, and Alice leaves
    // and joins again.
    await setUpTournament(id, aliceCookie, roundRobin).expect(201);
    await removeEntry(id, bob.id, bobCookie).expect(200);
    await removeEntry(id, alice.id, aliceCookie).expect(200);
    await joinTournament(id, aliceCookie).expect(201);
    await announcementsSettled(id);
    webhookClient.post.mockClear();

    await startTournament(id).expect(200);

    expect(await posts(id, 1)).toEqual([
      {
        content:
          '**Red**’s round robin tournament has started with **Carol**, **Bot 1** and **Alice**.\n' +
          tournamentLink(id),
        allowed_mentions: { parse: [], users: [] },
      },
    ]);
  });

  it('announces a completed Swiss tournament round with the next one’s matches and byes, pinging only players with a match', async () => {
    const id = await announcedTournament(
      [aliceCookie, bobCookie, carolCookie],
      swiss(),
    );
    await reportCurrentRound(id, cookieOf);

    await completeRound(id).expect(200);

    const [round2] = (await tournamentView(id)).rounds.slice(1);
    const [[first, second]] = round2.matches.map((match) => match.players);
    const [bye] = round2.byes;
    expect(await posts(id, 1)).toEqual([
      {
        content:
          'Tournament round 1 of **Red**’s tournament is complete. Tournament round 2:\n' +
          `<@${first}> vs <@${second}>\n` +
          `**${nameOf[bye]}** has a bye.\n` +
          tournamentLink(id),
        allowed_mentions: { parse: [], users: [first, second] },
      },
    ]);
  });

  it('announces a completed single elimination tournament round with the next one’s matches', async () => {
    const id = await announcedTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      singleElimination,
    );
    await reportCurrentRound(id, cookieOf);

    await completeRound(id).expect(200);

    const [final] = (await tournamentView(id)).rounds[1].matches;
    const [first, second] = final.players;
    expect(await posts(id, 1)).toEqual([
      {
        content:
          'Tournament round 1 of **Red**’s tournament is complete. Tournament round 2:\n' +
          `<@${first}> vs <@${second}>\n` +
          tournamentLink(id),
        allowed_mentions: { parse: [], users: [first, second] },
      },
    ]);
  });

  it('announces the tournament complete, not a completed tournament round, after the last tournament round', async () => {
    const id = await announcedTournament([aliceCookie, bobCookie], swiss());
    await reportWin(id, [bob.id, alice.id], [2, 1], bobCookie);

    await completeRound(id).expect(200);

    expect(await posts(id, 1)).toEqual([
      {
        content:
          '**Red**’s Swiss tournament is complete. The trophy goes to **Bob**.\n' +
          tournamentLink(id),
        allowed_mentions: { parse: [], users: [] },
      },
    ]);
  });

  it('names every trophy holder when first is shared', async () => {
    const id = await announcedTournament([aliceCookie, bobCookie], roundRobin);

    // Its one match becomes a granted draw, so both share first.
    await completeTournament(id).expect(200);

    expect(await posts(id, 1)).toEqual([
      {
        content:
          '**Red**’s round robin tournament is complete. **Alice** and **Bob** share the trophy.\n' +
          tournamentLink(id),
        allowed_mentions: { parse: [], users: [] },
      },
    ]);
  });

  it('posts nothing on joining or leaving', async () => {
    const id = await announcedDraft([aliceCookie, bobCookie]);
    await setUpTournament(id).expect(201);
    await announcementsSettled(id);
    webhookClient.post.mockClear();

    await removeEntry(id, bob.id, bobCookie).expect(200);
    await joinTournament(id, bobCookie).expect(201);

    await posts(id, 0);
  });

  it('posts nothing on reports, confirmations, corrections, drops and cancelling', async () => {
    const id = await announcedTournament(
      [aliceCookie, bobCookie, carolCookie],
      roundRobin,
    );

    await reportWin(id, [alice.id, bob.id], [2, 0], aliceCookie);
    const match = await matchOf(id, alice.id, bob.id);
    await confirmMatch(id, match.id, bobCookie).expect(200);
    await setWin(id, [bob.id, alice.id], [2, 1]);
    await clearGameScore(id, match.id).expect(200);
    await dropPlayer(id, carol.id, carolCookie).expect(200);
    await cancelTournament(id).expect(200);

    await posts(id, 0);
  });

  it('posts nothing on reopening a tournament round, and announces the next one again once it is completed again', async () => {
    const id = await announcedTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    await reportCurrentRound(id, cookieOf);
    await completeRound(id).expect(200);
    await posts(id, 1);
    webhookClient.post.mockClear();

    await reopenRound(id).expect(200);

    await posts(id, 0);
    await completeRound(id).expect(200);
    expect((await posts(id, 1))[0].content).toContain('Tournament round 1 of');
  });

  it('drops the announcement when the webhook is gone, and posts none after it', async () => {
    const id = await announcedDraft([aliceCookie, bobCookie]);
    webhookClient.post.mockRejectedValueOnce(new WebhookGoneError(404));
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    await setUpTournament(id).expect(201);
    await posts(id, 1);
    expect((await getDraft(id).expect(200)).body.webhook.gone).toBe(true);

    for (const cookie of [aliceCookie, bobCookie]) await fullDeck(id, cookie);
    await startTournament(id).expect(200);

    await posts(id, 1);
  });
});

describe('tournament announcements with bots', () => {
  /**
   * A complete draft of Alice and `bots` bots, Bot 1 and on, announcing on
   * the registered webhook from now on, with its tournament set up as
   * `setup` and nothing posted yet. Answers with each player's name by id,
   * as `nameOf` does.
   */
  async function announcedWithBots(
    bots: number,
    setup: TournamentSetupRequest,
  ) {
    const { id, botIds } = await completeDraftWithBots([aliceCookie], bots);
    await changeWebhook(id, webhookId).expect(200);
    await setUpTournament(id, aliceCookie, setup).expect(201);
    await announcementsSettled(id);
    webhookClient.post.mockClear();
    const names: Record<string, string> = { [alice.id]: 'Alice' };
    for (const [i, botId] of botIds.entries()) names[botId] = `Bot ${i + 1}`;
    return { id, botIds, names };
  }

  it('pings only the draft’s humans, though setup joined its bots too', async () => {
    const { id } = await completeDraftWithBots([aliceCookie], 2);
    await changeWebhook(id, webhookId).expect(200);

    await setUpTournament(id, aliceCookie, swiss()).expect(201);

    expect(await posts(id, 1)).toEqual([
      {
        content:
          '**Red**’s Swiss tournament is in registration, and every player has joined.\n' +
          `<@${alice.id}> you’re in. If you won’t play, leave on the Play tab. Decks lock when the tournament starts. ${tournamentLink(id)}`,
        allowed_mentions: { parse: [], users: [alice.id] },
      },
    ]);
  });

  it('names bots in a tournament round’s matches without pinging them', async () => {
    const { id, botIds, names } = await announcedWithBots(3, swiss());
    await fullDeck(id, aliceCookie);
    await startTournament(id).expect(200);
    await announcementsSettled(id);
    webhookClient.post.mockClear();

    const [round1] = (await tournamentView(id)).rounds;
    await completeRound(id, aliceCookie, {
      grantedDraws: round1.matches.map((m) => ({ matchId: m.id, drop: [] })),
    }).expect(200);

    const named = (playerId: string) =>
      botIds.includes(playerId) ? `**${names[playerId]}**` : `<@${playerId}>`;
    const round2 = (await tournamentView(id)).rounds[1];
    expect(await posts(id, 1)).toEqual([
      {
        content:
          'Tournament round 1 of **Red**’s tournament is complete. Tournament round 2:\n' +
          round2.matches
            .map(({ players: [a, b] }) => `${named(a)} vs ${named(b)}\n`)
            .join('') +
          tournamentLink(id),
        allowed_mentions: { parse: [], users: [alice.id] },
      },
    ]);
  });

  it('names a bot that holds the trophy', async () => {
    const { id, botIds } = await announcedWithBots(1, singleElimination);
    await fullDeck(id, aliceCookie);
    await startTournament(id).expect(200);
    const [final] = (await tournamentView(id)).rounds[0].matches;
    await announcementsSettled(id);
    webhookClient.post.mockClear();

    await completeRound(id, aliceCookie, {
      grantedWins: [{ matchId: final.id, winner: botIds[0] }],
    }).expect(200);

    expect(await posts(id, 1)).toEqual([
      {
        content:
          '**Red**’s single elimination tournament is complete. The trophy goes to **Bot 1**.\n' +
          tournamentLink(id),
        allowed_mentions: { parse: [], users: [] },
      },
    ]);
  });
});
