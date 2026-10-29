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
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type {
  DraftState,
  PoolCard,
  PoolSnapshotState,
} from '../generated/prisma/client.js';
import {
  CurrentUser,
  SessionGuard,
  type SessionUser,
} from '../auth/session.guard.js';
import {
  DraftStartedError,
  DraftsService,
  type DraftWithOrganizer,
  type NewDraft,
  PoolQueryError,
  ScryfallUnavailableError,
} from './drafts.service.js';
import { type CardImages, PoolFrozenError } from './pool-snapshot.service.js';
import { avatarUrl } from '../auth/avatar-url.js';

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

export interface DraftView {
  id: string;
  name: string;
  poolQuery: string;
  picksPerPlayer: number;
  state: DraftState;
  organizer: { id: string; name: string };
  snapshot: PoolSnapshotView;
  /** In join order. */
  players: PlayerView[];
  createdAt: Date;
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

  constructor(private readonly drafts: DraftsService) {}

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

  /** Starts the pool snapshot over; for the organizer, after a failure. */
  @Post(':id/snapshot')
  @HttpCode(202)
  async restartSnapshot(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    const draft = await this.findOr404(id);
    if (draft.organizerId !== user.id && !user.isAdmin) {
      throw new ForbiddenException();
    }
    try {
      await this.drafts.restartSnapshot(draft.id);
    } catch (err) {
      if (err instanceof PoolFrozenError) {
        throw new ConflictException({
          error: 'pool-frozen',
          message: err.message,
        });
      }
      throw err;
    }
    return toDraftView(await this.findOr404(id));
  }

  /** The signed-in role-holder joins the draft. */
  @Post(':id/players')
  async join(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.findOr404(id);
    await this.whileInLobby(() => this.drafts.join(id, user.id));
    return toDraftView(await this.findOr404(id));
  }

  /** The signed-in role-holder leaves the draft. */
  @Delete(':id/players/me')
  async leave(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.findOr404(id);
    await this.whileInLobby(() => this.drafts.leave(id, user.id));
    return toDraftView(await this.findOr404(id));
  }

  /** Turns a change refused because the draft has started into a 409. */
  private async whileInLobby(change: () => Promise<void>): Promise<void> {
    try {
      await change();
    } catch (err) {
      if (err instanceof DraftStartedError) {
        throw new ConflictException({
          error: 'draft-started',
          message: err.message,
        });
      }
      throw err;
    }
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
    createdAt: draft.createdAt,
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
