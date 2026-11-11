import type {
  CompleteRoundRequest,
  MatchReportRequest,
  MatchView,
  PlayerView,
  SwissRoundOption,
  TournamentSetupRequest,
  TournamentView,
} from 'contract';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  addBot,
  aliceCookie,
  app,
  carol,
  draftsRequest,
  getDraft,
  pick,
  poolCardIds,
  readyDraft,
  setBasic,
  signIn,
  start,
  waitForBotPicks,
} from './harness.js';

export * from './harness.js';

/** Round robin tournament setup. */
export const roundRobin = {
  format: 'RoundRobin',
} satisfies TournamentSetupRequest;

/** Swiss tournament setup, until there's a winner unless `swissRoundOption` says otherwise. */
export function swiss(
  swissRoundOption: SwissRoundOption = 'UntilWinner',
): TournamentSetupRequest {
  return { format: 'Swiss', swissRoundOption };
}

/** Single elimination tournament setup. */
export const singleElimination = {
  format: 'SingleElimination',
} satisfies TournamentSetupRequest;

/** The cards `completeDraft`'s players pick, one each in seat order. */
const DRAFTED = [
  'Shock',
  'Lightning Bolt',
  'Lava Spike',
  'Skewer the Critics',
  'Fireblast',
  'Chain Lightning',
  'Rift Bolt',
  'Lightning Strike',
  'Searing Spear',
  'Fiery Temper',
  'Play with Fire',
  'Burst Lightning',
];

/**
 * A complete draft, organized by Alice, whose players are the cookies'
 * users in seat order, at most 12: each picks one card, Shock, Lightning
 * Bolt, Lava Spike, Skewer the Critics, Fireblast, Chain Lightning and so
 * on in turn, from a pool of at least the first four. Their decks hold just that
 * pick, so give them `fullDeck` before a tournament starts.
 */
export async function completeDraft(cookies: string[]) {
  const names = DRAFTED.slice(0, Math.max(4, cookies.length));
  const id = await readyDraft(cookies, 1, names);
  const ids = await poolCardIds(id);
  await start(id).expect(200);
  for (const [seat, cookie] of cookies.entries()) {
    await pick(id, ids[names[seat]], cookie).expect(200);
  }
  return id;
}

/**
 * A complete draft, organized by Alice, of the cookies' users in seat order
 * and then `bots` bots, added by Carol, an app admin; at most 12 in all.
 * Each picks one card: the users Shock, Lightning Bolt and so on in turn,
 * each bot a random one. Answers with the draft's id and its bots' ids in
 * seat order. Every deck holds just its pick, so give the users `fullDeck`
 * before a tournament starts; the bots play as they are.
 */
export async function completeDraftWithBots(cookies: string[], bots: number) {
  const names = DRAFTED.slice(0, Math.max(4, cookies.length + bots));
  const id = await readyDraft(cookies, 1, names);
  const carolCookie = await signIn(carol);
  for (let i = 0; i < bots; i++) await addBot(id, carolCookie).expect(201);
  const ids = await poolCardIds(id);
  const started = await start(id).expect(200);
  for (const [seat, cookie] of cookies.entries()) {
    await pick(id, ids[names[seat]], cookie).expect(200);
  }
  await waitForBotPicks(bots, async () =>
    expect((await getDraft(id).expect(200)).body.state).toBe('Complete'),
  );
  const players = (started.body as { players: PlayerView[] }).players;
  return {
    id,
    botIds: players.filter((player) => player.isBot).map((p) => p.id),
  };
}

/**
 * Brings the player's mainboard to the 40 cards Start asks for: their one
 * pick plus 39 Mountains, as `completeDraft` leaves them.
 */
export async function fullDeck(id: string, cookie: string) {
  await setBasic(id, 'Mountain', 39, cookie).expect(200);
}

/** Sets up the draft's tournament, round robin unless `body` says otherwise. */
export function setUpTournament(
  id: string,
  cookie = aliceCookie,
  body: unknown = roundRobin,
) {
  return draftsRequest('post', `/${id}/tournament`, cookie, body);
}

/** Reads the draft's tournament. */
export function tournament(id: string, cookie = aliceCookie) {
  return draftsRequest('get', `/${id}/tournament`, cookie);
}

/** Cancels the draft's tournament. */
export function cancelTournament(id: string, cookie = aliceCookie) {
  return draftsRequest('delete', `/${id}/tournament`, cookie);
}

/**
 * Joins the draft's tournament as whoever `cookie` signs in, as a player
 * who left or was removed does: setup joins everyone.
 */
export function joinTournament(id: string, cookie: string) {
  return draftsRequest('post', `/${id}/tournament/entries`, cookie);
}

/**
 * Takes the player `playerId` (a Discord user id) out of the draft's
 * tournament: leaving, when it is the signed-in player, or else removing them.
 */
export function removeEntry(id: string, playerId: string, cookie: string) {
  return draftsRequest(
    'delete',
    `/${id}/tournament/entries/${playerId}`,
    cookie,
  );
}

/** Marks whoever `cookie` signs in ready in the draft's tournament. */
export function markReady(id: string, cookie: string) {
  return draftsRequest('put', `/${id}/tournament/ready`, cookie);
}

/** Unmarks whoever `cookie` signs in as ready in the draft's tournament. */
export function unmarkReady(id: string, cookie: string) {
  return draftsRequest('delete', `/${id}/tournament/ready`, cookie);
}

/** The ids of the players who have joined the draft's tournament, in join order. */
export async function joinedPlayers(id: string): Promise<string[]> {
  const { body } = await tournament(id).expect(200);
  return (body as { entries: { playerId: string }[] }).entries.map(
    (entry) => entry.playerId,
  );
}

/** Starts the draft's tournament. */
export function startTournament(id: string, cookie = aliceCookie) {
  return draftsRequest('post', `/${id}/tournament/start`, cookie);
}

/** Completes the draft's tournament. */
export function completeTournament(id: string, cookie = aliceCookie) {
  return draftsRequest('post', `/${id}/tournament/complete`, cookie);
}

/**
 * Completes a tournament round of the draft's tournament, `body` the rest of
 * the request: the current one, as read when the request is sent, unless
 * `body` names another. Only `expect` sends it, answering with the response.
 */
export function completeRound(
  id: string,
  cookie = aliceCookie,
  body: Partial<CompleteRoundRequest> = {},
) {
  return {
    async expect(status: number) {
      const round = (await currentRound(id)) ?? 1;
      return postCompleteRound(id, { round, ...body }, cookie).expect(status);
    },
  };
}

/** Sends Complete round for the draft's tournament, `body` the request body as is. */
export function postCompleteRound(
  id: string,
  body: unknown,
  cookie = aliceCookie,
) {
  return draftsRequest(
    'post',
    `/${id}/tournament/complete-round`,
    cookie,
    body,
  );
}

/** The draft's tournament's current tournament round, read from the database; null without a tournament. */
async function currentRound(id: string): Promise<number | null> {
  const row = await app.get(PrismaService).tournament.findUnique({
    where: { draftId: id },
    select: { lastCompletedRound: true },
  });
  return row && row.lastCompletedRound + 1;
}

/**
 * A complete draft whose players are the cookies' users in seat order, all
 * with full decks, and its tournament, round robin unless `setup` says
 * otherwise, in registration, which setup joined them all to in seat order.
 */
export async function inRegistration(
  cookies: string[],
  setup: TournamentSetupRequest = roundRobin,
) {
  const id = await completeDraft(cookies);
  for (const cookie of cookies) await fullDeck(id, cookie);
  await setUpTournament(id, aliceCookie, setup).expect(201);
  return id;
}

/**
 * A complete draft whose players are the cookies' users in seat order, all
 * with full decks, and its tournament, round robin unless `setup` says
 * otherwise, which setup joined them to in that order and Alice started.
 */
export async function playingTournament(
  cookies: string[],
  setup: TournamentSetupRequest = roundRobin,
) {
  const id = await inRegistration(cookies, setup);
  await startTournament(id).expect(200);
  return id;
}

/**
 * A playing single elimination tournament of the cookies' users, as
 * `playingTournament` starts it, with its seed order, `seeds[s - 1]` the
 * player with seed s. With 4 players, round 1 is seed 1 v 4 at bracket
 * place 0 and 2 v 3 at place 1; with 5, seed 4 v 5 at place 1, the others
 * with byes; with 9, seed 8 v 9 at place 1, the others with byes.
 */
export async function playingSingleElimination(cookies: string[]) {
  const id = await playingTournament(cookies, singleElimination);
  return { id, seeds: seedsOf(await tournamentView(id)) };
}

/** The player with each seed of a single elimination tournament, `seeds[s - 1]` the player with seed s. */
export function seedsOf(view: TournamentView): string[] {
  const seeds: string[] = [];
  for (const entry of view.entries) seeds[entry.seed! - 1] = entry.playerId;
  return seeds;
}

/** Each match of the tournament round as its bracket place and players. */
export function placesOf(round: TournamentView['rounds'][number]) {
  return round.matches.map(({ bracketPlace, players }) => ({
    bracketPlace,
    players,
  }));
}

/**
 * Makes the draft's complete tournament as the migration of ADR 0017 left
 * one that completed before every deck was kept, without public
 * decklists: no completion time, and no decklist kept for anyone.
 */
export async function completedBeforeDecklistsWereKept(id: string) {
  const prisma = app.get(PrismaService);
  await prisma.tournament.update({
    where: { draftId: id },
    data: { completedAt: null },
  });
  await prisma.tournamentEntry.updateMany({
    where: { tournament: { draftId: id } },
    data: { decklist: Prisma.DbNull },
  });
}

/** The draft's tournament as everyone who sees it reads it. */
export async function tournamentView(id: string): Promise<TournamentView> {
  return (await tournament(id).expect(200)).body as TournamentView;
}

/** Expects `view` to have completed at `since` (a `Date.now()`) or later, and no later than now. */
export function expectCompletedSince(view: TournamentView, since: number) {
  expect(view.completedAt).not.toBeNull();
  const completedAt = new Date(view.completedAt!).getTime();
  expect(completedAt).toBeGreaterThanOrEqual(since);
  expect(completedAt).toBeLessThanOrEqual(Date.now());
}

/**
 * Reports every unreported match of the tournament's current tournament
 * round, the latest paired, as won 2–0 by its first player, as that
 * player.
 */
export async function reportCurrentRound(
  id: string,
  cookies: Record<string, string>,
) {
  const { rounds } = await tournamentView(id);
  for (const match of rounds.at(-1)!.matches) {
    if (match.outcome.kind !== 'Unreported') continue;
    await reportMatch(id, match.id, cookies[match.players[0]], {
      games: [2, 0],
    } satisfies MatchReportRequest).expect(200);
  }
}

/**
 * Reports every unreported match of the current tournament round, its first
 * player winning, and completes it. `cookies` holds each player's cookie by
 * their Discord user id.
 */
export async function playTournamentRound(
  id: string,
  cookies: Record<string, string>,
) {
  await reportCurrentRound(id, cookies);
  await completeRound(id).expect(200);
}

/** The tournament's match between the players `a` and `b`, either way round. */
export async function matchOf(
  id: string,
  a: string,
  b: string,
): Promise<MatchView> {
  const { rounds } = await tournamentView(id);
  const match = rounds
    .flatMap((round) => round.matches)
    .find(({ players }) => players.includes(a) && players.includes(b));
  if (!match) throw new Error(`No match between ${a} and ${b}`);
  return match;
}

/**
 * Each joined player's cookie by their Discord user id, `cookies` given in
 * the order they joined the draft's tournament, the seat order setup joins
 * them in.
 */
export async function cookiesByPlayer(
  id: string,
  cookies: string[],
): Promise<Record<string, string>> {
  const { entries } = await tournamentView(id);
  return Object.fromEntries(
    entries.map((entry, i) => [entry.playerId, cookies[i]]),
  );
}

/**
 * The id of a bye in the draft's tournament. The tournament view names a
 * bye only by its player, so a client never sees this id; specs read it
 * from the database to check the match routes refuse it.
 */
export async function byeId(id: string): Promise<string> {
  const bye = await app.get(PrismaService).match.findFirstOrThrow({
    where: { tournament: { draftId: id }, secondEntryId: null },
    select: { id: true },
  });
  return bye.id;
}

/** Reports the match's game score, as whoever `cookie` signs in, `body` the request body as is. */
export function reportMatch(
  id: string,
  matchId: string,
  cookie: string,
  body: unknown,
) {
  return draftsRequest(
    'post',
    `/${id}/tournament/matches/${matchId}/report`,
    cookie,
    body,
  );
}

/**
 * Reports the match between `winner` and `loser` as `winner` winning
 * `games[0]` to `games[1]`, as whoever `cookie` signs in, expecting the
 * answer's status to be `status`.
 */
export async function reportWin(
  id: string,
  [winner, loser]: [string, string],
  games: [number, number],
  cookie: string,
  status = 200,
) {
  const match = await matchOf(id, winner, loser);
  const ordered: [number, number] =
    match.players[0] === winner ? games : [games[1], games[0]];
  return reportMatch(id, match.id, cookie, {
    games: ordered,
  } satisfies MatchReportRequest).expect(status);
}

/** Confirms the match's game score, as whoever `cookie` signs in. */
export function confirmMatch(id: string, matchId: string, cookie: string) {
  return draftsRequest(
    'post',
    `/${id}/tournament/matches/${matchId}/confirm`,
    cookie,
  );
}

/**
 * Drops the player `playerId` (a Discord user id) from the draft's
 * tournament, as whoever `cookie` signs in: the player themselves or an
 * organizer.
 */
export function dropPlayer(id: string, playerId: string, cookie: string) {
  return draftsRequest(
    'post',
    `/${id}/tournament/entries/${playerId}/drop`,
    cookie,
  );
}

/**
 * Sets the match's game score as an organizer does, reporting or
 * correcting it, as whoever `cookie` signs in, `body` the request body as is.
 */
export function setGameScore(
  id: string,
  matchId: string,
  body: unknown,
  cookie = aliceCookie,
) {
  return draftsRequest(
    'put',
    `/${id}/tournament/matches/${matchId}/game-score`,
    cookie,
    body,
  );
}

/** Clears the match's game score as an organizer does, as whoever `cookie` signs in. */
export function clearGameScore(
  id: string,
  matchId: string,
  cookie = aliceCookie,
) {
  return draftsRequest(
    'delete',
    `/${id}/tournament/matches/${matchId}/game-score`,
    cookie,
  );
}

/**
 * Sets the match between `winner` and `loser` to `winner` winning
 * `games[0]` to `games[1]`, as an organizer does, as whoever `cookie` signs
 * in, expecting the answer's status to be `status`.
 */
export async function setWin(
  id: string,
  [winner, loser]: [string, string],
  games: [number, number],
  cookie = aliceCookie,
  status = 200,
) {
  const match = await matchOf(id, winner, loser);
  const ordered: [number, number] =
    match.players[0] === winner ? games : [games[1], games[0]];
  return setGameScore(
    id,
    match.id,
    { games: ordered } satisfies MatchReportRequest,
    cookie,
  ).expect(status);
}

/** Reinstates the dropped player `playerId` (a Discord user id), as whoever `cookie` signs in. */
export function reinstate(id: string, playerId: string, cookie = aliceCookie) {
  return draftsRequest(
    'delete',
    `/${id}/tournament/entries/${playerId}/drop`,
    cookie,
  );
}

/** Reopens the last completed tournament round of the draft's tournament, as whoever `cookie` signs in. */
export function reopenRound(id: string, cookie = aliceCookie) {
  return draftsRequest('post', `/${id}/tournament/reopen-round`, cookie);
}
