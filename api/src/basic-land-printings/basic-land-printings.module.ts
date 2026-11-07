import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ScryfallModule } from '../scryfall/scryfall.module.js';
import { SetsModule } from '../sets/sets.module.js';
import { BasicLandPrintingsController } from './basic-land-printings.controller.js';
import { BasicLandPrintings } from './basic-land-printings.js';

@Module({
  imports: [AuthModule, ScryfallModule, SetsModule],
  controllers: [BasicLandPrintingsController],
  providers: [BasicLandPrintings],
  // For preferred printings, which must be stored printings.
  exports: [BasicLandPrintings],
})
export class BasicLandPrintingsModule {}
