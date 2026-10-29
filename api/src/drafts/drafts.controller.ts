import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { DraftState } from '../generated/prisma/client.js';
import {
  CurrentUser,
  SessionGuard,
  type SessionUser,
} from '../auth/session.guard.js';
import {
  DraftsService,
  type DraftWithOrganizer,
  type NewDraft,
  PoolQueryError,
  ScryfallUnavailableError,
} from './drafts.service.js';

const DEFAULT_PICKS_PER_PLAYER = 40;
const MAX_PICKS_PER_PLAYER = 100;
const MAX_NAME_LENGTH = 100;
/** Scryfall takes up to 1000 characters, and we wrap the query in more terms. */
const MAX_POOL_QUERY_LENGTH = 900;

export interface DraftView {
  id: string;
  name: string;
  poolQuery: string;
  picksPerPlayer: number;
  state: DraftState;
  organizer: { id: string; name: string };
  createdAt: Date;
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
        this.logger.error(err.message, err.cause);
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
    createdAt: draft.createdAt,
  };
}
