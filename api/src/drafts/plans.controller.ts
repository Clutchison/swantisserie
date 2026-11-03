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
import type { PlanBoard, PlanView } from 'contract';
import { AdminGuard } from '../auth/admin.guard.js';
import { CurrentUser, type SessionUser } from '../auth/session.guard.js';
import { NotAPlayerError } from './draft-errors.js';
import { DraftReadsService } from './draft-reads.service.js';
import { PlanRefusedError, PlansService } from './plans.service.js';

/**
 * The signed-in player's plan in a draft. There is no way to see anyone
 * else's: a plan is private to its player.
 *
 * Gate: until every ticket under #171 is done, only app admins can use
 * plans, which is all AdminGuard adds over SessionGuard.
 */
@Controller('drafts/:id/plan')
@UseGuards(AdminGuard)
export class PlansController {
  constructor(
    private readonly reads: DraftReadsService,
    private readonly plans: PlansService,
  ) {}

  @Get()
  async plan(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<PlanView> {
    return this.answer(id, () => this.plans.plan(id, user.id));
  }

  /** Adds an unpicked copy of a pool card to the mainboard. */
  @Post()
  @HttpCode(200)
  async add(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<PlanView> {
    const poolCardId = parseCard(body);
    return this.answer(id, () => this.plans.add(id, user.id, poolCardId));
  }

  /** Stops the Plan notice listing the cards taken out of the plan. */
  @Delete('notice')
  async dismissNotice(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<PlanView> {
    return this.answer(id, () => this.plans.dismissNotice(id, user.id));
  }

  /** Takes an unpicked card out of the plan. Declared after `notice`, which it would match. */
  @Delete(':poolCardId')
  async remove(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('poolCardId') poolCardId: string,
  ): Promise<PlanView> {
    return this.answer(id, () => this.plans.remove(id, user.id, poolCardId));
  }

  /** Moves a card in the plan to the mainboard or the sideboard. */
  @Put(':poolCardId')
  async move(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('poolCardId') poolCardId: string,
    @Body() body: unknown,
  ): Promise<PlanView> {
    const board = parseBoard(body);
    return this.answer(id, () =>
      this.plans.move(id, user.id, poolCardId, board),
    );
  }

  /** Answers with the plan as `request` leaves it, or why it can’t. */
  private async answer(
    id: string,
    request: () => Promise<PlanView>,
  ): Promise<PlanView> {
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
      if (err instanceof PlanRefusedError) {
        if (err.refusal.error === 'not-in-pool') {
          throw new NotFoundException(err.refusal);
        }
        throw new ConflictException(err.refusal);
      }
      throw err;
    }
  }
}

/** The board to move the card to, or a 400 if it isn't one. */
function parseBoard(body: unknown): PlanBoard {
  const { board } = (body ?? {}) as Record<string, unknown>;
  if (board !== 'Mainboard' && board !== 'Sideboard') {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Choose the mainboard or the sideboard.',
    });
  }
  return board;
}

/** The pool card's id, or a 400 if there isn't one. */
function parseCard(body: unknown): string {
  const { poolCardId } = (body ?? {}) as Record<string, unknown>;
  if (typeof poolCardId !== 'string' || !poolCardId) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Say which card to add.',
    });
  }
  return poolCardId;
}
