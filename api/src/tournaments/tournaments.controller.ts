import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type {
  DraftView,
  GameScore,
  MatchReportRequest,
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
import { DraftPublisher } from '../drafts/draft-publisher.js';
import { bodyFields } from '../request-body.js';
import { TournamentErrorsFilter } from './tournament-errors.filter.js';
import { TournamentsService } from './tournaments.service.js';

/**
 * A draft's tournament. Who may see or change it follows the draft's access
 * rules and draft powers (ADR 0003). Each change answers with the draft as
 * it now is, its version bumped, as the draft's other changes do.
 */
@Controller('drafts/:id/tournament')
@UseGuards(SessionGuard)
@UseFilters(TournamentErrorsFilter)
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

  /** Cancels the draft's tournament during registration or play; for the organizer. */
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

  /**
   * Drops the player `playerId` (a Discord user id) from the tournament
   * while it is playing: the signed-in player dropping, or an organizer
   * dropping them.
   */
  @Post('entries/:playerId/drop')
  @HttpCode(200)
  async drop(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('playerId') playerId: string,
  ): Promise<DraftView> {
    if (playerId === user.id) await this.access.canSee(user, id);
    else await this.access.asOrganizer(user, id);
    return this.change(id, () => this.tournaments.drop(id, playerId));
  }

  /** Reinstates the dropped player `playerId` (a Discord user id); for the organizer. */
  @Delete('entries/:playerId/drop')
  async reinstate(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('playerId') playerId: string,
  ): Promise<DraftView> {
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.tournaments.reinstate(id, playerId));
  }

  /** Starts the draft's tournament once 2 or more players have joined; for the organizer. */
  @Post('start')
  @HttpCode(200)
  async start(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.tournaments.start(id));
  }

  /** Reports a match's game score; for its players, while it is unreported. */
  @Post('matches/:matchId/report')
  @HttpCode(200)
  async report(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() body: unknown,
  ): Promise<DraftView> {
    const games = parseGames(body);
    await this.access.canSee(user, id);
    return this.change(id, () =>
      this.tournaments.report(id, matchId, user.id, games),
    );
  }

  /** Confirms a reported match's game score; for the player of it who didn't report it. */
  @Post('matches/:matchId/confirm')
  @HttpCode(200)
  async confirm(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('matchId') matchId: string,
  ): Promise<DraftView> {
    await this.access.canSee(user, id);
    return this.change(id, () =>
      this.tournaments.confirm(id, matchId, user.id),
    );
  }

  /**
   * Corrects a match's game score, or reports it for its players, even
   * once the tournament is complete; for the organizer.
   */
  @Put('matches/:matchId/game-score')
  async setGameScore(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() body: unknown,
  ): Promise<DraftView> {
    const games = parseGames(body);
    await this.access.asOrganizer(user, id);
    return this.change(id, () =>
      this.tournaments.setGameScore(id, matchId, user.id, games),
    );
  }

  /** Clears a match's game score, even once the tournament is complete; for the organizer. */
  @Delete('matches/:matchId/game-score')
  async clearGameScore(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('matchId') matchId: string,
  ): Promise<DraftView> {
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.tournaments.clearGameScore(id, matchId));
  }

  /**
   * Completes the round robin tournament, its unreported matches becoming
   * granted draws; for the organizer.
   */
  @Post('complete')
  @HttpCode(200)
  async complete(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.tournaments.complete(id));
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

/**
 * The game score a report names, each player's games won in the match's
 * player order, or a 400 if it isn't two whole numbers of games. Whether a
 * best-of-three match can end at it is the engine's call.
 */
function parseGames(body: unknown): GameScore {
  const { games } = bodyFields<MatchReportRequest>(body);
  if (
    !Array.isArray(games) ||
    games.length !== 2 ||
    !games.every((count) => Number.isInteger(count) && count >= 0)
  ) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Report each player’s games won, such as [2, 1].',
    } satisfies RequestProblem);
  }
  return [games[0], games[1]];
}
