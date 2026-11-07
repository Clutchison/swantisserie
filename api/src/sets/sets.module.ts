import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ScryfallModule } from '../scryfall/scryfall.module.js';
import { SetCatalog } from './set-catalog.js';
import { SetsController } from './sets.controller.js';

@Module({
  imports: [AuthModule, ScryfallModule],
  controllers: [SetsController],
  providers: [SetCatalog],
  // For drafts, which check a set list and snapshot its pool.
  exports: [SetCatalog],
})
export class SetsModule {}
