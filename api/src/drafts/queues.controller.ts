import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  SessionGuard,
  type SessionUser,
} from '../auth/session.guard.js';
import { DraftLobbyService } from './draft-lobby.service.js';
import {
  NotAPlayerError,
  QueueChangedError,
  QueueRefusedError,
  QueuesService,
  type QueueView,
} from './queues.service.js';

/**
 * The signed-in player's queue in a draft. There is no way to see anyone
 * else's: a queue is private to its player.
 */
@Controller('drafts/:id/queue')
@UseGuards(SessionGuard)
export class QueuesController {
  constructor(
    private readonly lobby: DraftLobbyService,
    private readonly queues: QueuesService,
  ) {}

  @Get()
  async queue(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<QueueView> {
    return this.answer(id, () => this.queues.queue(id, user.id));
  }

  /** Adds a pool card to the end of the queue. */
  @Post()
  @HttpCode(200)
  async add(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<QueueView> {
    const oracleId = parseCard(body);
    return this.answer(id, () => this.queues.add(id, user.id, oracleId));
  }

  /** Sets the queue's order, as every queued card's oracle id. */
  @Put()
  async reorder(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<QueueView> {
    const oracleIds = parseOrder(body);
    return this.answer(id, () => this.queues.reorder(id, user.id, oracleIds));
  }

  /** Forgets the cards lost from the queue. */
  @Delete('lost')
  async dismissLost(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<QueueView> {
    return this.answer(id, () => this.queues.dismissLost(id, user.id));
  }

  /** Takes a card out of the queue. Declared after `lost`, which it would match. */
  @Delete(':oracleId')
  async remove(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('oracleId') oracleId: string,
  ): Promise<QueueView> {
    return this.answer(id, () => this.queues.remove(id, user.id, oracleId));
  }

  /** Answers with the queue as `request` leaves it, or why it can’t. */
  private async answer(
    id: string,
    request: () => Promise<QueueView>,
  ): Promise<QueueView> {
    if (!(await this.lobby.find(id))) throw new NotFoundException();
    try {
      return await request();
    } catch (err) {
      if (err instanceof NotAPlayerError) {
        throw new ForbiddenException({
          error: 'not-a-player',
          message: err.message,
        });
      }
      if (err instanceof QueueChangedError) {
        throw new ConflictException({
          error: 'queue-changed',
          message: err.message,
        });
      }
      if (err instanceof QueueRefusedError) {
        if (err.refusal.error === 'not-in-pool') {
          throw new NotFoundException(err.refusal);
        }
        throw new ConflictException(err.refusal);
      }
      throw err;
    }
  }
}

/** The card's oracle id, or a 400 if there isn't one. */
function parseCard(body: unknown): string {
  const { oracleId } = (body ?? {}) as Record<string, unknown>;
  if (typeof oracleId !== 'string' || !oracleId) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Say which card to queue.',
    });
  }
  return oracleId;
}

/** The queued cards' oracle ids, or a 400 if it isn't a list of distinct ids. */
function parseOrder(body: unknown): string[] {
  const { oracleIds } = (body ?? {}) as Record<string, unknown>;
  if (
    !Array.isArray(oracleIds) ||
    !oracleIds.every((id) => typeof id === 'string') ||
    new Set(oracleIds).size !== oracleIds.length
  ) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'List each queued card once, in order.',
    });
  }
  return oracleIds;
}
