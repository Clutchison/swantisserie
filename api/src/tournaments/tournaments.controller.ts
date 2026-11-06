import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type {
  DraftView,
  RequestProblem,
  TournamentFormat,
  TournamentSetupRequest,
  TournamentView,
} from 'contract';
import {
  CurrentUser,
  SessionGuard,
  type SessionUser,
} from '../auth/session.guard.js';
import { DraftAccess } from '../drafts/draft-access.js';
import { DraftErrorsFilter } from '../drafts/draft-errors.filter.js';
import { DraftPublisher } from '../drafts/draft-publisher.js';
import { bodyFields } from '../request-body.js';
import { TournamentsService } from './tournaments.service.js';

/**
 * A draft's tournament. Who may see or change it follows the draft's access
 * rules and draft powers (ADR 0003). Each change answers with the draft as
 * it now is, its version bumped, as the draft's other changes do.
 */
@Controller('drafts/:id/tournament')
@UseGuards(SessionGuard)
@UseFilters(DraftErrorsFilter)
export class TournamentsController {
  constructor(
    private readonly access: DraftAccess,
    private readonly tournaments: TournamentsService,
    private readonly publisher: DraftPublisher,
  ) {}

  /** The draft's tournament, for everyone who sees the draft once it exists. */
  @Get()
  async read(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<TournamentView> {
    await this.access.canSee(user, id);
    return this.tournaments.read(id);
  }

  /** Sets up the draft's tournament; for the organizer, once the draft is complete. */
  @Post()
  async setUp(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DraftView> {
    const format = parseFormat(body);
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.tournaments.setUp(id, format));
  }

  /** Cancels the draft's tournament during registration; for the organizer. */
  @Delete()
  async cancel(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.tournaments.cancel(id));
  }

  /** Joins the signed-in player to the draft's tournament, locking their deck. */
  @Post('entries')
  async join(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.canSee(user, id);
    return this.change(id, () => this.tournaments.join(id, user.id));
  }

  /**
   * Takes the player `playerId` (a Discord user id) out of the tournament:
   * the signed-in player leaving, or an organizer removing them.
   */
  @Delete('entries/:playerId')
  async removeEntry(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('playerId') playerId: string,
  ): Promise<DraftView> {
    if (playerId === user.id) await this.access.canSee(user, id);
    else await this.access.asOrganizer(user, id);
    return this.change(id, () => this.tournaments.removeEntry(id, playerId));
  }

  /** Applies `change` and answers with the draft as it now is, published to its viewers. */
  private async change(
    id: string,
    change: () => Promise<void>,
  ): Promise<DraftView> {
    await change();
    const draft = await this.publisher.publish(id, []);
    if (!draft) throw new NotFoundException();
    return draft;
  }
}

/** The format tournament setup chose, or a 400 if it isn't one on offer. */
function parseFormat(body: unknown): TournamentFormat {
  const { format } = bodyFields<TournamentSetupRequest>(body);
  if (format !== 'RoundRobin') {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Choose round robin.',
    } satisfies RequestProblem);
  }
  return format;
}
