import { MIN_MAINBOARD_CARDS } from 'contract';
import type { Transaction } from '../drafts/draft-shapes.js';
import { MAINBOARD_COUNT, mainboard } from './mainboard-rules.js';

/**
 * After a change to the player `playerId`'s deck, clears their ready if
 * they are ready in a tournament in registration and their mainboard now
 * holds fewer than the MIN_MAINBOARD_CARDS Start asks for, so ready never
 * claims a deck Start would refuse. Runs in the deck change's transaction,
 * which must hold the player's row; marking ready takes the draft's row
 * lock, so it can't land between this check and the change's commit.
 * Answers whether it cleared ready: the one place an automatic clear
 * happens.
 */
export async function clearReadyIfDeckTooSmall(
  tx: Transaction,
  playerId: string,
): Promise<boolean> {
  const player = await tx.player.findUnique({
    where: { id: playerId },
    select: {
      tournamentEntry: {
        select: {
          id: true,
          ready: true,
          tournament: { select: { state: true } },
        },
      },
      ...MAINBOARD_COUNT,
    },
  });
  const entry = player?.tournamentEntry;
  if (
    !player ||
    !entry?.ready ||
    entry.tournament.state !== 'Registration' ||
    mainboard(player) >= MIN_MAINBOARD_CARDS
  ) {
    return false;
  }
  await tx.tournamentEntry.update({
    where: { id: entry.id },
    data: { ready: false },
  });
  return true;
}
