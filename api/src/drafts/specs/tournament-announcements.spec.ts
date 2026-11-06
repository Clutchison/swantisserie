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
 * users, which they all joined and Alice started, with nothing posted yet.
 */
async function announcedTournament(
  cookies: string[],
  setup: TournamentSetupRequest,
) {
  const id = await announcedDraft(cookies);
  await setUpTournament(id, aliceCookie, setup).expect(201);
  for (const cookie of cookies) {
    await fullDeck(id, cookie);
    await joinTournament(id, cookie).expect(201);
  }
  await startTournament(id).expect(200);
  await announcementsSettled(id);
  webhookClient.post.mockClear();
  return id;
}

const tournamentLink = (id: string) =>
  `[Open tournament](<https://roto.example/drafts/${id}?tab=tournament>)`;

describe('tournament announcements', () => {
  it('announces registration at tournament setup, pinging each of the draft’s players', async () => {
    const id = await announcedDraft([aliceCookie, bobCookie, carolCookie]);

    await setUpTournament(id, aliceCookie, swiss()).expect(201);

    expect(await posts(id, 1)).toEqual([
      {
        content:
          '**Red**’s Swiss tournament is in registration.\n' +
          `<@${alice.id}> <@${bob.id}> <@${carol.id}> join from the Tournament tab. ${tournamentLink(id)}`,
        allowed_mentions: { parse: [], users: [alice.id, bob.id, carol.id] },
      },
    ]);
  });

  it('announces the start, naming the format and the joined players in join order', async () => {
    const id = await announcedDraft([aliceCookie, bobCookie, carolCookie]);
    await setUpTournament(id, aliceCookie, roundRobin).expect(201);
    for (const cookie of [carolCookie, aliceCookie]) {
      await fullDeck(id, cookie);
      await joinTournament(id, cookie).expect(201);
    }
    await announcementsSettled(id);
    webhookClient.post.mockClear();

    await startTournament(id).expect(200);

    expect(await posts(id, 1)).toEqual([
      {
        content:
          '**Red**’s round robin tournament has started with **Carol** and **Alice**.\n' +
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

    await fullDeck(id, bobCookie);
    await joinTournament(id, bobCookie).expect(201);
    await removeEntry(id, bob.id, bobCookie).expect(200);

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

  it('drops the announcement when the webhook is gone, and posts none after it', async () => {
    const id = await announcedDraft([aliceCookie, bobCookie]);
    webhookClient.post.mockRejectedValueOnce(new WebhookGoneError(404));
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    await setUpTournament(id).expect(201);
    await posts(id, 1);
    expect((await getDraft(id).expect(200)).body.webhook.gone).toBe(true);

    for (const cookie of [aliceCookie, bobCookie]) {
      await fullDeck(id, cookie);
      await joinTournament(id, cookie).expect(201);
    }
    await startTournament(id).expect(200);

    await posts(id, 1);
  });
});
