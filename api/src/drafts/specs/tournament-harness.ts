import type {
  MatchReportRequest,
  MatchView,
  SwissRoundOption,
  TournamentSetupRequest,
  TournamentView,
} from 'contract';
import {
  aliceCookie,
  draftsRequest,
  pick,
  poolCardIds,
  readyDraft,
  setBasic,
  start,
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

/**
 * A complete draft, organized by Alice, whose players are the cookies'
 * users in seat order: each picks one card, Shock, Lightning Bolt, Lava Spike
 * and Skewer the Critics in turn. Their decks hold just that pick, so give
 * them `fullDeck` before they join a tournament.
 */
export async function completeDraft(cookies: string[]) {
  const id = await readyDraft(cookies, 1, [
    'Shock',
    'Lightning Bolt',
    'Lava Spike',
    'Skewer the Critics',
  ]);
  const ids = await poolCardIds(id);
  const names = ['Shock', 'Lightning Bolt', 'Lava Spike', 'Skewer the Critics'];
  await start(id).expect(200);
  for (const [seat, cookie] of cookies.entries()) {
    await pick(id, ids[names[seat]], cookie).expect(200);
  }
  return id;
}

/**
 * Brings the player's mainboard to the 40 cards joining asks for: their one
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

/** Joins the draft's tournament as whoever `cookie` signs in. */
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

/** The ids of the players who have joined the draft's tournament, in join order. */
export async function entrants(id: string): Promise<string[]> {
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

/** Completes the current tournament round of the draft's tournament. */
export function completeRound(id: string, cookie = aliceCookie) {
  return draftsRequest('post', `/${id}/tournament/complete-round`, cookie);
}

/**
 * A complete draft whose players are the cookies' users in seat order, all
 * with full decks, and its tournament, round robin unless `setup` says
 * otherwise, which they joined in that order and Alice started.
 */
export async function playingTournament(
  cookies: string[],
  setup: TournamentSetupRequest = roundRobin,
) {
  const id = await completeDraft(cookies);
  await setUpTournament(id, aliceCookie, setup).expect(201);
  for (const cookie of cookies) {
    await fullDeck(id, cookie);
    await joinTournament(id, cookie).expect(201);
  }
  await startTournament(id).expect(200);
  return id;
}

/** The draft's tournament as everyone who sees it reads it. */
export async function tournamentView(id: string): Promise<TournamentView> {
  return (await tournament(id).expect(200)).body as TournamentView;
}

/**
 * Reports every unreported match of the tournament's latest tournament
 * round as won 2–0 by its first player, as that player.
 */
export async function reportLatestRound(
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
