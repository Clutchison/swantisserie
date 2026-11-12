import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type {
  QueueOrderRequest,
  QueueUnpickedRequest,
  QueueView,
  RequestProblem,
  StealBehavior,
  StealBehaviorRequest,
} from 'contract';
import { bodyFields } from '../request-body.js';
import {
  CurrentUser,
  SessionGuard,
  type SessionUser,
} from '../auth/session.guard.js';
import { DraftAccess } from './draft-access.js';
import { DraftErrorsFilter } from './draft-errors.filter.js';
import { parseCard } from './parse-card.js';
import { QueuesService } from './queues.service.js';

/**
 * The signed-in player's queue in a draft, and their steal behavior. There
 * is no way to see anyone else's: a queue is private to its player.
 */
@Controller('drafts/:id/queue')
@UseGuards(SessionGuard)
@UseFilters(DraftErrorsFilter)
export class QueuesController {
  constructor(
    private readonly access: DraftAccess,
    private readonly queues: QueuesService,
  ) {}

  @Get()
  async queue(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<QueueView> {
    return this.answer(user, id, () => this.queues.queue(id, user.id));
  }

  /** Adds a pool card to the end of the queue. */
  @Post()
  @HttpCode(200)
  async add(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<QueueView> {
    const poolCardId = parseCard(body, 'Say which card to queue.');
    return this.answer(user, id, () =>
      this.queues.add(id, user.id, poolCardId),
    );
  }

  /**
   * Adds the plan's unpicked cards to the end of the queue: the
   * mainboard's, and the sideboard's if asked.
   */
  @Post('unpicked')
  @HttpCode(200)
  async addUnpicked(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<QueueView> {
    const includeSideboard = parseIncludeSideboard(body);
    return this.answer(user, id, () =>
      this.queues.addUnpicked(id, user.id, includeSideboard),
    );
  }

  /** Sets the queue's order, as every queued card's pool card id. */
  @Put()
  async reorder(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<QueueView> {
    const poolCardIds = parseOrder(body);
    return this.answer(user, id, () =>
      this.queues.reorder(id, user.id, poolCardIds),
    );
  }

  /** Sets what a lost card does to the rest of the queue. */
  @Put('steal-behavior')
  async setStealBehavior(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<QueueView> {
    const stealBehavior = parseStealBehavior(body);
    return this.answer(user, id, () =>
      this.queues.setStealBehavior(id, user.id, stealBehavior),
    );
  }

  /** Stops the Queue notice listing the lost and cleared cards. */
  @Delete('notice')
  async dismissNotice(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<QueueView> {
    return this.answer(user, id, () => this.queues.dismissNotice(id, user.id));
  }

  /** Takes a card out of the queue. Declared after `notice`, which it would match. */
  @Delete(':poolCardId')
  async remove(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('poolCardId') poolCardId: string,
  ): Promise<QueueView> {
    return this.answer(user, id, () =>
      this.queues.remove(id, user.id, poolCardId),
    );
  }

  /** Answers with the queue as `request` leaves it, or why it can’t. */
  private async answer(
    user: SessionUser,
    id: string,
    request: () => Promise<QueueView>,
  ): Promise<QueueView> {
    await this.access.canSee(user, id);
    return request();
  }
}

/** The queued cards' pool card ids, or a 400 if it isn't a list of distinct ids. */
function parseOrder(body: unknown): string[] {
  const { poolCardIds } = bodyFields<QueueOrderRequest>(body);
  if (
    !Array.isArray(poolCardIds) ||
    !poolCardIds.every((id) => typeof id === 'string') ||
    new Set(poolCardIds).size !== poolCardIds.length
  ) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'List each queued card once, in order.',
    } satisfies RequestProblem);
  }
  return poolCardIds;
}

/** Whether to queue the sideboard's unpicked cards too, or a 400 if it isn't said. */
function parseIncludeSideboard(body: unknown): boolean {
  const { includeSideboard } = bodyFields<QueueUnpickedRequest>(body);
  if (typeof includeSideboard !== 'boolean') {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Say whether to include the sideboard.',
    } satisfies RequestProblem);
  }
  return includeSideboard;
}

/** The steal behavior to set, or a 400 if it isn't one. */
function parseStealBehavior(body: unknown): StealBehavior {
  const { stealBehavior } = bodyFields<StealBehaviorRequest>(body);
  if (stealBehavior !== 'ClearQueue' && stealBehavior !== 'PickNext') {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Choose clear queue or pick next.',
    } satisfies RequestProblem);
  }
  return stealBehavior;
}
