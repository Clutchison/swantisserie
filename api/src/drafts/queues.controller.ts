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
import type { QueueView } from 'contract';
import {
  CurrentUser,
  SessionGuard,
  type SessionUser,
} from '../auth/session.guard.js';
import { DraftReadsService } from './draft-reads.service.js';
import {
  NotAPlayerError,
  QueueChangedError,
  QueueRefusedError,
  QueuesService,
} from './queues.service.js';

/**
 * The signed-in player's queue in a draft. There is no way to see anyone
 * else's: a queue is private to its player.
 */
@Controller('drafts/:id/queue')
@UseGuards(SessionGuard)
export class QueuesController {
  constructor(
    private readonly reads: DraftReadsService,
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
    const poolCardId = parseCard(body);
    return this.answer(id, () => this.queues.add(id, user.id, poolCardId));
  }

  /** Sets the queue's order, as every queued card's pool card id. */
  @Put()
  async reorder(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<QueueView> {
    const poolCardIds = parseOrder(body);
    return this.answer(id, () => this.queues.reorder(id, user.id, poolCardIds));
  }

  /** Stops the Queue tab notice listing the lost and cleared cards. */
  @Delete('notice')
  async dismissNotice(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<QueueView> {
    return this.answer(id, () => this.queues.dismissNotice(id, user.id));
  }

  /** Takes a card out of the queue. Declared after `notice`, which it would match. */
  @Delete(':poolCardId')
  async remove(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('poolCardId') poolCardId: string,
  ): Promise<QueueView> {
    return this.answer(id, () => this.queues.remove(id, user.id, poolCardId));
  }

  /** Answers with the queue as `request` leaves it, or why it can’t. */
  private async answer(
    id: string,
    request: () => Promise<QueueView>,
  ): Promise<QueueView> {
    if (!(await this.reads.find(id))) throw new NotFoundException();
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

/** The pool card's id, or a 400 if there isn't one. */
function parseCard(body: unknown): string {
  const { poolCardId } = (body ?? {}) as Record<string, unknown>;
  if (typeof poolCardId !== 'string' || !poolCardId) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Say which card to queue.',
    });
  }
  return poolCardId;
}

/** The queued cards' pool card ids, or a 400 if it isn't a list of distinct ids. */
function parseOrder(body: unknown): string[] {
  const { poolCardIds } = (body ?? {}) as Record<string, unknown>;
  if (
    !Array.isArray(poolCardIds) ||
    !poolCardIds.every((id) => typeof id === 'string') ||
    new Set(poolCardIds).size !== poolCardIds.length
  ) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'List each queued card once, in order.',
    });
  }
  return poolCardIds;
}
