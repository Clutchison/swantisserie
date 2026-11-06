import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  type HttpException,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type {
  NoMatchProblem,
  NoTournamentProblem,
  RequestProblem,
} from 'contract';
import { toHttpError } from '../drafts/draft-errors.filter.js';
import {
  InvalidTournamentRequestError,
  NoMatchError,
  NoTournamentError,
  TournamentRefusedError,
} from './tournament-errors.js';

/**
 * Answers the tournament routes' domain errors over HTTP, and the drafts
 * module's errors they share, such as a draft that is gone, as
 * DraftErrorsFilter does. Anything else is answered as Nest would without it.
 */
@Catch()
export class TournamentErrorsFilter extends BaseExceptionFilter {
  override catch(err: unknown, host: ArgumentsHost): void {
    super.catch(toTournamentHttpError(err) ?? toHttpError(err) ?? err, host);
  }
}

/**
 * The HTTP answer to a tournament error: 404 for `no-tournament` and
 * `no-match`, 409 for a refusal, 400 for an invalid request. Undefined for
 * any other error.
 */
function toTournamentHttpError(err: unknown): HttpException | undefined {
  if (err instanceof InvalidTournamentRequestError) {
    return new BadRequestException({
      error: 'invalid',
      message: err.message,
    } satisfies RequestProblem);
  }
  if (err instanceof TournamentRefusedError) {
    return new ConflictException(err.refusal);
  }
  if (err instanceof NoTournamentError) {
    return new NotFoundException({
      error: 'no-tournament',
      message: err.message,
    } satisfies NoTournamentProblem);
  }
  if (err instanceof NoMatchError) {
    return new NotFoundException({
      error: 'no-match',
      message: err.message,
    } satisfies NoMatchProblem);
  }
  return undefined;
}
