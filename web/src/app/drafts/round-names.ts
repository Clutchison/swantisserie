import type { TournamentFormat } from 'contract';

/** Single elimination's last tournament rounds by name, from the final back, as far as the bracket has them. */
const NAMED_ROUNDS = ['Final', 'Semifinal', 'Quarterfinal'];

/** The name of tournament round `round` of `roundCount`, if it has one: in single elimination, the final, semifinal or quarterfinal. */
export function namedRound(
  format: TournamentFormat,
  round: number,
  roundCount: number,
): string | undefined {
  return format === 'SingleElimination' ? NAMED_ROUNDS[roundCount - round] : undefined;
}

/** Tournament round `round` by name where it has one, else "Tournament round 2". */
export function roundName(format: TournamentFormat, round: number, roundCount: number): string {
  return namedRound(format, round, roundCount) ?? `Tournament round ${round}`;
}

/** `roundName` in running text: "in the final", "in tournament round 2". */
export function inRound(format: TournamentFormat, round: number, roundCount: number): string {
  const named = namedRound(format, round, roundCount);
  return named ? `in the ${named.toLowerCase()}` : `in tournament round ${round}`;
}
