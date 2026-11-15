import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  Logger,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { SetCatalogProblem, SetCatalogView } from 'contract';
import { SessionGuard } from '../auth/session.guard.js';
import { Deadline, DeadlinePassedError } from '../deadline.js';
import { isPlatform, PLATFORMS } from '../drafts/platform.js';
import { ScryfallUnavailableError } from '../scryfall/scryfall-client.js';
import { SetCatalog } from './set-catalog.js';

/**
 * How long the picker's ask for the sets offered waits on Scryfall's list of
 * sets, as draft creation's checks do: under Heroku's 30 s router limit, past
 * which the router answers 503 with no reason.
 */
export const SETS_DEADLINE_MS = 25_000;

/** The sets a set list can be made of, for the create form's picker. */
@Controller('sets')
@UseGuards(SessionGuard)
export class SetsController {
  private readonly logger = new Logger(SetsController.name);

  constructor(private readonly catalog: SetCatalog) {}

  /**
   * The sets offered on the platform, as counted so far. Answers 502
   * `scryfall-unavailable` when Scryfall's list of sets can't be had within
   * SETS_DEADLINE_MS; a list still coming then fills the catalog's copy, for
   * the next ask.
   */
  @Get()
  async list(@Query('platform') platform: unknown): Promise<SetCatalogView> {
    if (!isPlatform(platform)) {
      throw new BadRequestException({
        error: 'invalid',
        message: `Choose ${PLATFORMS.join(' or ')}.`,
      } satisfies SetCatalogProblem);
    }
    const deadline = new Deadline('sets', SETS_DEADLINE_MS);
    try {
      return await deadline.race(this.catalog.options(platform), () =>
        ScryfallUnavailableError.tooSlow(
          deadline.name,
          new DeadlinePassedError(deadline.name),
        ),
      );
    } catch (err) {
      if (err instanceof ScryfallUnavailableError) {
        this.logger.error(err.message);
        throw new BadGatewayException({
          error: 'scryfall-unavailable',
          message: 'Scryfall could not be reached. Try again in a moment.',
        } satisfies SetCatalogProblem);
      }
      throw err;
    }
  }
}
