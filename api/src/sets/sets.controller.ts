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
import { isPlatform, PLATFORMS } from '../drafts/platform.js';
import { ScryfallUnavailableError } from '../scryfall/scryfall-client.js';
import { SetCatalog } from './set-catalog.js';

/** The sets a set list can be made of, for the create form's picker. */
@Controller('sets')
@UseGuards(SessionGuard)
export class SetsController {
  private readonly logger = new Logger(SetsController.name);

  constructor(private readonly catalog: SetCatalog) {}

  /** The sets offered on the platform, as counted so far. */
  @Get()
  async list(@Query('platform') platform: unknown): Promise<SetCatalogView> {
    if (!isPlatform(platform)) {
      throw new BadRequestException({
        error: 'invalid',
        message: `Choose ${PLATFORMS.join(' or ')}.`,
      } satisfies SetCatalogProblem);
    }
    try {
      return await this.catalog.options(platform);
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
