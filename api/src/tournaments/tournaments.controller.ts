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
  type DecklistView,
  type GrantedDrawRequest,
  type GrantedWinRequest,
  type MatchDropRequest,
  type MatchReportRequest,
  type RequestProblem,
  type SwissRoundOption,
  type TournamentSetupRequest,
  type ViewerTournamentView,
} from 'contract';
import { SWISS_ROUND_CAP } from 'engine';
import {
  CurrentUser,
  SessionGuard,
  type SessionUser,
} from '../auth/session.guard.js';
import { DraftAccess } from '../drafts/draft-access.js';
import type { DraftEvent } from '../drafts/draft-events.js';
import { DraftPublisher } from '../drafts/draft-publisher.js';
import { bodyFields } from '../request-body.js';
import { DecklistsService } from './decklists.service.js';
import { TournamentErrorsFilter } from './tournament-errors.filter.js';
import { TournamentProgressionService } from './tournament-progression.service.js';
import { TournamentReadsService } from './tournament-reads.service.js';
import { TournamentRegistrationService } from './tournament-registration.service.js';
import { TournamentResultsService } from './tournament-results.service.js';

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
    private readonly reads: TournamentReadsService,
    private readonly registration: TournamentRegistrationService,
    private readonly results: TournamentResultsService,
    private readonly progression: TournamentProgressionService,
    private readonly publisher: DraftPublisher,
    private readonly decklists: DecklistsService,
  ) {}

  /**
   * The draft's tournament, for everyone who sees the draft once it exists,
   * with whether the viewer may join it now.
   */
  @Get()
  async read(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<ViewerTournamentView> {
    await this.access.canSee(user, id);
    return this.reads.read(id, user.id);
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
    return this.change(id, () => this.registration.setUp(id, setup));
  }

  /** Cancels the draft's tournament during registration or play; for the organizer. */
  @Delete()
  async cancel(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.registration.cancel(id));
  }

  /** Joins the signed-in player to the draft's tournament again, during registration; their deck locks only at Start (ADR 0010). */
  @Post('entries')
  async join(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.canSee(user, id);
    return this.change(id, () => this.registration.join(id, user.id));
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
    return this.change(id, () => this.registration.removeEntry(id, playerId));
  }

  /**
   * Marks the signed-in player ready. It acts only on their own entry:
   * nobody, an organizer included, marks anyone else ready.
   */
  @Put('ready')
  async markReady(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.canSee(user, id);
    return this.change(id, () => this.registration.setReady(id, user.id, true));
  }

  /** Unmarks the signed-in player as ready, on their own entry only. */
  @Delete('ready')
  async unmarkReady(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.canSee(user, id);
    return this.change(id, () =>
      this.registration.setReady(id, user.id, false),
    );
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
    return this.change(id, () => this.progression.drop(id, playerId));
  }

  /** Reinstates the dropped player `playerId` (a Discord user id); for the organizer. */
  @Delete('entries/:playerId/drop')
  async reinstate(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('playerId') playerId: string,
  ): Promise<DraftView> {
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.progression.reinstate(id, playerId));
  }

  /** Starts the draft's tournament once 2 or more players have joined; for the organizer. */
  @Post('start')
  @HttpCode(200)
  async start(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.registration.start(id));
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
      this.results.report(id, matchId, user.id, games),
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
    return this.change(id, () => this.results.confirm(id, matchId, user.id));
  }

  /**
   * Corrects a match's game score, or reports it for its players, while
   * its tournament round is open, or in round robin while the tournament
   * is playing; for the organizer.
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
      this.results.setGameScore(id, matchId, user.id, games),
    );
  }

  /** Clears a match's game score, when the organizer could correct it; for the organizer. */
  @Delete('matches/:matchId/game-score')
  async clearGameScore(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('matchId') matchId: string,
  ): Promise<DraftView> {
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.results.clearGameScore(id, matchId));
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
    return this.change(id, () => this.progression.complete(id));
  }

  /**
   * Completes the tournament’s current tournament round, deciding its
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
    return this.change(id, () => this.progression.completeRound(id, request));
  }

  /**
   * Reopens the tournament's last completed tournament round, in Swiss or
   * single elimination, so its results can be corrected or cleared again;
   * for the organizer. It posts no announcement.
   */
  @Post('reopen-round')
  @HttpCode(200)
  async reopenRound(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DraftView> {
    await this.access.asOrganizer(user, id);
    return this.change(id, () => this.progression.reopenRound(id));
  }

  /**
   * The draft's decklists, for everyone who sees the draft, once its
   * tournament has started under public decklists, and for every
   * tournament once it is complete; never otherwise, to anyone, organizers
   * and app admins included (ADRs 0005 and 0017). Read-only.
   */
  @Get('decklists')
  async readDecklists(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<DecklistView[]> {
    await this.access.canSee(user, id);
    return this.decklists.read(id);
  }

  /**
   * Applies `change` and answers with the draft as it now is, published to
   * its viewers, with the announcements `change` returns, if any.
   */
  private async change(
    id: string,
    change: () => Promise<DraftEvent[] | void>,
  ): Promise<DraftView> {
    const events = (await change()) ?? [];
    const draft = await this.publisher.publish(id, events);
    if (!draft) throw new NotFoundException();
    return draft;
  }
}

/**
 * The format, for Swiss its Swiss round option, and whether it has public
 * decklists, as tournament setup chose them, or a 400 if one isn't on offer.
 */
function parseSetup(body: unknown): TournamentSetupRequest {
  const {
    format,
    swissRoundOption,
    publicDecklists = false,
  } = bodyFields<Extract<TournamentSetupRequest, { format: 'Swiss' }>>(body);
  if (typeof publicDecklists !== 'boolean') {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Choose whether the tournament has public decklists.',
    } satisfies RequestProblem);
  }
  if (format === 'RoundRobin' || format === 'SingleElimination') {
    return { format, publicDecklists };
  }
  if (format === 'Swiss' && isSwissRoundOption(swissRoundOption)) {
    return { format, swissRoundOption, publicDecklists };
  }
  throw new BadRequestException({
    error: 'invalid',
    message: `Choose round robin, single elimination, or Swiss played until there’s a winner or capped at ${SWISS_ROUND_CAP} tournament rounds.`,
  } satisfies RequestProblem);
}

/**
 * The tournament round Complete round's body names, and the granted draws,
 * with their drop choices, the granted wins, with their winners, and the
 * drops, with their players, that it lists for the tournament round's
 * unreported matches; none of any it leaves out. A 400 if the round isn't a
 * positive integer, or they aren't match ids each with a list of user ids,
 * with a user id, or with one or two user ids.
 */
function parseCompleteRound(body: unknown): Required<CompleteRoundRequest> {
  const {
    round,
    grantedDraws = [],
    grantedWins = [],
    drops = [],
  } = bodyFields<CompleteRoundRequest>(body);
  if (typeof round !== 'number' || !Number.isInteger(round) || round < 1) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Name the tournament round to complete.',
    } satisfies RequestProblem);
  }
  if (
    Array.isArray(grantedDraws) &&
    grantedDraws.every(isGrantedDrawRequest) &&
    Array.isArray(grantedWins) &&
    grantedWins.every(isGrantedWinRequest) &&
    Array.isArray(drops) &&
    drops.every(isMatchDropRequest)
  ) {
    return { round, grantedDraws, grantedWins, drops };
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
