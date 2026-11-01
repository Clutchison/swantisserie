import {
  BadGatewayException,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  Put,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { PoolCard } from '../generated/prisma/client.js';
import {
  type Rarity,
  ScryfallUnavailableError,
} from '../scryfall/scryfall-client.js';
import {
  CurrentUser,
  SessionGuard,
  type SessionUser,
} from '../auth/session.guard.js';
import { DraftLifecycleService } from './draft-lifecycle.service.js';
import { DraftLobbyService, type NewDraft } from './draft-lobby.service.js';
import {
  DraftReadsService,
  type DraftWithOrganizer,
} from './draft-reads.service.js';
import {
  type PickImportPreview,
  PickImportService,
} from './pick-import.service.js';
import { type LoggedPick, TurnsService } from './turns.service.js';
import {
  CloseRefusedError,
  DraftFullError,
  DraftGoneError,
  DraftStartedError,
  PauseRefusedError,
  PickImportRefusedError,
  PickRefusedError,
  PlayersChangedError,
  PoolQueryError,
  StartRefusedError,
  UndoRefusedError,
  UnknownBotError,
  UnknownWebhookError,
} from './draft-errors.js';
import type { DraftEvent } from './draft-events.js';
import { DraftPublisher } from './draft-publisher.js';
import { type DraftView, toDraftView } from './draft-view.js';
import { BotPlayers } from './bot-players.js';
import {
  type CardFace,
  type CardImages,
  PoolFrozenError,
  PoolSnapshotService,
} from './pool-snapshot.service.js';

const DEFAULT_PICKS_PER_PLAYER = 40;
const MAX_PICKS_PER_PLAYER = 100;
const MAX_NAME_LENGTH = 100;
/** Scryfall takes up to 1000 characters, and we wrap the query in more terms. */
const MAX_POOL_QUERY_LENGTH = 900;
/** Comfortably above a full sheet, which is a few KB; below the JSON body limit. */
const MAX_PICK_IMPORT_LENGTH = 64 * 1024;

/** One pick in a draft's pick log. */
export interface PickView {
  /** 1-based, counting every pick in the draft. */
  pick: number;
  playerId: string;
  oracleId: string;
  name: string;
  /** How the faces are laid out. Null only until a pool snapshotted before layout was stored is backfilled. */
  layout: string | null;
  set: string;
  collectorNumber: string;
}

export interface PoolCardView {
  scryfallId: string;
  oracleId: string;
  name: string;
  set: string;
  collectorNumber: string;
  typeLine: string;
  colors: string[];
  manaValue: number;
  /** Null when the faces carry it, as on double-faced cards. */
  manaCost: string | null;
  /** Null when the faces carry it. */
  oracleText: string | null;
  colorIdentity: string[];
  keywords: string[];
  /** Null only until a pool snapshotted before rarity was stored is backfilled. */
  rarity: Rarity | null;
  /** How the faces are laid out, e.g. normal, split, transform, adventure. Null only until a pool snapshotted before layout was stored is backfilled. */
  layout: string | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  defense: string | null;
  /** Empty for single-faced cards. Null only until a pool snapshotted before faces were stored is backfilled. */
  faces: CardFace[] | null;
  /** One entry per face with its own image. */
  images: CardImages[];
}

@Controller('drafts')
@UseGuards(SessionGuard)
export class DraftsController {
  private readonly logger = new Logger(DraftsController.name);

  constructor(
    private readonly reads: DraftReadsService,
    private readonly lobby: DraftLobbyService,
    private readonly snapshots: PoolSnapshotService,
    private readonly pickImports: PickImportService,
    private readonly turns: TurnsService,
    private readonly lifecycle: DraftLifecycleService,
    private readonly publisher: DraftPublisher,
    private readonly bots: BotPlayers,
  ) {}

  @Get()
  async list(): Promise<DraftView[]> {
    return (await this.reads.list()).map(toDraftView);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<DraftView> {
    return toDraftView(await this.findOr404(id));
  }

  @Get(':id/pool')
  async pool(@Param('id') id: string): Promise<PoolCardView[]> {
    await this.findOr404(id);
    return (await this.reads.pool(id)).map(toPoolCardView);
  }

  /** The draft's pick log, in pick order. */
  @Get(':id/picks')
  async picks(@Param('id') id: string): Promise<PickView[]> {
    await this.findOr404(id);
    return (await this.turns.picks(id)).map(toPickView);
  }

  /** The signed-in player picks a pool card on their turn. */
  @Post(':id/picks')
  @HttpCode(200)
  async pick(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DraftView> {
    const oracleId = parsePick(body);
    await this.findOr404(id);
    return this.change(id, () => this.turns.pick(id, user.id, oracleId));
  }

  /**
   * Undoes the draft's latest pick, which must be pick `number`, so an undo
   * sent twice takes back only one; for the organizer.
   */
  @Delete(':id/picks/:number')
  async undo(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('number') number: string,
  ): Promise<DraftView> {
    const pickNumber = parsePickNumber(number);
    await this.findAsOrganizer(user, id);
    return this.change(id, () => this.turns.undo(id, pickNumber));
  }

  /**
   * Chooses where the draft's later announcements are posted, or none, at any
   * time; announces nothing itself. For the organizer.
   */
  @Put(':id/webhook')
  async changeWebhook(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DraftView> {
    const webhookId = parseWebhookChoice(body);
    await this.findAsOrganizer(user, id);
    return this.change(id, () => this.lifecycle.changeWebhook(id, webhookId));
  }

  /** Pauses the draft, so no picks can be made; for the organizer. */
  @Post(':id/pause')
  @HttpCode(200)
  async pause(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.findAsOrganizer(user, id);
    return this.change(id, () => this.lifecycle.pause(id));
  }

  /** Resumes a paused draft, making any queued picks due; for the organizer. */
  @Post(':id/resume')
  @HttpCode(200)
  async resume(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.findAsOrganizer(user, id);
    return this.change(id, () => this.lifecycle.resume(id));
  }

  /** Closes a started draft early, so it is read-only; for the organizer. */
  @Post(':id/close')
  @HttpCode(200)
  async close(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.findAsOrganizer(user, id);
    return this.change(id, () => this.lifecycle.close(id));
  }

  /** Reopens a closed draft, making any queued picks due; for the organizer. */
  @Post(':id/reopen')
  @HttpCode(200)
  async reopen(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.findAsOrganizer(user, id);
    return this.change(id, () => this.lifecycle.reopen(id));
  }

  /** Cancels a draft still in Lobby, for good; for the organizer. */
  @Delete(':id')
  @HttpCode(204)
  async cancel(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.findAsOrganizer(user, id);
    try {
      await this.lobby.cancel(id);
    } catch (err) {
      if (err instanceof DraftGoneError) throw new NotFoundException();
      if (err instanceof DraftStartedError) {
        throw conflict('draft-started', err);
      }
      throw err;
    }
    this.publisher.cancelled(id);
  }

  /** Starts the pool snapshot over; for the organizer, after a failure. */
  @Post(':id/snapshot')
  @HttpCode(202)
  async restartSnapshot(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.findAsOrganizer(user, id);
    return this.change(id, () => this.snapshots.start(id));
  }

  /** Seats the players in a random order; for the organizer. */
  @Post(':id/seats/randomize')
  @HttpCode(200)
  async randomizeSeats(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.findAsOrganizer(user, id);
    return this.change(id, () => this.lobby.randomizeSeats(id));
  }

  /** Sets the seat order, as every player's user id; for the organizer. */
  @Put(':id/seats')
  async reorderSeats(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DraftView> {
    const userIds = parseSeatOrder(body);
    await this.findAsOrganizer(user, id);
    return this.change(id, () => this.lobby.reorderSeats(id, userIds));
  }

  /** Starts the draft with its seats as they are; for the organizer. */
  @Post(':id/start')
  @HttpCode(200)
  async start(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.findAsOrganizer(user, id);
    return this.change(id, () => this.lobby.start(id));
  }

  /**
   * What importing a file of picks would do to the draft, or all that's
   * wrong with the file; changes nothing. For the organizer.
   */
  @Post(':id/pick-import/preview')
  @HttpCode(200)
  async previewPickImport(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<PickImportPreview> {
    const csv = parsePickImport(body);
    await this.findAsOrganizer(user, id);
    try {
      return await this.pickImports.previewPickImport(id, csv);
    } catch (err) {
      if (err instanceof DraftGoneError) throw new NotFoundException();
      if (err instanceof DraftStartedError) {
        throw conflict('draft-started', err);
      }
      if (err instanceof StartRefusedError) {
        throw new ConflictException(err.refusal);
      }
      if (err instanceof PickImportRefusedError) throw pickImportRefused(err);
      throw err;
    }
  }

  /**
   * Loads a file of picks and starts the draft paused, for good; the file is
   * checked again, as the draft may have changed since its preview. `userIds`
   * is the seat order the preview showed. For the organizer.
   */
  @Post(':id/pick-import')
  @HttpCode(200)
  async importPicks(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DraftView> {
    const csv = parsePickImport(body);
    const userIds = parseSeatOrder(body);
    await this.findAsOrganizer(user, id);
    return this.change(id, () =>
      this.pickImports.importPicks(id, csv, userIds),
    );
  }

  /** The signed-in role-holder joins the draft. */
  @Post(':id/players')
  async join(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.findOr404(id);
    return this.change(id, () => this.lobby.join(id, user.id));
  }

  /** The signed-in role-holder leaves the draft. */
  @Delete(':id/players/me')
  async leave(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.findOr404(id);
    return this.change(id, () => this.lobby.leave(id, user.id));
  }

  /** Adds a bot to the draft's players; for app admins. */
  @Post(':id/bots')
  async addBot(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.findAsAppAdmin(user, id);
    return this.change(id, () => this.lobby.addBot(id));
  }

  /** Removes a bot from the draft and deletes it; for app admins. */
  @Delete(':id/bots/:userId')
  async removeBot(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<DraftView> {
    await this.findAsAppAdmin(user, id);
    return this.change(id, () => this.lobby.removeBot(id, userId));
  }

  /**
   * Applies `change` to the draft and answers with the draft as it now is,
   * which is published as DraftPublisher says. If the change makes it a
   * bot's turn, the bot then picks. A change the draft's state no longer
   * allows is a 409 naming why.
   */
  private async change(
    id: string,
    change: () => Promise<DraftEvent[] | void>,
  ): Promise<DraftView> {
    let events: DraftEvent[] | void;
    try {
      events = await change();
    } catch (err) {
      if (err instanceof DraftGoneError) throw new NotFoundException();
      if (err instanceof PoolFrozenError) throw conflict('pool-frozen', err);
      if (err instanceof StartRefusedError) {
        throw new ConflictException(err.refusal);
      }
      if (err instanceof PickRefusedError) {
        if (err.refusal.error === 'not-in-pool') {
          throw new NotFoundException(err.refusal);
        }
        throw new ConflictException(err.refusal);
      }
      if (
        err instanceof UndoRefusedError ||
        err instanceof PauseRefusedError ||
        err instanceof CloseRefusedError
      ) {
        throw new ConflictException(err.refusal);
      }
      if (err instanceof PickImportRefusedError) throw pickImportRefused(err);
      if (err instanceof PlayersChangedError) {
        throw conflict('players-changed', err);
      }
      if (err instanceof DraftStartedError) {
        throw conflict('draft-started', err);
      }
      if (err instanceof DraftFullError) throw conflict('draft-full', err);
      if (err instanceof UnknownWebhookError) {
        throw conflict('webhook-removed', err);
      }
      if (err instanceof UnknownBotError) {
        throw new NotFoundException({
          error: 'no-such-bot',
          message: err.message,
        });
      }
      throw err;
    }
    const draft = await this.publisher.publish(id, events ?? []);
    if (!draft) throw new NotFoundException();
    if (events) this.bots.scheduleNextPick(id, events);
    return draft;
  }

  /** The draft, if `user` is its organizer or an app admin. */
  private async findAsOrganizer(
    user: SessionUser,
    id: string,
  ): Promise<DraftWithOrganizer> {
    const draft = await this.findOr404(id);
    if (draft.organizerId !== user.id && !user.isAdmin) {
      throw new ForbiddenException();
    }
    return draft;
  }

  /** The draft, if `user` is an app admin. */
  private async findAsAppAdmin(
    user: SessionUser,
    id: string,
  ): Promise<DraftWithOrganizer> {
    const draft = await this.findOr404(id);
    if (!user.isAdmin) throw new ForbiddenException();
    return draft;
  }

  private async findOr404(id: string): Promise<DraftWithOrganizer> {
    const draft = await this.reads.find(id);
    if (!draft) throw new NotFoundException();
    return draft;
  }

  @Post()
  async create(
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
  ): Promise<DraftView> {
    const draft = parseNewDraft(body);
    try {
      return toDraftView(await this.lobby.create(user.id, draft));
    } catch (err) {
      if (err instanceof UnknownWebhookError) {
        throw new BadRequestException({
          error: 'invalid',
          message: err.message,
        });
      }
      if (err instanceof PoolQueryError) {
        throw new UnprocessableEntityException(err.problem);
      }
      if (err instanceof ScryfallUnavailableError) {
        this.logger.error(err.message);
        throw new BadGatewayException({
          error: 'scryfall-unavailable',
          message: 'Scryfall could not be reached. Try again in a moment.',
        });
      }
      throw err;
    }
  }
}

function conflict(error: string, cause: Error): ConflictException {
  return new ConflictException({ error, message: cause.message });
}

function pickImportRefused(
  cause: PickImportRefusedError,
): UnprocessableEntityException {
  return new UnprocessableEntityException({
    error: 'invalid-pick-import',
    message: cause.message,
    problems: cause.problems,
  });
}

/** The create form's fields, or a 400 saying which one to fix. */
function parseNewDraft(body: unknown): NewDraft {
  const { name, poolQuery, picksPerPlayer, webhookId } = (body ?? {}) as Record<
    string,
    unknown
  >;
  const invalid = (message: string) =>
    new BadRequestException({ error: 'invalid', message });

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) throw invalid('Give the draft a name.');
  if (trimmedName.length > MAX_NAME_LENGTH) {
    throw invalid(`Keep the name to ${MAX_NAME_LENGTH} characters.`);
  }

  const trimmedQuery = typeof poolQuery === 'string' ? poolQuery.trim() : '';
  if (!trimmedQuery) throw invalid('Enter a pool query.');
  if (trimmedQuery.length > MAX_POOL_QUERY_LENGTH) {
    throw invalid(
      `Keep the pool query to ${MAX_POOL_QUERY_LENGTH} characters.`,
    );
  }

  // Only a missing field gets the default: null is a field left blank.
  const picks =
    picksPerPlayer === undefined ? DEFAULT_PICKS_PER_PLAYER : picksPerPlayer;
  if (
    typeof picks !== 'number' ||
    !Number.isInteger(picks) ||
    picks < 1 ||
    picks > MAX_PICKS_PER_PLAYER
  ) {
    throw invalid(
      `Picks per player must be a whole number from 1 to ${MAX_PICKS_PER_PLAYER}.`,
    );
  }

  // Missing or null: the draft posts nowhere.
  if (webhookId != null && (typeof webhookId !== 'string' || !webhookId)) {
    throw invalid('Choose a webhook from the list.');
  }

  return {
    name: trimmedName,
    poolQuery: trimmedQuery,
    picksPerPlayer: picks,
    webhookId: webhookId ?? null,
  };
}

/** The webhook chosen for a draft, null for none, or a 400 if the body doesn't say. */
function parseWebhookChoice(body: unknown): string | null {
  const { webhookId } = (body ?? {}) as Record<string, unknown>;
  if (webhookId === null) return null;
  if (typeof webhookId !== 'string' || !webhookId) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Choose a webhook from the list.',
    });
  }
  return webhookId;
}

/** The seat order's user ids, or a 400 if it isn't a list of distinct ids. */
function parseSeatOrder(body: unknown): string[] {
  const { userIds } = (body ?? {}) as Record<string, unknown>;
  if (
    !Array.isArray(userIds) ||
    !userIds.every((id) => typeof id === 'string') ||
    new Set(userIds).size !== userIds.length
  ) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'List each player once, in seat order.',
    });
  }
  return userIds;
}

/** A pick import's file text, or a 400 if there is none and a 413 if it's too long. */
function parsePickImport(body: unknown): string {
  const { csv } = (body ?? {}) as Record<string, unknown>;
  if (typeof csv !== 'string') {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Choose a file to import.',
    });
  }
  if (csv.length > MAX_PICK_IMPORT_LENGTH) {
    throw new PayloadTooLargeException({
      error: 'file-too-large',
      message: 'That file is too large to be a sheet of picks.',
    });
  }
  return csv;
}

/** The picked card's oracle id, or a 400 if there isn't one. */
function parsePick(body: unknown): string {
  const { oracleId } = (body ?? {}) as Record<string, unknown>;
  if (typeof oracleId !== 'string' || !oracleId) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Say which card to pick.',
    });
  }
  return oracleId;
}

/** A pick's number from its URL, or a 400 if it isn't one. */
function parsePickNumber(param: string): number {
  if (!/^[1-9]\d*$/.test(param)) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Say which pick to undo, by its number.',
    });
  }
  return Number(param);
}

function toPickView(pick: LoggedPick): PickView {
  return {
    pick: pick.number,
    playerId: pick.player.userId,
    oracleId: pick.poolCard.oracleId,
    name: pick.poolCard.name,
    layout: pick.poolCard.layout,
    set: pick.poolCard.set,
    collectorNumber: pick.poolCard.collectorNumber,
  };
}

function toPoolCardView(card: PoolCard): PoolCardView {
  return {
    scryfallId: card.scryfallId,
    oracleId: card.oracleId,
    name: card.name,
    set: card.set,
    collectorNumber: card.collectorNumber,
    typeLine: card.typeLine,
    colors: card.colors,
    manaValue: card.manaValue,
    manaCost: card.manaCost,
    oracleText: card.oracleText,
    colorIdentity: card.colorIdentity,
    keywords: card.keywords,
    rarity: card.rarity as Rarity | null,
    layout: card.layout,
    power: card.power,
    toughness: card.toughness,
    loyalty: card.loyalty,
    defense: card.defense,
    faces: card.faces as unknown as CardFace[] | null,
    images: card.images as unknown as CardImages[],
  };
}
