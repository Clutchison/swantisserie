import type { TournamentSetupRequest } from 'contract';
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

/** Round robin, the one format tournament setup offers for now. */
export const roundRobin = {
  format: 'RoundRobin',
} satisfies TournamentSetupRequest;

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
