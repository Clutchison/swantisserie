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
  BasicLand,
  PlanBoard,
  PlanMoveRequest,
  PlannedBasicCountRequest,
  PlanView,
  RequestProblem,
} from 'contract';
import { MOST_BASICS } from 'contract';
import { bodyFields } from '../request-body.js';
import {
  CurrentUser,
  SessionGuard,
  type SessionUser,
} from '../auth/session.guard.js';
import { isBasicLand } from './basic-lands.js';
import { DraftAccess } from './draft-access.js';
import { DraftErrorsFilter } from './draft-errors.filter.js';
import { parseCard } from './parse-card.js';
import { PlansService } from './plans.service.js';

/**
 * The signed-in player's plan in a draft. There is no way to see anyone
 * else's: a plan is private to its player.
 */
@Controller('drafts/:id/plan')
@UseGuards(SessionGuard)
@UseFilters(DraftErrorsFilter)
export class PlansController {
  constructor(
    private readonly access: DraftAccess,
    private readonly plans: PlansService,
  ) {}

  @Get()
  async plan(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<PlanView> {
    return this.answer(user, id, () => this.plans.plan(id, user.id));
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
    return this.answer(user, id, () => this.plans.add(id, user.id, poolCardId));
  }

  /** Stops the Plan notice listing the lost cards. */
  @Delete('notice')
  async dismissNotice(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<PlanView> {
    return this.answer(user, id, () => this.plans.dismissNotice(id, user.id));
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
    return this.answer(user, id, () =>
      this.plans.setBasic(id, user.id, basic, count),
    );
  }

  /** Takes every basic land out of the plan. Declared before `:poolCardId`, which would match it. */
  @Delete('basics')
  async clearBasics(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<PlanView> {
    return this.answer(user, id, () => this.plans.clearBasics(id, user.id));
  }

  /** Takes an unpicked card out of the plan. Declared after `notice` and `basics`, which it would match. */
  @Delete(':poolCardId')
  async remove(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('poolCardId') poolCardId: string,
  ): Promise<PlanView> {
    return this.answer(user, id, () =>
      this.plans.remove(id, user.id, poolCardId),
    );
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
    return this.answer(user, id, () =>
      this.plans.move(id, user.id, poolCardId, board),
    );
  }

  /** Answers with the plan as `request` leaves it, or why it can’t. */
  private async answer(
    user: SessionUser,
    id: string,
    request: () => Promise<PlanView>,
  ): Promise<PlanView> {
    await this.access.visible(user, id);
    return request();
  }
}

/** The board to move the card to, or a 400 if it isn't one. */
function parseBoard(body: unknown): PlanBoard {
  const { board } = bodyFields<PlanMoveRequest>(body);
  if (board !== 'Mainboard' && board !== 'Sideboard') {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Choose the mainboard or the sideboard.',
    } satisfies RequestProblem);
  }
  return board;
}

/** The basic land named in the path, or a 400 if it isn't one. */
function parseLand(land: string): BasicLand {
  if (!isBasicLand(land)) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Choose a basic land.',
    } satisfies RequestProblem);
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
    } satisfies RequestProblem);
  }
  return count;
}
