import {
  MIN_MAINBOARD_CARDS,
  type TournamentRefusal,
  type TournamentState,
  type ViewerTournamentView,
} from 'contract';
import type { Prisma } from '../generated/prisma/client.js';
import { MAINBOARD_COUNT, mainboard } from './mainboard-rules.js';

/**
 * What marking ready reads of one of the draft's players: whether they are
 * a bot, their tournament entry, and their mainboard as Start counts it.
 */
export const READYING_PLAYER = {
  user: { select: { isBot: true } },
  tournamentEntry: { select: { id: true, ready: true } },
  ...MAINBOARD_COUNT,
} satisfies Prisma.PlayerSelect;

export type ReadyingPlayer = Prisma.PlayerGetPayload<{
  select: typeof READYING_PLAYER;
}>;

/**
 * Why the joined player `player` can't mark themselves ready during
 * registration, or null if they can: they are a bot, which is never ready,
 * or their mainboard holds fewer than the MIN_MAINBOARD_CARDS Start asks
 * for, so ready never claims a deck Start would refuse. Marking ready asks
 * this, and so does the tournament read, through `viewerReady`.
 */
export function readyRefusal(player: ReadyingPlayer): TournamentRefusal | null {
  if (player.user.isBot) {
    return { error: 'bots-never-ready', message: 'Bots are never ready.' };
  }
  const cards = mainboard(player);
  if (cards < MIN_MAINBOARD_CARDS) {
    return {
      error: 'deck-too-small-for-ready',
      message: `Your mainboard holds ${cards} ${cards === 1 ? 'card' : 'cards'}. Fill your deck to at least ${MIN_MAINBOARD_CARDS} before marking yourself ready.`,
    };
  }
  return null;
}

/**
 * Whether the viewer may mark or unmark themselves ready in a tournament in
 * `state` now; `viewer` is the viewer as one of the draft's players,
 * undefined if they aren't one. Only during registration, and only a
 * joined player: one who is ready may always unmark it, and one who isn't
 * may mark it where `readyRefusal` allows.
 */
export function viewerReady(
  state: TournamentState,
  viewer: ReadyingPlayer | undefined,
): Pick<ViewerTournamentView, 'canToggleReady'> {
  const entry = viewer?.tournamentEntry;
  return {
    canToggleReady:
      state === 'Registration' &&
      !!entry &&
      (entry.ready || readyRefusal(viewer) === null),
  };
}
