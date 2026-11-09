import {
  MIN_MAINBOARD_CARDS,
  type TournamentRefusal,
  type TournamentState,
  type ViewerTournamentView,
} from 'contract';
import type { Transaction } from '../drafts/draft-shapes.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  MAINBOARD_COUNT,
  type MainboardCounted,
  mainboard,
} from './mainboard-rules.js';

/**
 * What ready reads of a player's tournament entry: which entry it is, and
 * whether they are ready. Spread into an entry select.
 */
const READY_ENTRY = {
  id: true,
  ready: true,
} satisfies Prisma.TournamentEntrySelect;

/**
 * What marking ready reads of one of the draft's players: whether they are
 * a bot, their tournament entry, and their mainboard as Start counts it.
 */
export const READYING_PLAYER = {
  user: { select: { isBot: true } },
  tournamentEntry: { select: READY_ENTRY },
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
  if (deckTooSmallForReady(player)) {
    const cards = mainboard(player);
    return {
      error: 'deck-too-small-for-ready',
      message: `Your mainboard holds ${cards} ${cards === 1 ? 'card' : 'cards'}. Fill your deck to at least ${MIN_MAINBOARD_CARDS} before marking yourself ready.`,
    };
  }
  return null;
}

/**
 * Whether the player's mainboard holds fewer than the MIN_MAINBOARD_CARDS
 * Start asks for, so they may not be ready: marking ready is refused, and
 * a deck change that leaves them so clears their ready.
 */
export function deckTooSmallForReady(player: MainboardCounted): boolean {
  return mainboard(player) < MIN_MAINBOARD_CARDS;
}

/**
 * After a change to the player `playerId`'s deck, clears their ready if
 * they are ready in a tournament in registration and `deckTooSmallForReady`
 * now holds, so ready never claims a deck Start would refuse. Runs in the
 * deck change's transaction, which must hold the player's row; marking
 * ready takes the draft's row lock, so it can't land between this check
 * and the change's commit. Answers whether it cleared ready: the one place
 * an automatic clear happens, and so the one place the Ready notice is set.
 */
export async function clearReadyIfDeckTooSmall(
  tx: Transaction,
  playerId: string,
): Promise<boolean> {
  const player = await tx.player.findUnique({
    where: { id: playerId },
    select: {
      tournamentEntry: {
        select: { ...READY_ENTRY, tournament: { select: { state: true } } },
      },
      ...MAINBOARD_COUNT,
    },
  });
  const entry = player?.tournamentEntry;
  if (
    !player ||
    !entry?.ready ||
    entry.tournament.state !== 'Registration' ||
    !deckTooSmallForReady(player)
  ) {
    return false;
  }
  await tx.tournamentEntry.update({
    where: { id: entry.id },
    data: { ready: false, readyNotice: true },
  });
  return true;
}

/**
 * Marks the tournament entry `entryId` ready, or unmarks it, as `ready`
 * says. Marking ready takes down its Ready notice; unmarking never sets it.
 */
export async function setEntryReady(
  tx: Transaction,
  entryId: string,
  ready: boolean,
): Promise<void> {
  await tx.tournamentEntry.update({
    where: { id: entryId },
    data: ready ? { ready, readyNotice: false } : { ready },
  });
}

/** Whether the player `playerId`'s Ready notice shows: false if they have no tournament entry. */
export async function readyNoticeShows(
  tx: Transaction,
  playerId: string,
): Promise<boolean> {
  const entry = await tx.tournamentEntry.findUnique({
    where: { playerId },
    select: { readyNotice: true },
  });
  return entry?.readyNotice ?? false;
}

/** Takes down the player `playerId`'s Ready notice, if they have a tournament entry and it shows. */
export async function dismissReadyNotice(
  tx: Transaction,
  playerId: string,
): Promise<void> {
  await tx.tournamentEntry.updateMany({
    where: { playerId },
    data: { readyNotice: false },
  });
}

/** Takes down every Ready notice in the tournament `tournamentId`, as its registration ends. */
export async function dismissReadyNotices(
  tx: Transaction,
  tournamentId: string,
): Promise<void> {
  await tx.tournamentEntry.updateMany({
    where: { tournamentId, readyNotice: true },
    data: { readyNotice: false },
  });
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
