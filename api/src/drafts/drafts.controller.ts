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
  Post,
  Put,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { currentTurn } from 'engine';
import type {
  DraftState,
  PoolCard,
  PoolSnapshotState,
} from '../generated/prisma/client.js';
import { avatarUrl } from '../auth/avatar-url.js';
import {
  CurrentUser,
  SessionGuard,
  type SessionUser,
} from '../auth/session.guard.js';
import {
  DraftStartedError,
  DraftsService,
  type DraftWithOrganizer,
  type LoggedPick,
  type NewDraft,
  PickRefusedError,
  PlayersChangedError,
  PoolQueryError,
  ScryfallUnavailableError,
  StartRefusedError,
} from './drafts.service.js';
import { DraftsGateway } from './drafts.gateway.js';
import { type CardImages, PoolFrozenError } from './pool-snapshot.service.js';

const DEFAULT_PICKS_PER_PLAYER = 40;
const MAX_PICKS_PER_PLAYER = 100;
const MAX_NAME_LENGTH = 100;
/** Scryfall takes up to 1000 characters, and we wrap the query in more terms. */
const MAX_POOL_QUERY_LENGTH = 900;

/** How far the pool snapshot has got. */
export interface PoolSnapshotView {
  state: PoolSnapshotState;
  /** Cards snapshotted so far: the pool size once Complete. */
  cards: number;
  /** Cards Scryfall says the pool query matches; null until the first page arrives. */
  total: number | null;
  /** Why the snapshot failed, when it has. */
  error?: string;
}

export interface PlayerView {
  id: string;
  name: string;
  avatarUrl: string;
}

/** Whose turn it is. */
export interface TurnView {
  /** 1-based, counting every pick in the draft. */
  pick: number;
  round: number;
  playerId: string;
}

export interface DraftView {
  id: string;
  name: string;
  poolQuery: string;
  picksPerPlayer: number;
  state: DraftState;
  organizer: { id: string; name: string };
  snapshot: PoolSnapshotView;
  /** In seat order. */
  players: PlayerView[];
  /** Null unless the draft is Drafting or Paused. */
  turn: TurnView | null;
  /** Higher for a newer copy of the draft; snapshot progress leaves it be. */
  version: number;
  createdAt: Date;
}

/** One pick in a draft's pick log. */
export interface PickView {
  /** 1-based, counting every pick in the draft. */
  pick: number;
  playerId: string;
  oracleId: string;
  name: string;
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
  /** One entry per face with its own image. */
  images: CardImages[];
}

@Controller('drafts')
@UseGuards(SessionGuard)
export class DraftsController {
  private readonly logger = new Logger(DraftsController.name);

  constructor(
    private readonly drafts: DraftsService,
    private readonly gateway: DraftsGateway,
  ) {}

  @Get()
  async list(): Promise<DraftView[]> {
    return (await this.drafts.list()).map(toDraftView);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<DraftView> {
    return toDraftView(await this.findOr404(id));
  }

  @Get(':id/pool')
  async pool(@Param('id') id: string): Promise<PoolCardView[]> {
    await this.findOr404(id);
    return (await this.drafts.pool(id)).map(toPoolCardView);
  }

  /** The draft's pick log, in pick order. */
  @Get(':id/picks')
  async picks(@Param('id') id: string): Promise<PickView[]> {
    await this.findOr404(id);
    return (await this.drafts.picks(id)).map(toPickView);
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
    return this.change(id, () => this.drafts.pick(id, user.id, oracleId));
  }

  /** Starts the pool snapshot over; for the organizer, after a failure. */
  @Post(':id/snapshot')
  @HttpCode(202)
  async restartSnapshot(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.findAsOrganizer(user, id);
    return this.change(id, () => this.drafts.restartSnapshot(id));
  }

  /** Seats the players in a random order; for the organizer. */
  @Post(':id/seats/randomize')
  @HttpCode(200)
  async randomizeSeats(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.findAsOrganizer(user, id);
    return this.change(id, () => this.drafts.randomizeSeats(id));
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
    return this.change(id, () => this.drafts.reorderSeats(id, userIds));
  }

  /** Starts the draft with its seats as they are; for the organizer. */
  @Post(':id/start')
  @HttpCode(200)
  async start(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.findAsOrganizer(user, id);
    return this.change(id, () => this.drafts.start(id));
  }

  /** The signed-in role-holder joins the draft. */
  @Post(':id/players')
  async join(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.findOr404(id);
    return this.change(id, () => this.drafts.join(id, user.id));
  }

  /** The signed-in role-holder leaves the draft. */
  @Delete(':id/players/me')
  async leave(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.findOr404(id);
    return this.change(id, () => this.drafts.leave(id, user.id));
  }

  /**
   * Applies `change` to the draft and answers with the draft as it now is,
   * which everyone viewing it is sent too. A change the draft's state no
   * longer allows is a 409 naming why.
   */
  private async change(
    id: string,
    change: () => Promise<void>,
  ): Promise<DraftView> {
    try {
      await change();
    } catch (err) {
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
      if (err instanceof PlayersChangedError) {
        throw conflict('players-changed', err);
      }
      if (err instanceof DraftStartedError) {
        throw conflict('draft-started', err);
      }
      throw err;
    }
    const draft = toDraftView(await this.findOr404(id));
    this.gateway.changed(draft);
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

  private async findOr404(id: string): Promise<DraftWithOrganizer> {
    const draft = await this.drafts.find(id);
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
      return toDraftView(await this.drafts.create(user.id, draft));
    } catch (err) {
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

/** The create form's fields, or a 400 saying which one to fix. */
function parseNewDraft(body: unknown): NewDraft {
  const { name, poolQuery, picksPerPlayer } = (body ?? {}) as Record<
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

  return { name: trimmedName, poolQuery: trimmedQuery, picksPerPlayer: picks };
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

function toDraftView(draft: DraftWithOrganizer): DraftView {
  return {
    id: draft.id,
    name: draft.name,
    poolQuery: draft.poolQuery,
    picksPerPlayer: draft.picksPerPlayer,
    state: draft.state,
    organizer: draft.organizer,
    snapshot: {
      state: draft.snapshotState,
      cards: draft._count.pool,
      total: draft.poolTotal,
      ...(draft.snapshotError === null ? {} : { error: draft.snapshotError }),
    },
    players: draft.players.map(({ user }) => ({
      id: user.id,
      name: user.name,
      avatarUrl: avatarUrl(user),
    })),
    turn: toTurnView(draft),
    version: draft.version,
    createdAt: draft.createdAt,
  };
}

function toTurnView(draft: DraftWithOrganizer): TurnView | null {
  if (draft.state !== 'Drafting' && draft.state !== 'Paused') return null;
  const turn = currentTurn(
    { players: draft.players.length, picksPerPlayer: draft.picksPerPlayer },
    draft._count.picks,
  );
  if (!turn) return null;
  return {
    pick: turn.pick,
    round: turn.round,
    playerId: draft.players[turn.seat].user.id,
  };
}

function toPickView(pick: LoggedPick): PickView {
  return {
    pick: pick.number,
    playerId: pick.player.userId,
    oracleId: pick.poolCard.oracleId,
    name: pick.poolCard.name,
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
    images: card.images as unknown as CardImages[],
  };
}
