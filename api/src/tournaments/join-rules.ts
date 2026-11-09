import {
  MIN_MAINBOARD_CARDS,
  type TournamentRefusal,
  type TournamentState,
  type ViewerTournamentView,
} from 'contract';
import type { Prisma } from '../generated/prisma/client.js';

/** What joining reads of one of the draft's players. */
export const JOINING_PLAYER = {
  user: { select: { isBot: true } },
  tournamentEntry: { select: { id: true } },
} satisfies Prisma.PlayerSelect;

export type JoiningPlayer = Prisma.PlayerGetPayload<{
  select: typeof JOINING_PLAYER;
}>;

/**
 * Why the draft's player `player` can't join its tournament during
 * registration, or null if they can: they are a bot, which joins at
 * tournament setup and never leaves, or have joined already. Their deck
 * plays no part: Start checks it. Joining asks this, and so do the
 * tournament read and the draft list's tournament badge, through
 * `viewerJoin`, so they offer Join only where joining would succeed.
 */
export function joinRefusal(player: JoiningPlayer): TournamentRefusal | null {
  if (player.user.isBot) {
    return {
      error: 'bots-cannot-join',
      message: 'Bots join a tournament at its setup.',
    };
  }
  if (player.tournamentEntry) {
    return {
      error: 'already-joined',
      message: 'You have already joined this tournament.',
    };
  }
  return null;
}

/**
 * Whether the viewer may join a tournament in `state` now, and why joining
 * would refuse them, as `joinRefusal` decides; `viewer` is the viewer as
 * one of the draft's players, undefined if they aren't one. Outside
 * registration nobody may join, and no refusal is given.
 */
export function viewerJoin(
  state: TournamentState,
  viewer: JoiningPlayer | undefined,
): Pick<ViewerTournamentView, 'canJoin' | 'joinRefusal'> {
  const refusal =
    state === 'Registration' && viewer ? joinRefusal(viewer) : null;
  return {
    canJoin: state === 'Registration' && !!viewer && refusal === null,
    joinRefusal: refusal,
  };
}

/** What Start reads of each joined player to check their deck. */
export const STARTING_PLAYER = {
  user: { select: { name: true, isBot: true } },
  _count: { select: { plan: { where: { board: 'Mainboard' } } } },
  basics: { select: { count: true } },
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

/**
 * How many cards the player's mainboard holds, picks plus basic lands, as
 * Start counts it.
 */
export function mainboard(
  player: Pick<StartingPlayer, '_count' | 'basics'>,
): number {
  return (
    player._count.plan +
    player.basics.reduce((sum, basic) => sum + basic.count, 0)
  );
}
