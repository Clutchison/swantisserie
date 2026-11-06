import type {
  BracketRoundView,
  MatchOutcomeView,
  MatchView,
  TournamentFormat,
  TournamentRoundView,
  TournamentView,
} from 'contract';
import {
  agreedAdvancingPlayer,
  bracketRounds,
  bracketTrophyHolders,
  droppedPlayers,
  roundRobinRoundCount,
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
      player: { select: { userId: true } },
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
 * byes included; round robin's count every result and ignore byes, as
 * every player has equally many.
 */
export function toTournamentView(row: TournamentRow): TournamentView {
  const order = new Map(row.entries.map((entry, i) => [entry.id, i]));
  const userOf = new Map(
    row.entries.map((entry) => [entry.id, entry.player.userId]),
  );
  const user = (entryId: string) => userOf.get(entryId)!;

  const rounds: TournamentRoundView[] = [];
  const sorted = [...row.matches].sort(
    (a, b) =>
      a.round - b.round ||
      (a.bracketPlace ?? 0) - (b.bracketPlace ?? 0) ||
      order.get(a.firstEntryId)! - order.get(b.firstEntryId)!,
  );
  for (const match of sorted) {
    let round = rounds.at(-1);
    if (round?.round !== match.round) {
      round = { round: match.round, matches: [], byes: [] };
      rounds.push(round);
    }
    if (match.secondEntryId === null) round.byes.push(user(match.firstEntryId));
    else round.matches.push(toMatchView(match, user));
  }

  const players = row.entries.map((entry) => entry.player.userId);
  const entries = row.entries.map((entry) => ({
    playerId: entry.player.userId,
    dropped: entry.dropped,
    seed: entry.seed,
  }));
  const dropped = droppedPlayers(entries);
  const counted = rounds.filter((round) => countsInStandings(row, round.round));
  const matches = counted
    .flatMap((round) => round.matches)
    .map(toTournamentMatch);
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
              byesOf(counted),
              dropped,
            )
          : standings(players, matches);
  const count = roundCount(row, players.length);
  const bracket =
    row.format === 'SingleElimination' && row.state !== 'Registration'
      ? toBracket(row, count, sorted, user, dropped)
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
    trophyHolders: !complete
      ? []
      : bracket
        ? bracketTrophyHolders(bracket)
        : trophyHolders(table),
  };
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
 * sending on the player who advances from it as the engine's
 * agreedAdvancingPlayer decides, `dropped` holding the dropped players,
 * and each bracket place carrying the id of its match, a bye's none.
 */
function toBracket(
  row: Pick<TournamentRow, 'state' | 'lastCompletedRound'>,
  roundCount: number,
  matches: readonly MatchRow[],
  user: (entryId: string) => string,
  dropped: readonly string[],
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
        { players, outcome: null, reportedBy: null, confirmed: false },
        dropped,
        roundCompleted,
      );
      return { ...place, players, advancing };
    }
    const { players, outcome, reportedBy, confirmed } = toMatchView(
      match,
      user,
    );
    const advancing = agreedAdvancingPlayer(
      {
        players,
        outcome: outcome.kind === 'Unreported' ? null : outcome,
        reportedBy,
        confirmed,
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
 * with `joined` players, as the engine counts them; none for fewer than 2.
 */
export function roundCount(
  {
    format,
    swissRoundOption,
  }: Pick<TournamentRow, 'format' | 'swissRoundOption'>,
  joined: number,
): number {
  if (joined < 2) return 0;
  if (format === 'Swiss') return swissRoundCount(joined, swissRoundOption!);
  if (format === 'SingleElimination')
    return singleEliminationRoundCount(joined);
  return roundRobinRoundCount(joined);
}

function toMatchView(
  match: MatchRow,
  user: (entryId: string) => string,
): MatchView {
  const players: [string, string] = [
    user(match.firstEntryId),
    user(match.secondEntryId!),
  ];
  return {
    id: match.id,
    players,
    bracketPlace: match.bracketPlace,
    outcome: toOutcome(match, players),
    reportedBy: match.reportedById,
    confirmed: match.confirmed,
  };
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

function toTournamentMatch({ players, outcome }: MatchView): TournamentMatch {
  return {
    players,
    outcome: outcome.kind === 'Unreported' ? null : outcome,
  };
}
