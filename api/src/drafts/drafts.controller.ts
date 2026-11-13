import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  Put,
  UnprocessableEntityException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type {
  DraftCreationProblem,
  DraftListItemView,
  DraftPowersView,
  DraftView,
  NewDraftRequest,
  NewPoolSourceRequest,
  PickImportPreview,
  PickImportPreviewRequest,
  PickImportTooLarge,
  PickView,
  PoolCardView,
  RequestProblem,
  SeatOrderRequest,
  WebhookChoiceRequest,
} from 'contract';
import {
  DEFAULT_PICKS_PER_PLAYER,
  MAX_CUBE_LINK_LENGTH,
  MAX_DRAFT_NAME_LENGTH,
  MAX_PICKS_PER_PLAYER,
  MAX_POOL_QUERY_LENGTH,
  MAX_SET_LIST_SETS,
  MIN_PICKS_PER_PLAYER,
  type SetListEntryView,
} from 'contract';
import { doublePicksProblem } from 'engine';
import { bodyFields } from '../request-body.js';
import { parseCard } from './parse-card.js';
import { ScryfallUnavailableError } from '../scryfall/scryfall-client.js';
import { CubeCobraUnavailableError } from '../cubecobra/cubecobra-client.js';
import {
  CurrentUser,
  SessionGuard,
  type SessionUser,
} from '../auth/session.guard.js';
import { DraftLifecycleService } from './draft-lifecycle.service.js';
import { DraftLobbyService, type NewDraft } from './draft-lobby.service.js';
import { DraftAccess } from './draft-access.js';
import { DraftErrorsFilter } from './draft-errors.filter.js';
import { DraftReadsService } from './draft-reads.service.js';
import { PickImportService } from './pick-import.service.js';
import { TurnsService } from './turns.service.js';
import {
  CubeLinkError,
  GoneWebhookChosenError,
  PoolQueryError,
  UnknownWebhookError,
} from './draft-errors.js';
import type { DraftEvent } from './draft-events.js';
import { DraftPublisher } from './draft-publisher.js';
import { toDraftView, toPickView, toPoolCardView } from './draft-view.js';
import { DraftChanges } from './draft-changes.js';
import { isPlatform, PLATFORMS } from './platform.js';
import { PoolSnapshotService } from './pool-snapshot.service.js';
import { isPoolSourceKind } from './pool-source.js';
import { TournamentBadges } from '../tournaments/tournament-badge.js';
import { SetNotOfferedError } from '../sets/set-catalog.js';

/** Comfortably above a full sheet, which is a few KB; below the JSON body limit. */
const MAX_PICK_IMPORT_LENGTH = 64 * 1024;

@Controller('drafts')
@UseGuards(SessionGuard)
@UseFilters(DraftErrorsFilter)
export class DraftsController {
  private readonly logger = new Logger(DraftsController.name);

  constructor(
    private readonly access: DraftAccess,
    private readonly reads: DraftReadsService,
    private readonly lobby: DraftLobbyService,
    private readonly snapshots: PoolSnapshotService,
    private readonly pickImports: PickImportService,
    private readonly turns: TurnsService,
    private readonly lifecycle: DraftLifecycleService,
    private readonly publisher: DraftPublisher,
    private readonly changes: DraftChanges,
    private readonly badges: TournamentBadges,
  ) {}

  /** Every draft, newest first, each with its tournament badge as the viewer sees it. */
  @Get()
  async list(@CurrentUser() user: SessionUser): Promise<DraftListItemView[]> {
    const [drafts, badges] = await Promise.all([
      this.reads.list(),
      this.badges.read(user.id),
    ]);
    return drafts.map((draft) => ({
      ...toDraftView(draft),
      tournamentBadge: badges.get(draft.id) ?? null,
    }));
  }

  @Get(':id')
  async get(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.canSee(user, id);
    const draft = await this.reads.find(id);
    // Cancelled since the check.
    if (!draft) throw new NotFoundException();
    return toDraftView(draft);
  }

  /** What the signed-in viewer may do to the draft (ADR 0003). */
  @Get(':id/powers')
  async powers(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftPowersView> {
    return this.access.powers(user, id);
  }

  @Get(':id/pool')
  async pool(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<PoolCardView[]> {
    await this.access.canSee(user, id);
    return (await this.reads.pool(id)).map(toPoolCardView);
  }

  /** The draft's pick log, in pick order. */
  @Get(':id/picks')
  async picks(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<PickView[]> {
    await this.access.canSee(user, id);
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
    const poolCardId = parseCard(body, 'Say which card to pick.');
    await this.access.canSee(user, id);
    return this.change(id, () => this.turns.pick(id, user.id, poolCardId));
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
    await this.access.asOrganizer(user, id);
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
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.lifecycle.changeWebhook(id, webhookId));
  }

  /** Freezes the draft, so no picks can be made; for the organizer. */
  @Post(':id/freeze')
  @HttpCode(200)
  async freeze(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.lifecycle.freeze(id));
  }

  /** Unfreezes a frozen draft, making any queued picks due; for the organizer. */
  @Post(':id/unfreeze')
  @HttpCode(200)
  async unfreeze(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.lifecycle.unfreeze(id));
  }

  /** Closes a started draft early, so it is read-only; for the organizer. */
  @Post(':id/close')
  @HttpCode(200)
  async close(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.lifecycle.close(id));
  }

  /** Reopens a closed draft, making any queued picks due; for the organizer. */
  @Post(':id/reopen')
  @HttpCode(200)
  async reopen(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.lifecycle.reopen(id));
  }

  /** Cancels a draft still in Lobby, for good; for the organizer. */
  @Delete(':id')
  @HttpCode(204)
  async cancel(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.access.asOrganizer(user, id);
    await this.lobby.cancel(id);
    this.publisher.cancelled(id);
  }

  /** Starts the pool snapshot over; for the organizer, after a failure. */
  @Post(':id/snapshot')
  @HttpCode(202)
  async restartSnapshot(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.snapshots.start(id));
  }

  /** Seats the players in a random order; for the organizer. */
  @Post(':id/seats/randomize')
  @HttpCode(200)
  async randomizeSeats(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.lobby.randomizeSeats(id));
  }

  /** Sets the seat order, as every player's user id; for the organizer. */
  @Put(':id/seats')
  async reorderSeats(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DraftView> {
    const playerIds = parseSeatOrder(body);
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.lobby.reorderSeats(id, playerIds));
  }

  /** Starts the draft with its seats as they are; for the organizer. */
  @Post(':id/start')
  @HttpCode(200)
  async start(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.asOrganizer(user, id);
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
    await this.access.asOrganizer(user, id);
    return this.pickImports.previewPickImport(id, csv);
  }

  /**
   * Loads a file of picks and starts the draft frozen, for good; the file is
   * checked again, as the draft may have changed since its preview. `playerIds`
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
    const playerIds = parseSeatOrder(body);
    await this.access.asOrganizer(user, id);
    return this.change(id, () =>
      this.pickImports.importPicks(id, csv, playerIds),
    );
  }

  /** The signed-in guild member joins the draft. */
  @Post(':id/players')
  async join(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.canSee(user, id);
    return this.change(id, () => this.lobby.join(id, user.id));
  }

  /** The signed-in guild member leaves the draft. */
  @Delete(':id/players/me')
  async leave(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.canSee(user, id);
    return this.change(id, () => this.lobby.leave(id, user.id));
  }

  /** Adds a bot to the draft's players; for app admins. */
  @Post(':id/bots')
  async addBot(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.canAddBots(user, id);
    return this.change(id, () => this.lobby.addBot(id));
  }

  /** Removes a bot from the draft and deletes it; for app admins. */
  @Delete(':id/bots/:userId')
  async removeBot(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<DraftView> {
    await this.access.canAddBots(user, id);
    return this.change(id, () => this.lobby.removeBot(id, userId));
  }

  /**
   * Applies `change` to the draft and answers with the draft as it now is,
   * which is published as DraftPublisher says. If the change makes it a
   * bot's turn, the bot then picks. A change the draft's state no longer
   * allows is refused as DraftErrorsFilter says.
   */
  private async change(
    id: string,
    change: () => Promise<DraftEvent[] | void>,
  ): Promise<DraftView> {
    const draft = await this.changes.committed(id, (await change()) ?? []);
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
      if (
        err instanceof UnknownWebhookError ||
        err instanceof GoneWebhookChosenError
      ) {
        throw new BadRequestException({
          error: 'invalid',
          message: err.message,
        } satisfies DraftCreationProblem);
      }
      if (err instanceof PoolQueryError || err instanceof CubeLinkError) {
        throw new UnprocessableEntityException(err.problem);
      }
      if (err instanceof SetNotOfferedError) {
        throw new UnprocessableEntityException({
          error: 'set-not-offered',
          message: err.message,
        } satisfies DraftCreationProblem);
      }
      if (err instanceof CubeCobraUnavailableError) {
        this.logger.error(err.message);
        throw new BadGatewayException({
          error: 'cubecobra-unavailable',
          message: 'CubeCobra could not be reached. Try again in a moment.',
        } satisfies DraftCreationProblem);
      }
      if (err instanceof ScryfallUnavailableError) {
        this.logger.error(err.message);
        throw new BadGatewayException({
          error: 'scryfall-unavailable',
          message: 'Scryfall could not be reached. Try again in a moment.',
        } satisfies DraftCreationProblem);
      }
      throw err;
    }
  }
}

/** The create form's fields, or a 400 saying which one to fix. */
function parseNewDraft(body: unknown): NewDraft {
  const { name, poolSource, picksPerPlayer, doublePicks, platform, webhookId } =
    bodyFields<NewDraftRequest>(body);

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) throw invalid('Give the draft a name.');
  if (trimmedName.length > MAX_DRAFT_NAME_LENGTH) {
    throw invalid(`Keep the name to ${MAX_DRAFT_NAME_LENGTH} characters.`);
  }

  const parsedPoolSource = parsePoolSource(poolSource);

  // Only a missing field gets the default: null is a field left blank.
  const picks =
    picksPerPlayer === undefined ? DEFAULT_PICKS_PER_PLAYER : picksPerPlayer;
  if (
    typeof picks !== 'number' ||
    !Number.isInteger(picks) ||
    picks < MIN_PICKS_PER_PLAYER ||
    picks > MAX_PICKS_PER_PLAYER
  ) {
    throw invalid(
      `Picks per player must be a whole number from ${MIN_PICKS_PER_PLAYER} to ${MAX_PICKS_PER_PLAYER}.`,
    );
  }

  // Missing or 0: no double picks. Anything but a number, null for a field
  // left blank among them, breaks the rule.
  const givenDoublePicks = doublePicks === undefined ? 0 : doublePicks;
  const chosenDoublePicks =
    typeof givenDoublePicks === 'number' ? givenDoublePicks : NaN;
  if (chosenDoublePicks !== 0) {
    const problem = doublePicksProblem(chosenDoublePicks, picks);
    if (problem) throw invalid(problem);
  }

  // Only a missing field gets the default, as with picks per player.
  const chosenPlatform = platform === undefined ? 'Arena' : platform;
  if (!isPlatform(chosenPlatform)) {
    throw invalid(`Choose ${PLATFORMS.join(' or ')}.`);
  }

  // Missing or null: the draft posts nowhere.
  if (webhookId != null && (typeof webhookId !== 'string' || !webhookId)) {
    throw invalid('Choose a webhook from the list.');
  }

  return {
    name: trimmedName,
    poolSource: parsedPoolSource,
    picksPerPlayer: picks,
    doublePicks: chosenDoublePicks,
    platform: chosenPlatform,
    webhookId: webhookId ?? null,
  };
}

/** A 400 for the create form, saying what to fix. */
function invalid(message: string): BadRequestException {
  return new BadRequestException({
    error: 'invalid',
    message,
  } satisfies DraftCreationProblem);
}

/** The create form's pool source, trimmed, or a 400 saying what to fix. */
function parsePoolSource(poolSource: unknown): NewPoolSourceRequest {
  const missing = () => invalid('Enter a pool query or a cube link.');
  const noKind = () =>
    invalid('Enter a pool query or a cube link, or choose sets.');
  if (typeof poolSource !== 'object' || poolSource === null) throw noKind();
  const { kind } = bodyFields<NewPoolSourceRequest>(poolSource);
  if (!isPoolSourceKind(kind)) throw noKind();
  switch (kind) {
    case 'pool-query': {
      const { poolQuery } =
        bodyFields<Extract<NewPoolSourceRequest, { kind: typeof kind }>>(
          poolSource,
        );
      const trimmed = typeof poolQuery === 'string' ? poolQuery.trim() : '';
      if (!trimmed) throw missing();
      if (trimmed.length > MAX_POOL_QUERY_LENGTH) {
        throw invalid(
          `Keep the pool query to ${MAX_POOL_QUERY_LENGTH} characters.`,
        );
      }
      return { kind, poolQuery: trimmed };
    }
    case 'cube': {
      const { cubeLink } =
        bodyFields<Extract<NewPoolSourceRequest, { kind: typeof kind }>>(
          poolSource,
        );
      const trimmed = typeof cubeLink === 'string' ? cubeLink.trim() : '';
      if (!trimmed) throw missing();
      if (trimmed.length > MAX_CUBE_LINK_LENGTH) {
        throw invalid(
          `Keep the cube link to ${MAX_CUBE_LINK_LENGTH} characters.`,
        );
      }
      return { kind, cubeLink: trimmed };
    }
    case 'set-list': {
      const { setList } =
        bodyFields<Extract<NewPoolSourceRequest, { kind: typeof kind }>>(
          poolSource,
        );
      return { kind, setList: parseSetList(setList) };
    }
    default: {
      const unhandled: never = kind;
      throw new Error(`Unknown pool source kind ${String(unhandled)}.`);
    }
  }
}

/**
 * A set list's sets, each with its sublists, by lowercase code; or a 400
 * saying what to fix. Whether each is offered is the set catalog's check.
 */
function parseSetList(setList: unknown): SetListEntryView[] {
  const isCodes = (codes: unknown): codes is string[] =>
    Array.isArray(codes) && codes.every((code) => typeof code === 'string');
  if (
    !Array.isArray(setList) ||
    setList.length === 0 ||
    !setList.every(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as SetListEntryView).code === 'string' &&
        isCodes((entry as SetListEntryView).sublists),
    )
  ) {
    throw invalid('Choose at least one set.');
  }
  if (setList.length > MAX_SET_LIST_SETS) {
    throw invalid(`Choose at most ${MAX_SET_LIST_SETS} sets.`);
  }
  const normalize = (code: string) => code.trim().toLowerCase();
  const parsed = (setList as SetListEntryView[]).map((entry) => ({
    code: normalize(entry.code),
    sublists: entry.sublists.map(normalize),
  }));
  if (new Set(parsed.map((entry) => entry.code)).size !== parsed.length) {
    throw invalid('Choose each set once.');
  }
  return parsed;
}

/** The webhook chosen for a draft, null for none, or a 400 if the body doesn't say. */
function parseWebhookChoice(body: unknown): string | null {
  const { webhookId } = bodyFields<WebhookChoiceRequest>(body);
  if (webhookId === null) return null;
  if (typeof webhookId !== 'string' || !webhookId) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Choose a webhook from the list.',
    } satisfies RequestProblem);
  }
  return webhookId;
}

/** The seat order's player ids, or a 400 if it isn't a list of distinct ids. */
function parseSeatOrder(body: unknown): string[] {
  const { playerIds } = bodyFields<SeatOrderRequest>(body);
  if (
    !Array.isArray(playerIds) ||
    !playerIds.every((id) => typeof id === 'string') ||
    new Set(playerIds).size !== playerIds.length
  ) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'List each player once, in seat order.',
    } satisfies RequestProblem);
  }
  return playerIds;
}

/** A pick import's file text, or a 400 if there is none and a 413 if it's too long. */
function parsePickImport(body: unknown): string {
  const { csv } = bodyFields<PickImportPreviewRequest>(body);
  if (typeof csv !== 'string') {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Choose a file to import.',
    } satisfies RequestProblem);
  }
  if (csv.length > MAX_PICK_IMPORT_LENGTH) {
    throw new PayloadTooLargeException({
      error: 'file-too-large',
      message: 'That file is too large to be a sheet of picks.',
    } satisfies PickImportTooLarge);
  }
  return csv;
}

/** A pick's number from its URL, or a 400 if it isn't one. */
function parsePickNumber(param: string): number {
  if (!/^[1-9]\d*$/.test(param)) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Say which pick to undo, by its number.',
    } satisfies RequestProblem);
  }
  return Number(param);
}
