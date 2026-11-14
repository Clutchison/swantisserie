import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
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
  PlanView,
  RequestProblem,
} from 'contract';
import { bodyFields } from '../request-body.js';
import {
  CurrentUser,
  SessionGuard,
  type SessionUser,
} from '../auth/session.guard.js';
import { isBasicLand } from './basic-lands.js';
import { isPlanBoard } from './plan-boards.js';
import { DraftAccess } from './draft-access.js';
import { DraftErrorsFilter } from './draft-errors.filter.js';
import { DraftLock } from './draft-lock.js';
import { DraftPublisher } from './draft-publisher.js';
import { parseCard } from './parse-card.js';
import { type PlanChange, PlansService } from './plans.service.js';

/**
 * The signed-in player's plan in a draft. There is no way to see anyone
 * else's: a plan is private to its player.
 */
@Controller('drafts/:id/plan')
@UseGuards(SessionGuard)
@UseFilters(DraftErrorsFilter)
export class PlansController {
  private readonly logger = new Logger(PlansController.name);

  constructor(
    private readonly access: DraftAccess,
    private readonly plans: PlansService,
    private readonly lock: DraftLock,
    private readonly publisher: DraftPublisher,
  ) {}

  @Get()
  async plan(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<PlanView> {
    await this.access.canSee(user, id);
    return this.plans.plan(id, user.id);
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
    return this.change(user, id, () => this.plans.add(id, user.id, poolCardId));
  }

  /** Stops the Deck notice listing the lost cards. */
  @Delete('notice')
  async dismissNotice(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<PlanView> {
    return this.change(user, id, () => this.plans.dismissNotice(id, user.id));
  }

  /** Takes down the Ready notice. Declared before `:poolCardId`, which would match it. */
  @Delete('ready-notice')
  async dismissReadyNotice(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<PlanView> {
    return this.change(user, id, () =>
      this.plans.dismissReadyNotice(id, user.id),
    );
  }

  /** Adds one copy of a basic land to the mainboard. */
  @Post('basics/:land')
  @HttpCode(200)
  async addBasic(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('land') land: string,
  ): Promise<PlanView> {
    const basic = parseLand(land);
    return this.change(user, id, () => this.plans.addBasic(id, user.id, basic));
  }

  /**
   * Moves one copy of a basic land to the plan board the body names, taking
   * it from the other.
   */
  @Put('basics/:land')
  async moveBasic(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('land') land: string,
    @Body() body: unknown,
  ): Promise<PlanView> {
    const basic = parseLand(land);
    const planBoard = parseBoard(body);
    return this.change(user, id, () =>
      this.plans.moveBasic(id, user.id, basic, planBoard),
    );
  }

  /** Takes every basic land out of the plan. Declared before `:poolCardId`, which would match it. */
  @Delete('basics')
  async clearBasics(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<PlanView> {
    return this.change(user, id, () => this.plans.clearBasics(id, user.id));
  }

  /** Takes one copy of a basic land off a plan board. */
  @Delete('basics/:land/:board')
  async removeBasic(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('land') land: string,
    @Param('board') planBoardName: string,
  ): Promise<PlanView> {
    const basic = parseLand(land);
    const planBoard = parsePlanBoard(planBoardName);
    return this.change(user, id, () =>
      this.plans.removeBasic(id, user.id, basic, planBoard),
    );
  }

  /** Takes an unpicked card out of the plan. Declared after `notice`, `ready-notice` and `basics`, which it would match. */
  @Delete(':poolCardId')
  async remove(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('poolCardId') poolCardId: string,
  ): Promise<PlanView> {
    return this.change(user, id, () =>
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
    const planBoard = parseBoard(body);
    return this.change(user, id, () =>
      this.plans.move(id, user.id, poolCardId, planBoard),
    );
  }

  /**
   * Answers with the plan as `request` leaves it, or why it can’t. A
   * change that cleared the player's ready changed the draft for everyone,
   * so its version is bumped and it is published, after the change has
   * committed: the change holds the draft row's share lock, which it can't
   * upgrade to bump the version without risking a deadlock against another
   * player's plan write. In the window between that commit and the bump,
   * a viewer reading the tournament already sees the clear; only the push
   * waits. A failed bump or publish is logged, not answered: the change is
   * committed, and the next bump brings viewers up to date.
   */
  private async change(
    user: SessionUser,
    id: string,
    request: () => Promise<PlanChange>,
  ): Promise<PlanView> {
    await this.access.canSee(user, id);
    const { plan, readyCleared } = await request();
    if (readyCleared) {
      try {
        await this.lock.bumpVersion(id);
        await this.publisher.publish(id, []);
      } catch (err) {
        this.logger.error(`Couldn’t publish a ready cleared in ${id}`, err);
      }
    }
    return plan;
  }
}

/** The plan board the body names to move to, or a 400 if it names none. */
function parseBoard(body: unknown): PlanBoard {
  return parsePlanBoard(bodyFields<PlanMoveRequest>(body).board);
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

/** `value` as a plan board, from a body or a path, or a 400 if it isn't one. */
function parsePlanBoard(value: unknown): PlanBoard {
  if (!isPlanBoard(value)) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Choose the mainboard or the sideboard.',
    } satisfies RequestProblem);
  }
  return value;
}
