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
import type {
  BasicLand,
  PlanBoard,
  PlanMoveRequest,
  PlannedBasicCountRequest,
  PlanView,
} from 'contract';
import { bodyFields } from '../request-body.js';
import {
  CurrentUser,
  SessionGuard,
  type SessionUser,
} from '../auth/session.guard.js';
import { NotAPlayerError } from './draft-errors.js';
import { isBasicLand } from './basic-lands.js';
import { DraftReadsService } from './draft-reads.service.js';
import { parseCard } from './parse-card.js';
import { PlanRefusedError, PlansService } from './plans.service.js';

/**
 * The signed-in player's plan in a draft. There is no way to see anyone
 * else's: a plan is private to its player.
 */
@Controller('drafts/:id/plan')
@UseGuards(SessionGuard)
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
    const poolCardId = parseCard(body, 'Say which card to add.');
    return this.answer(id, () => this.plans.add(id, user.id, poolCardId));
  }

  /** Stops the Plan notice listing the lost cards. */
  @Delete('notice')
  async dismissNotice(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<PlanView> {
    return this.answer(id, () => this.plans.dismissNotice(id, user.id));
  }

  /** Sets how many copies of a basic land the mainboard holds. */
  @Put('basics/:land')
  async setBasic(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('land') land: string,
    @Body() body: unknown,
  ): Promise<PlanView> {
    const basic = parseLand(land);
    const count = parseCount(body);
    return this.answer(id, () =>
      this.plans.setBasic(id, user.id, basic, count),
    );
  }

  /** Takes every basic land out of the plan. Declared before `:poolCardId`, which would match it. */
  @Delete('basics')
  async clearBasics(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<PlanView> {
    return this.answer(id, () => this.plans.clearBasics(id, user.id));
  }

  /** Takes an unpicked card out of the plan. Declared after `notice` and `basics`, which it would match. */
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
  const { board } = bodyFields<PlanMoveRequest>(body);
  if (board !== 'Mainboard' && board !== 'Sideboard') {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Choose the mainboard or the sideboard.',
    });
  }
  return board;
}

/** The most copies of one basic land a plan holds. */
const MOST_BASICS = 99;

/** The basic land named in the path, or a 400 if it isn't one. */
function parseLand(land: string): BasicLand {
  if (!isBasicLand(land)) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Choose a basic land.',
    });
  }
  return land;
}

/** How many copies of a basic land to hold, or a 400 if it isn't a whole number up to MOST_BASICS. */
function parseCount(body: unknown): number {
  const { count } = bodyFields<PlannedBasicCountRequest>(body);
  if (
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > MOST_BASICS
  ) {
    throw new BadRequestException({
      error: 'invalid',
      message: `Choose a number of copies from 0 to ${MOST_BASICS}.`,
    });
  }
  return count;
}
