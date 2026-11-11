import {
  TOURNAMENT_FORMAT_NAMES,
  type SwissRoundOption,
  type TournamentFormat,
  type TournamentView,
} from 'contract';
import { SWISS_ROUND_CAP } from 'engine';
import { capitalised } from '../record';

/** The format’s name as the Play tab starts a line with it, such as "Round robin". */
export function formatName(format: TournamentFormat): string {
  return capitalised(TOURNAMENT_FORMAT_NAMES[format]);
}

/** How tournament setup names each Swiss round option, and how the Play tab sums it up. */
export const SWISS_ROUND_OPTION_NAMES: Record<SwissRoundOption, { name: string; summary: string }> =
  {
    UntilWinner: { name: 'Until there’s a winner', summary: 'until there’s a winner' },
    CappedAt3: {
      name: `Capped at ${SWISS_ROUND_CAP} tournament rounds`,
      summary: `capped at ${SWISS_ROUND_CAP}`,
    },
  };

/**
 * The tournament's format, and for Swiss its round option, with how many
 * tournament rounds it has, or will have, if any, such as "Swiss, capped
 * at 3: 3 tournament rounds".
 */
export function summaryOf({ format, swissRoundOption, roundCount }: TournamentView): string {
  const name =
    // Only Swiss has a round option.
    swissRoundOption
      ? `Swiss, ${SWISS_ROUND_OPTION_NAMES[swissRoundOption].summary}`
      : formatName(format);
  if (roundCount === 0) return name;
  return `${name}: ${roundCount} tournament ${roundCount === 1 ? 'round' : 'rounds'}`;
}
