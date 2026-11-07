import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Logger,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import type {
  BasicLand,
  CardImages,
  PreferredPrintingProblem,
  PreferredPrintingRequest,
  PreferredPrintings,
} from 'contract';
import {
  CurrentUser,
  SessionGuard,
  type SessionUser,
} from '../auth/session.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { bodyFields } from '../request-body.js';
import {
  type ScryfallCard,
  ScryfallClient,
  ScryfallUnavailableError,
} from '../scryfall/scryfall-client.js';
import { isBasicLand } from './basic-lands.js';
import { readPreferredPrintings } from './preferred-printings.js';

/** A Scryfall id is a UUID: anything else is no printing, so Scryfall isn't asked. */
const SCRYFALL_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The signed-in player's preferred printings, one per basic land at most,
 * which their plans, decks and decklists show in every draft. Each request
 * answers with all of them as they now are. A preferred printing changes
 * only how a land looks, so it may change in any draft state and while a
 * deck is locked.
 */
@Controller('preferred-printings')
@UseGuards(SessionGuard)
export class PreferredPrintingsController {
  private readonly logger = new Logger(PreferredPrintingsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scryfall: ScryfallClient,
  ) {}

  /**
   * Makes a printing, by Scryfall id, the player's preferred printing of
   * `land`, once Scryfall shows it is an English printing of that land.
   */
  @Put(':land')
  async set(
    @CurrentUser() user: SessionUser,
    @Param('land') land: string,
    @Body() body: unknown,
  ): Promise<PreferredPrintings> {
    const basic = parseLand(land);
    const scryfallId = parseScryfallId(body);
    const card = await this.lookUp(scryfallId);
    const images = card?.image_uris;
    if (
      !card ||
      !images ||
      !onCdn(images) ||
      card.name !== basic ||
      card.lang !== 'en'
    ) {
      throw invalid(`That isn’t an English printing of ${basic}.`);
    }
    const printing = {
      scryfallId: card.id,
      set: card.set,
      collectorNumber: card.collector_number,
      imageSmall: images.small,
      imageNormal: images.normal,
      imageLarge: images.large,
    };
    await this.prisma.preferredPrinting.upsert({
      where: { userId_land: { userId: user.id, land: basic } },
      create: { userId: user.id, land: basic, ...printing },
      update: printing,
    });
    return this.read(user.id);
  }

  /** Clears the player's preferred printing of `land`, so it shows its default printing. */
  @Delete(':land')
  async clear(
    @CurrentUser() user: SessionUser,
    @Param('land') land: string,
  ): Promise<PreferredPrintings> {
    const basic = parseLand(land);
    await this.prisma.preferredPrinting.deleteMany({
      where: { userId: user.id, land: basic },
    });
    return this.read(user.id);
  }

  private async read(userId: string): Promise<PreferredPrintings> {
    return (await readPreferredPrintings(this.prisma, [userId])).get(userId)!;
  }

  /** The printing on Scryfall, or null if there is none; a 502 if Scryfall can't be reached. */
  private async lookUp(scryfallId: string): Promise<ScryfallCard | null> {
    try {
      return await this.scryfall.card(scryfallId);
    } catch (err) {
      if (!(err instanceof ScryfallUnavailableError)) throw err;
      this.logger.error(err.message);
      throw new BadGatewayException({
        error: 'scryfall-unavailable',
        message: 'Scryfall could not be reached. Try again in a moment.',
      } satisfies PreferredPrintingProblem);
    }
  }
}

/** Whether every image is on Scryfall's CDN, which the web loads images from directly. */
function onCdn(images: CardImages): boolean {
  return [images.small, images.normal, images.large].every((url) =>
    url.startsWith('https://cards.scryfall.io/'),
  );
}

function invalid(message: string) {
  return new BadRequestException({
    error: 'invalid',
    message,
  } satisfies PreferredPrintingProblem);
}

/** The basic land named in the path, or a 400 if it isn't one. */
function parseLand(land: string): BasicLand {
  if (!isBasicLand(land)) throw invalid('Choose a basic land.');
  return land;
}

/** The Scryfall id to prefer, or a 400 if it isn't one. */
function parseScryfallId(body: unknown): string {
  const { scryfallId } = bodyFields<PreferredPrintingRequest>(body);
  if (typeof scryfallId !== 'string' || !SCRYFALL_ID.test(scryfallId)) {
    throw invalid('Choose a printing by its Scryfall id.');
  }
  return scryfallId;
}
