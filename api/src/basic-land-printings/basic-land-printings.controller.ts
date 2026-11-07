import {
  BadRequestException,
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import type { BasicLandPrintingsView, RequestProblem } from 'contract';
import { SessionGuard } from '../auth/session.guard.js';
import { isBasicLand } from '../drafts/basic-lands.js';
import { BasicLandPrintings } from './basic-land-printings.js';

/** The stored basic land printings, for the Printing picker. */
@Controller('basic-land-printings')
@UseGuards(SessionGuard)
export class BasicLandPrintingsController {
  constructor(private readonly printings: BasicLandPrintings) {}

  /** One basic land's printings, newest set first: none until the first refresh has stored them. */
  @Get(':land')
  async list(@Param('land') land: string): Promise<BasicLandPrintingsView> {
    if (!isBasicLand(land)) {
      throw new BadRequestException({
        error: 'invalid',
        message: 'Choose a basic land.',
      } satisfies RequestProblem);
    }
    return { sets: await this.printings.sets(land) };
  }
}
