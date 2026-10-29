import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ScryfallModule } from '../scryfall/scryfall.module.js';
import { DraftsController } from './drafts.controller.js';
import { DraftsService } from './drafts.service.js';

@Module({
  imports: [AuthModule, ScryfallModule],
  controllers: [DraftsController],
  providers: [DraftsService],
})
export class DraftsModule {}
