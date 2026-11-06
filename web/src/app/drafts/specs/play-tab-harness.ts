import type {
  BracketPlaceView,
  BracketRoundView,
  BracketSideView,
  DecklistView,
  DraftPowersView,
  MatchView,
  PlanView,
  PlayerView,
  PoolCardView,
  StandingView,
  TournamentRoundView,
  ViewerTournamentView,
  UserView,
} from 'contract';
import { EMPTY_PLAN } from '../drafts';
import {
  ORGANIZE_ONLY,
  accessibleDescription,
  accessibleName,
  alice,
  alicePlayer,
  bob,
  button,
  completeSnapshot,
  draft,
  drafting,
  flushPicks,
  findNamedList,
  flushQueueAndPlan,
  http,
  namedList,
  openDraft,
  openTab,
  region,
  tabButton,
  statusTexts,
  text,
  updates,
  type AppFixture,
  type DraftFixture,
} from './harness';
import { openDialog, table, tableColumns, tableRows } from '../../specs-harness';

/** A complete draft of Alice and Bob, organized by Alice. */
export const complete = drafting({ state: 'Complete', turn: null });

/** Dave, who sees the draft but isn't one of its players. */
export const dave: UserView = { ...alice, id: 'dave', name: 'Dave' };

/** Carol, a third player, in drafts that list her. */
export const carol: PlayerView = { ...bob, id: 'carol', name: 'Carol' };

/** Bob signed in, a player of the draft. */
export const bobUser: UserView = { ...alice, id: bob.id, name: bob.name };

/** Carol signed in, a player of the draft. */
export const carolUser: UserView = { ...alice, id: carol.id, name: carol.name };

/**
 * A round robin tournament in registration, joined by the players with
 * these ids in order, as Alice, the default viewer, reads it: she may join
 * until she has.
 */
export const registration = (...playerIds: string[]): ViewerTournamentView => ({
  ...(playerIds.includes(alice.id)
    ? {
        canJoin: false,
        joinRefusal: {
          error: 'already-joined',
          message: 'You have already joined this tournament.',
        },
      }
    : { canJoin: true, joinRefusal: null }),
  format: 'RoundRobin',
  swissRoundOption: null,
  publicDecklists: false,
  showsDecklists: false,
  state: 'Registration',
  roundCount: 0,
  lastCompletedRound: 0,
  entries: playerIds.map((playerId) => ({ playerId, dropped: false, seed: null })),
  rounds: [],
  bracket: null,
  standings: [],
  trophyHolders: [],
  completeRoundGrants: null,
  standingsAwaitCompletedRounds: false,
  reopenRound: null,
});

/** An unreported match `id` between the players `a` and `b`, in that order. */
export const unreportedMatch = (id: string, a: string, b: string): MatchView => ({
  id,
  players: [a, b],
  bracketPlace: null,
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
  gameWinPercent: 0,
  ...fields,
});

/**
 * A round robin tournament of Alice, Bob and Carol being played, with no
 * tournament rounds: Bob plays Carol (match m1), Alice plays Bob (m2) and
 * Carol plays Alice (m3), all read as round 1's. `matches` replaces any of
 * them by id.
 */
export function playing(
  matches: MatchView[] = [],
  fields: Partial<ViewerTournamentView> = {},
): ViewerTournamentView {
  const match = (id: string, a: string, b: string) =>
    matches.find((m) => m.id === id) ?? unreportedMatch(id, a, b);
  return {
    format: 'RoundRobin',
    swissRoundOption: null,
    publicDecklists: false,
    showsDecklists: false,
    state: 'Playing',
    roundCount: 0,
    lastCompletedRound: 0,
    entries: [alice.id, bob.id, carol.id].map((playerId) => ({
      playerId,
      dropped: false,
      seed: null,
    })),
    rounds: [
      {
        round: 1,
        correctable: true,
        matches: [
          match('m2', alice.id, bob.id),
          match('m1', bob.id, carol.id),
          match('m3', carol.id, alice.id),
        ],
        byes: [],
      },
    ],
    bracket: null,
    standings: [standing(alice.id, 1), standing(bob.id, 1), standing(carol.id, 1)],
    trophyHolders: [],
    completeRoundGrants: null,
    standingsAwaitCompletedRounds: false,
    reopenRound: null,
    canJoin: false,
    joinRefusal: null,
    ...fields,
  };
}

/**
 * A Swiss tournament of Alice, Bob and Carol being played until there's a
 * winner, over 2 tournament rounds: round 1 is completed, Carol having
 * beaten Bob 2–0 (m1) while Alice had a bye; in round 2 Alice plays Carol
 * (m2) while Bob has a bye. `fields` changes any of it.
 */
export function swissPlaying(fields: Partial<ViewerTournamentView> = {}): ViewerTournamentView {
  return {
    format: 'Swiss',
    swissRoundOption: 'UntilWinner',
    publicDecklists: false,
    showsDecklists: false,
    state: 'Playing',
    roundCount: 2,
    lastCompletedRound: 1,
    entries: [alice.id, bob.id, carol.id].map((playerId) => ({
      playerId,
      dropped: false,
      seed: null,
    })),
    rounds: [
      {
        round: 1,
        correctable: false,
        matches: [reported(unreportedMatch('m1', carol.id, bob.id), [2, 0], carol.id)],
        byes: [alice.id],
      },
      {
        round: 2,
        correctable: true,
        matches: [unreportedMatch('m2', alice.id, carol.id)],
        byes: [bob.id],
      },
    ],
    bracket: null,
    standings: [
      standing(alice.id, 1, { matchPoints: 3 }),
      standing(carol.id, 1, { matchPoints: 3 }),
      standing(bob.id, 3),
    ],
    trophyHolders: [],
    completeRoundGrants: 'GrantedDraws',
    standingsAwaitCompletedRounds: true,
    reopenRound: { round: 1, refusal: null, takesBackDrops: [] },
    canJoin: false,
    joinRefusal: null,
    ...fields,
  };
}

/**
 * The tournament `view` once it is complete: none of its rounds
 * correctable any more, as the api reads it.
 */
export function completed(view: ViewerTournamentView): ViewerTournamentView {
  return {
    ...view,
    state: 'Complete',
    rounds: view.rounds.map((round) => ({ ...round, correctable: false })),
  };
}

/** The tournament rounds of `swissPlaying`, round 2's match m2 replaced by `m2`, and round 1's by `m1` if given. */
export function swissRoundsWith(m2: MatchView, m1?: MatchView): TournamentRoundView[] {
  const [first, second] = swissPlaying().rounds;
  return [m1 ? { ...first, matches: [m1] } : first, { ...second, matches: [m2] }];
}

/** A side of a bracket place that is the player `playerId`. */
export const side = (playerId: string): BracketSideView => ({ kind: 'Player', playerId });

/** A side of a bracket place that is the winner to come of bracket place `bracketPlace` of the round before. */
export const winnerToCome = (bracketPlace: number): BracketSideView => ({
  kind: 'WinnerToCome',
  bracketPlace,
});

/** Bracket place `bracketPlace` with its match `matchId`, if paired, its `sides` and the player `advancing` from it, if agreed. */
export const place = (
  bracketPlace: number,
  matchId: string | null,
  sides: [BracketSideView, BracketSideView],
  advancing: string | null = null,
): BracketPlaceView => ({ bracketPlace, matchId, sides, advancing });

/** Round 1 of the bracket of Alice, Bob and Carol: Alice's bye, and Bob v Carol (m1), won by `winner` if decided. */
export const firstBracketRound = (winner: string | null = null): BracketRoundView => ({
  round: 1,
  places: [
    place(0, null, [side(alice.id), { kind: 'Bye' }], alice.id),
    place(1, 'm1', [side(bob.id), side(carol.id)], winner),
  ],
});

/**
 * A single elimination tournament of Alice, Bob and Carol being played,
 * seeded in that order, over 2 tournament rounds: in round 1 Alice, the top
 * seed, has a bye at bracket place 0, and Bob plays Carol (m1) at bracket
 * place 1; the final waits for its winner. `fields` changes any of it.
 */
export function singleEliminationPlaying(
  fields: Partial<ViewerTournamentView> = {},
): ViewerTournamentView {
  return {
    format: 'SingleElimination',
    swissRoundOption: null,
    publicDecklists: false,
    showsDecklists: false,
    state: 'Playing',
    roundCount: 2,
    lastCompletedRound: 0,
    entries: [alice.id, bob.id, carol.id].map((playerId, i) => ({
      playerId,
      dropped: false,
      seed: i + 1,
    })),
    rounds: [
      {
        round: 1,
        correctable: true,
        matches: [{ ...unreportedMatch('m1', bob.id, carol.id), bracketPlace: 1 }],
        byes: [alice.id],
      },
    ],
    bracket: [
      firstBracketRound(),
      { round: 2, places: [place(0, null, [side(alice.id), winnerToCome(1)])] },
    ],
    standings: [standing(alice.id, 1), standing(bob.id, 1), standing(carol.id, 1)],
    trophyHolders: [],
    completeRoundGrants: 'GrantedWins',
    standingsAwaitCompletedRounds: true,
    reopenRound: null,
    canJoin: false,
    joinRefusal: null,
    ...fields,
  };
}

/**
 * Round 1 of the single elimination tournament of Alice, Bob and Carol,
 * Carol having beaten Bob 2–1 (m1) as she reported it, `confirmed` by Bob
 * or not, open unless `completed`.
 */
export const carolBeatBob = (confirmed = false, completed = false): TournamentRoundView => ({
  round: 1,
  correctable: !completed,
  matches: [
    {
      ...reported(unreportedMatch('m1', bob.id, carol.id), [1, 2], carol.id),
      bracketPlace: 1,
      confirmed,
    },
  ],
  byes: [alice.id],
});

/**
 * The single elimination tournament of Alice, Bob and Carol with round 1
 * completed, Carol having beaten Bob 2–1, and the final of Alice and Carol
 * (m2) unreported.
 */
export const singleEliminationFinal = singleEliminationPlaying({
  lastCompletedRound: 1,
  rounds: [
    carolBeatBob(false, true),
    {
      round: 2,
      correctable: true,
      matches: [{ ...unreportedMatch('m2', alice.id, carol.id), bracketPlace: 0 }],
      byes: [],
    },
  ],
  bracket: [
    firstBracketRound(carol.id),
    { round: 2, places: [place(0, 'm2', [side(alice.id), side(carol.id)])] },
  ],
});

/** `match` forfeited by the player `forfeitedBy`. */
export const forfeited = (match: MatchView, forfeitedBy: string): MatchView => ({
  ...match,
  outcome: { kind: 'Forfeit', forfeitedBy },
});

/**
 * The tournament of Alice, Bob and Carol being played, the players with
 * these ids dropped and `matches` replacing any of its matches by id.
 */
export const withDrops = (
  droppedIds: string[],
  matches: MatchView[] = [],
): ViewerTournamentView => {
  const tournament = playing(matches);
  return {
    ...tournament,
    entries: tournament.entries.map((entry) => ({
      ...entry,
      dropped: droppedIds.includes(entry.playerId),
    })),
  };
};

/** The complete draft of Alice, Bob and Carol. */
export const threePlayers: DraftFixture = { players: [alicePlayer, bob, carol] };

/** The complete draft as it is with `tournament` set up, or with none. */
export const withTournament = (
  tournament: ViewerTournamentView | null,
  fields: DraftFixture = {},
): DraftFixture => ({
  ...complete,
  tournament: tournament && { state: tournament.state },
  ...fields,
});

/** Answers the page's GET of draft-1's tournament with `tournament`. */
export async function flushTournament(tournament: ViewerTournamentView) {
  (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/tournament'))).flush(tournament);
}

/**
 * Opens the complete draft's page with `tournament` set up, or none, signed
 * in as `user` (Alice, a player, unless told otherwise) with `powers`, and
 * answers its reads, `cards` its pool's, `plan` the signed-in player's,
 * `decklists` the tournament's, the draft's `fields` changed, at `url`.
 */
export async function openComplete(
  tournament: ViewerTournamentView | null,
  {
    powers,
    user = alice,
    cards,
    plan = EMPTY_PLAN,
    decklists,
    fields = {},
    url,
  }: {
    powers?: DraftPowersView;
    user?: UserView;
    cards?: PoolCardView[];
    plan?: PlanView;
    decklists?: DecklistView[];
    fields?: DraftFixture;
    url?: string;
  } = {},
) {
  return openDraft(completeSnapshot, withTournament(tournament, fields), {
    powers,
    user,
    cards,
    plan,
    tournament: tournament ?? undefined,
    decklists,
    url,
  });
}

/** Opens the Play tab and returns its panel. */
export const openPlayTab = (fixture: AppFixture, page: HTMLElement) =>
  openTab(fixture, page, 'Play');

/** Opens the Play tab of the draft of Alice, Bob and Carol, with `tournament`. */
export async function openPlaying(
  tournament: ViewerTournamentView,
  options: Parameters<typeof openComplete>[1] = {},
) {
  const opened = await openComplete(tournament, { fields: threePlayers, ...options });
  const tab = await openPlayTab(opened.fixture, opened.page);
  return { ...opened, tab };
}

/**
 * Opens the Play tab of the draft of Alice, Bob and Carol, with `tournament`,
 * for an organizer unless `options` say otherwise, and presses Complete round:
 * returns what `openPlaying` does, with the Complete round dialog.
 */
export async function openCompleteRound(
  tournament: ViewerTournamentView,
  options: Parameters<typeof openComplete>[1] = {},
) {
  const opened = await openPlaying(tournament, { powers: ORGANIZE_ONLY, ...options });
  button(opened.tab, 'Complete round')!.click();
  await opened.fixture.whenStable();
  return { ...opened, dialog: openDialog()! };
}

/** The standings table inside `root`. */
const standingsTable = (root: HTMLElement) => table(root, 'Standings')!;

/** The standings' column headers inside `root`, each spelled out where it is abbreviated. */
export const standingsColumns = (root: HTMLElement) => tableColumns(standingsTable(root));

/**
 * Which tournament round the standings inside `root` are as of, as the
 * table's description reads; null if it has none.
 */
export function standingsAsOf(root: HTMLElement): string | null {
  const id = standingsTable(root).getAttribute('aria-describedby');
  return id ? text(root.querySelector<HTMLElement>(`#${id}`)!) : null;
}

/** Each row of the standings inside `root`, best first, as its cells' text. */
export const standingsRows = (root: HTMLElement) => tableRows(standingsTable(root));

/** The results grid inside `root`, round robin's; null if there is none. */
export const resultsGrid = (root: HTMLElement) => table(root, 'Results grid');

/** The results grid's column headers inside `root`, each spelled out where it is abbreviated. */
export const gridColumns = (root: HTMLElement) => tableColumns(resultsGrid(root)!);

/** Each row of the results grid inside `root`, in standings order, as its cells' visible text. */
export const gridRows = (root: HTMLElement) => tableRows(resultsGrid(root)!);

/**
 * The results grid's cell inside `root` holding `row`'s result against
 * `column`, both players' names, found by its accessible name, which
 * starts "Row against Column:".
 */
export const gridCell = (root: HTMLElement, row: string, column: string) =>
  [...resultsGrid(root)!.querySelectorAll<HTMLElement>('td')].find((cell) =>
    accessibleName(cell).startsWith(`${row} against ${column}:`),
  );

/** The accessible name of the results grid's cell inside `root` of `row`'s result against `column`. */
export const gridCellName = (root: HTMLElement, row: string, column: string) =>
  accessibleName(gridCell(root, row, column)!);

/**
 * Each item's text in `list`, in order, as a viewer reads it: its buttons
 * and groups of buttons left out, however its text is wrapped.
 */
export const itemTexts = (list: Element) =>
  [...list.querySelectorAll(':scope > li')].map((li) => {
    const shown = li.cloneNode(true) as HTMLElement;
    shown.querySelectorAll('button, [role="group"]').forEach((control) => control.remove());
    return text(shown);
  });

/** Each line of the signed-in player's Your matches inside `root`, leaving out its buttons. */
export const yourMatches = (root: HTMLElement) =>
  itemTexts(region(root, 'Your matches')!.querySelector('ul')!);

/** The lists of matches or bracket places inside `root`, one per tournament round named by its label, in round order. */
const roundLists = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('ol, ul, [role="list"]')].filter((list) =>
    /^(Tournament round \d+|Final|Semifinal|Quarterfinal)$/.test(accessibleName(list)),
  );

/** The names of the lists of matches by tournament round inside `root`, in page order. */
export const roundLabels = (root: HTMLElement) =>
  roundLists(root).map((list) => accessibleName(list));

/** The bracket inside `root`, by its region; null if there is none. */
export const bracket = (root: HTMLElement) => region(root, 'Bracket');

/** Each match of the bracket's tournament round `round` inside `root` by its accessible name, byes included, in order. */
export const bracketMatches = (root: HTMLElement, round: number) =>
  [...roundLists(bracket(root)!)[round - 1].querySelectorAll('li')].map((li) => accessibleName(li));

/** The bracket's matches inside `root` highlighted as the signed-in player's path, by accessible name, in order. */
export const ownPath = (root: HTMLElement) =>
  [...bracket(root)!.querySelectorAll('li[aria-current="true"]')].map((li) => accessibleName(li));

/** The names listed as joined inside `root`, in order, leaving out their buttons. */
export const joinedNames = (root: HTMLElement) => itemTexts(namedList(root, 'Joined players'));

/** Each player in the Players list inside `root` as it reads, leaving out its buttons. */
export const playerLines = (root: HTMLElement) => itemTexts(namedList(root, 'Players'));

/** The tournament's state list inside `root`, by its name; null if there is none. */
const stateList = (root: HTMLElement) => findNamedList(root, 'Tournament state');

/**
 * Each step of the tournament's state list inside `root` as it reads, its
 * hidden completed or not completed text included, such as "Registration,
 * completed"; none when there is no list.
 */
export const stateSteps = (root: HTMLElement) =>
  [...(stateList(root)?.querySelectorAll('li') ?? [])].map((li) => text(li));

/** The steps of the state list inside `root` marked as the current step, as they read. */
export const currentSteps = (root: HTMLElement) =>
  [...(stateList(root)?.querySelectorAll('li[aria-current="step"]') ?? [])].map((li) => text(li));

/** Where the tournament stands, as the state list inside `root` is described; '' if there is none. */
export const progressLine = (root: HTMLElement) => {
  const list = stateList(root);
  return list ? accessibleDescription(list) : '';
};

/** What the status messages inside `root` say, leaving out those saying nothing yet. */
export const announcements = (root: HTMLElement) => statusTexts(root).filter(Boolean);

/**
 * Pushes the complete draft of Alice, Bob and Carol at `version` with
 * `tournament`, as another viewer's change does, and answers the reads it
 * makes for Dave, who isn't one of its players, or, `asPlayer`, for one
 * who is, their queue and plan included.
 */
export async function pushTournament(
  fixture: AppFixture,
  tournament: ViewerTournamentView,
  version: number,
  { asPlayer = false }: { asPlayer?: boolean } = {},
) {
  updates.events.next({
    type: 'changed',
    draft: draft({ ...withTournament(tournament, threePlayers), version }),
  });
  await flushPicks([]);
  if (asPlayer) await flushQueueAndPlan();
  await flushTournament(tournament);
  await fixture.whenStable();
}

/** Whether the tab bar has a Play tab. */
export const hasPlayTab = (page: HTMLElement) => !!tabButton(page, 'Play');

/**
 * Answers a tournament change with the complete draft at `version`, its
 * tournament now `tournament` or gone, then the reads the newer version
 * re-reads, for Alice, a player.
 */
export async function answerChange(
  fixture: AppFixture,
  url: string,
  method: string,
  tournament: ViewerTournamentView | null,
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
