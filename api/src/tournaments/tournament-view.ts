import {
  type BracketRoundView,
  type MatchOutcomeView,
  type MatchView,
  MIN_TOURNAMENT_PLAYERS,
  type TournamentFormat,
  type TournamentRoundView,
  type TournamentView,
} from 'contract';
import {
  agreedAdvancingPlayer,
  bracketRounds,
  byesSendingOn,
  droppedPlayers,
  singleEliminationRoundCount,
  singleEliminationStandings,
  standings,
  swissRoundCount,
  swissStandings,
  trophyHolders,
  type PlayedBracketMatch,
  type RoundAndBracketPlace,
  type TournamentMatch,
} from 'engine';
import type { Prisma } from '../generated/prisma/client.js';
import { correctionRefusal } from './correction-refusal.js';
import { clearing, confirmRefusal } from './match-rules.js';
import { droppable } from './tournament-matches.js';
import { offersReopenRound, reopenRoundOf } from './reopen-round.js';

/** What the tournament read selects of a tournament. */
export const TOURNAMENT_VIEW = {
  format: true,
  swissRoundOption: true,
  publicDecklists: true,
  state: true,
  lastCompletedRound: true,
  reopenedRound: true,
  entries: {
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      dropped: true,
      droppedAfterRound: true,
      seed: true,
      player: { select: { userId: true, user: { select: { isBot: true } } } },
    },
  },
  matches: {
    orderBy: [{ round: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      round: true,
      bracketPlace: true,
      firstEntryId: true,
      secondEntryId: true,
      outcome: true,
      firstGames: true,
      secondGames: true,
      drawnGames: true,
      forfeitedBy: true,
      grantedTo: true,
      reportedById: true,
      confirmed: true,
    },
  },
} satisfies Prisma.TournamentSelect;

/**
 * What a format does that the web reads rather than decides by the
 * format: what Complete round grants, and whether the standings wait for
 * completed tournament rounds.
 */
export const FORMAT_RULES: Record<
  TournamentFormat,
  Pick<TournamentView, 'completeRoundGrants' | 'standingsAwaitCompletedRounds'>
> = {
  RoundRobin: {
    completeRoundGrants: null,
    standingsAwaitCompletedRounds: false,
  },
  Swiss: {
    completeRoundGrants: 'GrantedDraws',
    standingsAwaitCompletedRounds: true,
  },
  // Single elimination never has a draw.
  SingleElimination: {
    completeRoundGrants: 'GrantedWins',
    standingsAwaitCompletedRounds: true,
  },
};

/** A tournament as its read selects it. */
export type TournamentRow = Prisma.TournamentGetPayload<{
  select: typeof TOURNAMENT_VIEW;
}>;
type MatchRow = TournamentRow['matches'][number];

/**
 * The tournament as everyone who sees its draft reads it: its entries in
 * join order, its rounds in order, each round's matches and byes in
 * bracket place order in single elimination, and otherwise in the order of
 * their first players' joining, and its standings and trophy holders. Swiss
 * and single elimination standings count only completed tournament rounds,
 * byes included; round robin's count every result. Round robin, which has
 * no tournament rounds, reads as one round of every match, with no byes.
 */
export function toTournamentView(row: TournamentRow): TournamentView {
  const order = new Map(row.entries.map((entry, i) => [entry.id, i]));
  const userOf = new Map(
    row.entries.map((entry) => [entry.id, entry.player.userId]),
  );
  const user = (entryId: string) => userOf.get(entryId)!;
  const droppedEntries = new Set(
    row.entries.filter((entry) => entry.dropped).map((entry) => entry.id),
  );
  const toMatch = (match: MatchRow) =>
    toMatchView(match, user, (entryId) => droppedEntries.has(entryId));

  const rounds: TournamentRoundView[] = [];
  const sorted = [...row.matches].sort(
    (a, b) =>
      (row.format === 'RoundRobin' ? 0 : a.round - b.round) ||
      (a.bracketPlace ?? 0) - (b.bracketPlace ?? 0) ||
      order.get(a.firstEntryId)! - order.get(b.firstEntryId)! ||
      (order.get(a.secondEntryId ?? '') ?? -1) -
        (order.get(b.secondEntryId ?? '') ?? -1),
  );
  // Round robin has no tournament rounds: every match reads as round 1's,
  // and the byes of tournaments started before that are left out.
  const roundRobin = row.format === 'RoundRobin';
  for (const match of sorted) {
    const number = roundRobin ? 1 : match.round;
    let round = rounds.at(-1);
    if (round?.round !== number) {
      round = {
        round: number,
        correctable: correctionRefusal(row, number) === null,
        matches: [],
        byes: [],
      };
      rounds.push(round);
    }
    if (match.secondEntryId !== null) round.matches.push(toMatch(match));
    else if (!roundRobin) round.byes.push(user(match.firstEntryId));
  }

  const players = row.entries.map((entry) => entry.player.userId);
  const entries = row.entries.map((entry) => ({
    playerId: entry.player.userId,
    dropped: entry.dropped,
    droppable: droppable(entry),
    seed: entry.seed,
  }));
  const dropped = droppedPlayers(entries);
  const counted = rounds.filter((round) => countsInStandings(row, round.round));
  const paired = pairedPlayers(rounds);
  const nextRoundPlayers = (round: number) => paired.get(round + 1) ?? [];
  const matches = counted.flatMap((round) =>
    round.matches.map((match) => ({
      ...toTournamentMatch(match),
      nextRoundPlayers: nextRoundPlayers(round.round),
    })),
  );
  const table =
    row.state === 'Registration'
      ? []
      : row.format === 'Swiss'
        ? swissStandings(players, matches, byesOf(counted))
        : row.format === 'SingleElimination'
          ? singleEliminationStandings(
              [...row.entries]
                .sort((a, b) => a.seed! - b.seed!)
                .map((entry) => entry.player.userId),
              matches,
              byesSendingOn(
                counted.map((round) => ({
                  byes: round.byes,
                  nextRoundPlayers: nextRoundPlayers(round.round),
                })),
                dropped,
              ),
              dropped,
            )
          : standings(players, matches);
  const count = roundCount(row, players.length);
  const bracket =
    row.format === 'SingleElimination' && row.state !== 'Registration'
      ? toBracket(row, count, sorted, user, toMatch, dropped, nextRoundPlayers)
      : null;
  const complete = row.state === 'Complete';
  return {
    format: row.format,
    swissRoundOption: row.swissRoundOption,
    publicDecklists: row.publicDecklists,
    showsDecklists: showsDecklists(row),
    state: row.state,
    roundCount: count,
    lastCompletedRound: row.lastCompletedRound,
    entries,
    rounds,
    bracket,
    ...FORMAT_RULES[row.format],
    reopenRound: offersReopenRound(row) ? reopenRoundOf(row) : null,
    standings: table,
    trophyHolders: complete ? trophyHolders(table) : [],
  };
}

/**
 * The players paired in each tournament round of `rounds`, in a match or a
 * bye, by its number.
 */
function pairedPlayers(
  rounds: readonly TournamentRoundView[],
): Map<number, string[]> {
  return new Map(
    rounds.map((round) => [
      round.round,
      [...round.matches.flatMap((match) => match.players), ...round.byes],
    ]),
  );
}

/**
 * Whether tournament round `round` counts in the standings: always where
 * the format's standings don't wait for completed tournament rounds, as in
 * round robin; otherwise once it's completed, or once the tournament is.
 */
function countsInStandings(
  row: Pick<TournamentRow, 'format' | 'state' | 'lastCompletedRound'>,
  round: number,
): boolean {
  return (
    !FORMAT_RULES[row.format].standingsAwaitCompletedRounds ||
    row.state === 'Complete' ||
    round <= row.lastCompletedRound
  );
}

/**
 * Whether the tournament's decklists may be read: under public decklists,
 * once it has started, whether playing or complete.
 */
export function showsDecklists(
  row: Pick<TournamentRow, 'publicDecklists' | 'state'>,
): boolean {
  return row.publicDecklists && row.state !== 'Registration';
}

/**
 * The bracket of the single elimination tournament `row`, of `roundCount`
 * tournament rounds, drawn by the engine from its paired `matches`, each
 * read by `toMatch`, sending on the player who advances from it as the engine's
 * agreedAdvancingPlayer decides, `dropped` holding the dropped players and
 * `nextRoundPlayers` those paired in the tournament round after a
 * tournament round,
 * and each bracket place carrying the id of its match, a bye's none.
 */
function toBracket(
  row: Pick<TournamentRow, 'state' | 'lastCompletedRound'>,
  roundCount: number,
  matches: readonly MatchRow[],
  user: (entryId: string) => string,
  toMatch: (match: MatchRow) => MatchView,
  dropped: readonly string[],
  nextRoundPlayers: (round: number) => string[],
): BracketRoundView[] {
  const played = matches.map((match): PlayedBracketMatch => {
    const place: RoundAndBracketPlace = {
      round: match.round,
      bracketPlace: match.bracketPlace!,
    };
    const roundCompleted =
      row.state === 'Complete' || match.round <= row.lastCompletedRound;
    if (match.secondEntryId === null) {
      const players = [user(match.firstEntryId), null] as const;
      const advancing = agreedAdvancingPlayer(
        {
          players,
          outcome: null,
          reportedBy: null,
          confirmed: false,
          nextRoundPlayers: nextRoundPlayers(match.round),
        },
        dropped,
        roundCompleted,
      );
      return { ...place, players, advancing };
    }
    const { players, outcome, reportedBy, confirmed } = toMatch(match);
    const advancing = agreedAdvancingPlayer(
      {
        players,
        outcome: outcome.kind === 'Unreported' ? null : outcome,
        reportedBy,
        confirmed,
        nextRoundPlayers: nextRoundPlayers(match.round),
      },
      dropped,
      roundCompleted,
    );
    return { ...place, players, advancing };
  });
  const matchAt = (round: number, bracketPlace: number) =>
    matches.find(
      (match) =>
        match.round === round &&
        match.bracketPlace === bracketPlace &&
        match.secondEntryId !== null,
    );
  return bracketRounds(roundCount, played, dropped).map(
    ({ round, places }) => ({
      round,
      places: places.map(({ bracketPlace, sides, advancing }) => ({
        bracketPlace,
        matchId: matchAt(round, bracketPlace)?.id ?? null,
        sides,
        advancing,
      })),
    }),
  );
}

/** The player with each bye in `rounds`, once per bye. */
export function byesOf(rounds: readonly TournamentRoundView[]): string[] {
  return rounds.flatMap((round) => round.byes);
}

/**
 * How many tournament rounds a tournament of `format` has, or will have,
 * with `joined` players, as the engine counts them; none for fewer than 2,
 * and none in round robin.
 */
export function roundCount(
  {
    format,
    swissRoundOption,
  }: Pick<TournamentRow, 'format' | 'swissRoundOption'>,
  joined: number,
): number {
  if (joined < MIN_TOURNAMENT_PLAYERS || format === 'RoundRobin') return 0;
  if (format === 'Swiss') return swissRoundCount(joined, swissRoundOption!);
  return singleEliminationRoundCount(joined);
}

/**
 * `match` as the read shows it, `user` giving the player of an entry and
 * `dropped` whether they have dropped: with who may confirm it, as
 * confirming decides, and what clearing it would leave, as clearing does.
 */
function toMatchView(
  match: MatchRow,
  user: (entryId: string) => string,
  dropped: (entryId: string) => boolean,
): MatchView {
  const entries = [match.firstEntryId, match.secondEntryId!];
  const players = entries.map(user) as [string, string];
  const outcome = toOutcome(match, players);
  const cleared = toOutcome(clearing(entries.map(dropped)), players);
  return {
    id: match.id,
    players,
    bracketPlace: match.bracketPlace,
    outcome,
    reportedBy: match.reportedById,
    confirmed: match.confirmed,
    confirmableBy: match.confirmed
      ? []
      : players.filter(
          (player) => confirmRefusal({ ...match, players }, player) === null,
        ),
    clearLeaves: sameOutcome(cleared, outcome) ? null : cleared,
  };
}

/**
 * Whether `cleared`, what clearing a match leaves, is its `outcome`
 * already: both unreported, or both the same player's forfeit.
 */
function sameOutcome(
  cleared: MatchOutcomeView,
  outcome: MatchOutcomeView,
): boolean {
  if (cleared.kind === 'Forfeit') {
    return (
      outcome.kind === 'Forfeit' && outcome.forfeitedBy === cleared.forfeitedBy
    );
  }
  return cleared.kind === outcome.kind;
}

/** The outcome of `match`, whose players, in its order, are `first` and `second`. */
export function toOutcome(
  match: Pick<
    MatchRow,
    | 'outcome'
    | 'firstGames'
    | 'secondGames'
    | 'drawnGames'
    | 'forfeitedBy'
    | 'grantedTo'
  >,
  [first, second]: [string, string],
): MatchOutcomeView {
  switch (match.outcome) {
    case 'Unreported':
    case 'GrantedDraw':
      return { kind: match.outcome };
    case 'GameScore':
      return {
        kind: 'GameScore',
        games: [match.firstGames, match.secondGames],
        draws: match.drawnGames,
      };
    case 'Forfeit':
      return {
        kind: 'Forfeit',
        forfeitedBy: match.forfeitedBy === 'First' ? first : second,
      };
    case 'GrantedWin':
      return {
        kind: 'GrantedWin',
        winner: match.grantedTo === 'First' ? first : second,
      };
  }
}

/** `match` as the engine reads it: an unreported match has no outcome. */
export function toTournamentMatch({
  players,
  outcome,
}: MatchView): TournamentMatch {
  return {
    players,
    outcome: outcome.kind === 'Unreported' ? null : outcome,
  };
}
