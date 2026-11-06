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
import {
  SWISS_ROUND_OPTIONS,
  type CompleteRoundRequest,
  type DraftView,
  type GameScore,
  type GameScorePreview,
  type GameScorePreviewRequest,
  type GrantedDrawRequest,
  type GrantedWinRequest,
  type MatchDropRequest,
  type MatchReportRequest,
  type RequestProblem,
  type SwissRoundOption,
  type TournamentSetupRequest,
  type TournamentView,
} from 'contract';
import { SWISS_ROUND_CAP } from 'engine';
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
    const setup = parseSetup(body);
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.tournaments.setUp(id, setup));
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

  /**
   * What setting a match's game score to the body's, or clearing it when
   * they are null, would clear beyond it, changing nothing; for the
   * organizer, before correcting it.
   */
  @Post('matches/:matchId/game-score/preview')
  @HttpCode(200)
  async previewGameScore(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() body: unknown,
  ): Promise<GameScorePreview> {
    const { games } = bodyFields<GameScorePreviewRequest>(body);
    const parsed = games === null ? null : parseGames(body);
    await this.access.asOrganizer(user, id);
    return this.tournaments.previewGameScore(id, matchId, user.id, parsed);
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

  /**
   * Completes the tournament's current tournament round, settling its
   * unreported matches as the body lists them: in Swiss, granting draws
   * and dropping players; in single elimination, granting wins or dropping
   * players. It pairs the next one, or completes the tournament after the
   * last or once too few players are left. For the organizer.
   */
  @Post('complete-round')
  @HttpCode(200)
  async completeRound(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DraftView> {
    const request = parseCompleteRound(body);
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.tournaments.completeRound(id, request));
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

/**
 * The format, and for Swiss the round option, tournament setup chose, or a
 * 400 if either isn't one on offer.
 */
function parseSetup(body: unknown): TournamentSetupRequest {
  const { format, swissRoundOption } =
    bodyFields<Extract<TournamentSetupRequest, { format: 'Swiss' }>>(body);
  if (format === 'RoundRobin' || format === 'SingleElimination') {
    return { format };
  }
  if (format === 'Swiss' && isSwissRoundOption(swissRoundOption)) {
    return { format, swissRoundOption };
  }
  throw new BadRequestException({
    error: 'invalid',
    message: `Choose round robin, single elimination, or Swiss played until there’s a winner or capped at ${SWISS_ROUND_CAP} tournament rounds.`,
  } satisfies RequestProblem);
}

/**
 * The granted draws, with their drop choices, the granted wins, with
 * their winners, and the drops, with their players, that Complete round's
 * body lists for the tournament round's unreported matches; none of any it
 * leaves out. A 400 if they aren't match ids each with a list of user ids,
 * with a user id, or with one or two user ids.
 */
function parseCompleteRound(body: unknown): Required<CompleteRoundRequest> {
  const {
    grantedDraws = [],
    grantedWins = [],
    drops = [],
  } = bodyFields<CompleteRoundRequest>(body);
  if (
    Array.isArray(grantedDraws) &&
    grantedDraws.every(isGrantedDrawRequest) &&
    Array.isArray(grantedWins) &&
    grantedWins.every(isGrantedWinRequest) &&
    Array.isArray(drops) &&
    drops.every(isMatchDropRequest)
  ) {
    return { grantedDraws, grantedWins, drops };
  }
  throw new BadRequestException({
    error: 'invalid',
    message:
      'List each unreported match to grant a draw in, with the players to drop from it, to grant a win in, with its winner, or to drop one or both players from.',
  } satisfies RequestProblem);
}

function isMatchDropRequest(value: unknown): value is MatchDropRequest {
  const { matchId, drop } = bodyFields<MatchDropRequest>(value);
  return (
    typeof matchId === 'string' &&
    Array.isArray(drop) &&
    drop.length >= 1 &&
    drop.length <= 2 &&
    drop.every((playerId) => typeof playerId === 'string')
  );
}

function isGrantedWinRequest(value: unknown): value is GrantedWinRequest {
  const { matchId, winner } = bodyFields<GrantedWinRequest>(value);
  return typeof matchId === 'string' && typeof winner === 'string';
}

function isGrantedDrawRequest(value: unknown): value is GrantedDrawRequest {
  const { matchId, drop } = bodyFields<GrantedDrawRequest>(value);
  return (
    typeof matchId === 'string' &&
    Array.isArray(drop) &&
    drop.every((playerId) => typeof playerId === 'string')
  );
}

function isSwissRoundOption(value: unknown): value is SwissRoundOption {
  return (SWISS_ROUND_OPTIONS as readonly unknown[]).includes(value);
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
