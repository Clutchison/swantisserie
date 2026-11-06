import type { DraftPowersView, PlanView, TournamentView, UserView } from 'contract';
import { EMPTY_PLAN } from '../drafts';
import {
  alice,
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

/** A round robin tournament in registration, joined by the players with these ids in order. */
export const registration = (...playerIds: string[]): TournamentView => ({
  format: 'RoundRobin',
  state: 'Registration',
  entries: playerIds.map((playerId) => ({ playerId })),
});

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
 * answers its reads, `plan` the signed-in player's.
 */
export async function openComplete(
  tournament: TournamentView | null,
  {
    powers,
    user = alice,
    plan = EMPTY_PLAN,
  }: { powers?: DraftPowersView; user?: UserView; plan?: PlanView } = {},
) {
  return openDraft(completeSnapshot, withTournament(tournament), {
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
) {
  const req = await vi.waitFor(() => http.expectOne(url));
  expect(req.request.method).toBe(method);
  req.flush(draft({ ...withTournament(tournament), version }));
  await flushPicks([]);
  await flushQueueAndPlan();
  if (tournament) await flushTournament(tournament);
  await fixture.whenStable();
  return req;
}
