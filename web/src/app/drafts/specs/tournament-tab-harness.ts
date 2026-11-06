import type {
  DraftPowersView,
  MatchView,
  PlanView,
  PlayerView,
  StandingView,
  TournamentView,
  UserView,
} from 'contract';
import { EMPTY_PLAN } from '../drafts';
import {
  alice,
  alicePlayer,
  bob,
  completeSnapshot,
  draft,
  drafting,
  flushPicks,
  flushQueueAndPlan,
  http,
  openDraft,
  openTab,
  tabButton,
  type AppFixture,
  type DraftFixture,
} from './harness';

/** A complete draft of Alice and Bob, organized by Alice. */
export const complete = drafting({ state: 'Complete', turn: null });

/** Dave, who sees the draft but isn't one of its players. */
export const dave: UserView = { ...alice, id: 'dave', name: 'Dave' };

/** Carol, a third player, in drafts that list her. */
export const carol: PlayerView = { ...bob, id: 'carol', name: 'Carol' };

/** A round robin tournament in registration, joined by the players with these ids in order. */
export const registration = (...playerIds: string[]): TournamentView => ({
  format: 'RoundRobin',
  state: 'Registration',
  entries: playerIds.map((playerId) => ({ playerId })),
  rounds: [],
  standings: [],
  trophyHolders: [],
});

/** An unreported match `id` between the players `a` and `b`, in that order. */
export const openMatch = (id: string, a: string, b: string): MatchView => ({
  id,
  players: [a, b],
  outcome: { kind: 'Unreported' },
  reportedBy: null,
  confirmed: false,
});

/** `match` reported by `reportedBy` at the game score `games`, in its player order. */
export const reported = (
  match: MatchView,
  games: [number, number],
  reportedBy = match.players[0],
): MatchView => ({
  ...match,
  outcome: { kind: 'GameScore', games, draws: 0 },
  reportedBy,
});

/** A standing with no matches played, or with `fields` changed. */
export const standing = (
  playerId: string,
  rank: number,
  fields: Partial<StandingView> = {},
): StandingView => ({
  playerId,
  rank,
  matchPoints: 0,
  matches: { won: 0, lost: 0, drawn: 0 },
  games: { won: 0, lost: 0, drawn: 0 },
  gameWinRate: 0,
  ...fields,
});

/**
 * A round robin tournament of Alice, Bob and Carol being played: Alice has
 * a bye in tournament round 1, then plays Bob (match m2), then Carol (m3);
 * Bob plays Carol in round 1 (m1). `matches` replaces any of them by id.
 */
export function playing(
  matches: MatchView[] = [],
  fields: Partial<TournamentView> = {},
): TournamentView {
  const match = (id: string, a: string, b: string) =>
    matches.find((m) => m.id === id) ?? openMatch(id, a, b);
  return {
    format: 'RoundRobin',
    state: 'Playing',
    entries: [alice.id, bob.id, carol.id].map((playerId) => ({ playerId })),
    rounds: [
      { round: 1, matches: [match('m1', bob.id, carol.id)], bye: alice.id },
      { round: 2, matches: [match('m2', alice.id, bob.id)], bye: carol.id },
      { round: 3, matches: [match('m3', carol.id, alice.id)], bye: bob.id },
    ],
    standings: [standing(alice.id, 1), standing(bob.id, 1), standing(carol.id, 1)],
    trophyHolders: [],
    ...fields,
  };
}

/** The complete draft of Alice, Bob and Carol. */
export const threePlayers: DraftFixture = { players: [alicePlayer, bob, carol] };

/** The complete draft as it is with `tournament` set up, or with none. */
export const withTournament = (
  tournament: TournamentView | null,
  fields: DraftFixture = {},
): DraftFixture => ({
  ...complete,
  tournament: tournament && { state: tournament.state },
  ...fields,
});

/** Answers the page's GET of draft-1's tournament with `tournament`. */
export async function flushTournament(tournament: TournamentView) {
  (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/tournament'))).flush(tournament);
}

/**
 * Opens the complete draft's page with `tournament` set up, or none, signed
 * in as `user` (Alice, a player, unless told otherwise) with `powers`, and
 * answers its reads, `plan` the signed-in player's, the draft's `fields`
 * changed.
 */
export async function openComplete(
  tournament: TournamentView | null,
  {
    powers,
    user = alice,
    plan = EMPTY_PLAN,
    fields = {},
  }: { powers?: DraftPowersView; user?: UserView; plan?: PlanView; fields?: DraftFixture } = {},
) {
  return openDraft(completeSnapshot, withTournament(tournament, fields), {
    powers,
    user,
    plan,
    tournament: tournament ?? undefined,
  });
}

/** Opens the Tournament tab and returns its panel. */
export const openTournament = (fixture: AppFixture, page: HTMLElement) =>
  openTab(fixture, page, 'Tournament');

/** Whether the tab bar has a Tournament tab. */
export const hasTournamentTab = (page: HTMLElement) => !!tabButton(page, 'Tournament');

/**
 * Answers a tournament change with the complete draft at `version`, its
 * tournament now `tournament` or gone, then the reads the newer version
 * re-reads, for Alice, a player.
 */
export async function answerChange(
  fixture: AppFixture,
  url: string,
  method: string,
  tournament: TournamentView | null,
  version = 1,
  fields: DraftFixture = {},
) {
  const req = await vi.waitFor(() => http.expectOne(url));
  expect(req.request.method).toBe(method);
  req.flush(draft({ ...withTournament(tournament, fields), version }));
  await flushPicks([]);
  await flushQueueAndPlan();
  if (tournament) await flushTournament(tournament);
  await fixture.whenStable();
  return req;
}
