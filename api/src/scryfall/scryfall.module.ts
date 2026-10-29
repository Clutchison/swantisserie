import { Module } from '@nestjs/common';
import { FetchScryfallClient, ScryfallClient } from './scryfall-client.js';

@Module({
  // One client app-wide, so every search shares its rate limit.
  providers: [{ provide: ScryfallClient, useClass: FetchScryfallClient }],
  exports: [ScryfallClient],
})
export class ScryfallModule {}
