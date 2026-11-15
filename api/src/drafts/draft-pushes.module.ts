import { Module } from '@nestjs/common';
import { SessionModule } from '../auth/session.module.js';
import { DraftAccess } from './draft-access.js';
import { DraftPushes } from './draft-pushes.js';
import { DraftReadsService } from './draft-reads.service.js';
import { DraftsGateway } from './drafts.gateway.js';

/**
 * Pushing drafts to their viewers, and what that needs, apart from
 * DraftsModule: it sits below DiscordModule and AuthModule, which
 * DraftsModule imports, so the webhook notifier and sign-in can import it to
 * push the drafts they change without a module cycle. So nothing here may
 * import DiscordModule, AuthModule or DraftsModule.
 */
@Module({
  imports: [SessionModule],
  providers: [DraftAccess, DraftReadsService, DraftsGateway, DraftPushes],
  exports: [DraftAccess, DraftReadsService, DraftsGateway, DraftPushes],
})
export class DraftPushesModule {}
