import { Injectable } from '@nestjs/common';
import { readPickImport } from 'engine';
import { PrismaService } from '../prisma/prisma.service.js';
import { PickImportRefusedError } from './draft-errors.js';
import { checkInLobby, DraftLock } from './draft-lock.js';
import { draftSize, SEAT_ORDER, type Transaction } from './draft-shapes.js';
import {
  checkCanStart,
  seatPlayers,
  type StartableDraft,
} from './draft-start.js';

/** What a pick import's file would do to a draft. */
export interface PickImportPreview {
  /** Each column of the file with the player in the seat it maps to. */
  seats: { column: string; userId: string; player: string }[];
  picks: number;
  next: { pick: number; player: string };
}

/** Pick imports: loading picks made outside the app into a draft in the lobby. */
@Injectable()
export class PickImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: DraftLock,
  ) {}

  /**
   * What importing the picks in `csv` would do to the draft, which it leaves
   * as it is. Throws DraftStartedError once the draft has left Lobby,
   * StartRefusedError if it can't start yet, and PickImportRefusedError if
   * the file can't be imported.
   */
  async previewPickImport(
    draftId: string,
    csv: string,
  ): Promise<PickImportPreview> {
    const draft = await this.prisma.draft.findUnique({
      where: { id: draftId },
      select: {
        id: true,
        state: true,
        picksPerPlayer: true,
        snapshotState: true,
      },
    });
    // Unlocked, as a preview changes nothing: not even the draft's version.
    checkInLobby(draft);
    const { players, reading } = await this.checkPickImport(
      this.prisma,
      draft,
      csv,
    );
    return {
      seats: reading.columns.map((column, seat) => ({
        column,
        userId: players[seat].userId,
        player: players[seat].user.name,
      })),
      picks: reading.picks.length,
      next: {
        pick: reading.next.pick,
        player: players[reading.next.seat].user.name,
      },
    };
  }

  /**
   * Loads the picks in `csv` and moves the draft to Paused, with its seats
   * fixed and every queue emptied. Nothing is announced and no queued picks
   * are made: the organizer's resume does that. `previewedSeats` is the user
   * ids the preview paired with the file's columns; the file's validation
   * can't see a change to who sits where, so a difference refuses the file.
   * Throws as previewPickImport does, with nothing changed.
   */
  async importPicks(
    draftId: string,
    csv: string,
    previewedSeats: string[],
  ): Promise<void> {
    await this.lock.inLobby(draftId, async (draft) => {
      const { tx } = draft;
      const { players, reading, pool } = await this.checkPickImport(
        tx,
        draft,
        csv,
      );
      if (
        players.length !== previewedSeats.length ||
        players.some(({ userId }, seat) => userId !== previewedSeats[seat])
      ) {
        throw new PickImportRefusedError([
          'The seats have changed since the preview. Choose the file again to check it.',
        ]);
      }
      // Seats become 0..n-1 so the engine's seat indexes match them.
      await seatPlayers(
        draft,
        players.map((player) => player.userId),
      );
      const cardIds = new Map(pool.map((card) => [card.oracleId, card.id]));
      const createdAt = new Date();
      await tx.pick.createMany({
        data: reading.picks.map(({ number, seat, oracleId }) => ({
          draftId,
          number,
          playerId: players[seat].id,
          // Read from this same pool, so it is there.
          poolCardId: cardIds.get(oracleId)!,
          createdAt,
        })),
      });
      await tx.queuedCard.deleteMany({ where: { player: { draftId } } });
      await draft.moveTo('Paused');
    });
  }

  /**
   * The draft's players in seat order, its pool, and `csv` read for them. Throws
   * StartRefusedError if the draft can't start yet, and
   * PickImportRefusedError if the file can't be imported.
   */
  private async checkPickImport(
    client: Pick<Transaction, 'player' | 'poolCard'>,
    draft: StartableDraft,
    csv: string,
  ) {
    const draftId = draft.id;
    const players = await client.player.findMany({
      where: { draftId },
      orderBy: SEAT_ORDER,
      select: { id: true, userId: true, user: { select: { name: true } } },
    });
    await checkCanStart(client, draft, players.length);
    const pool = await client.poolCard.findMany({
      where: { draftId },
      select: { id: true, oracleId: true, name: true },
    });
    const reading = readPickImport(csv, draftSize(draft, players.length), pool);
    if (!reading.ok) throw new PickImportRefusedError(reading.problems);
    return { players, reading, pool };
  }
}
