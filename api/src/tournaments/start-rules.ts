import { MIN_MAINBOARD_CARDS, type TournamentRefusal } from 'contract';
import type { Prisma } from '../generated/prisma/client.js';
import { MAINBOARD_COUNT, mainboard } from './mainboard-rules.js';

/** What Start reads of each joined player to check their deck. */
export const STARTING_PLAYER = {
  user: { select: { name: true, isBot: true } },
  ...MAINBOARD_COUNT,
} satisfies Prisma.PlayerSelect;

export type StartingPlayer = Prisma.PlayerGetPayload<{
  select: typeof STARTING_PLAYER;
}>;

/**
 * Why Start would be refused for the decks of the joined players
 * `players`, in join order, or null if it wouldn't: a human player's
 * mainboard, cards plus basic lands, holds fewer than MIN_MAINBOARD_CARDS.
 * The refusal names every such player. Bots are exempt, as their decks are
 * whatever they drafted (ADR 0008).
 */
export function deckRefusal(
  players: StartingPlayer[],
): TournamentRefusal | null {
  const short = players
    .filter((player) => !player.user.isBot)
    .map((player) => ({ name: player.user.name, cards: mainboard(player) }))
    .filter(({ cards }) => cards < MIN_MAINBOARD_CARDS);
  if (short.length === 0) return null;
  const listed = short
    .map(({ name, cards }) => `${name} (${cards})`)
    .join(', ');
  return {
    error: 'deck-too-small',
    message: `A tournament deck needs at least ${MIN_MAINBOARD_CARDS} mainboard cards. ${short.length === 1 ? 'This player’s holds' : 'These players’ hold'} fewer: ${listed}. They can fill their deck or leave, or an organizer can remove them.`,
  };
}
