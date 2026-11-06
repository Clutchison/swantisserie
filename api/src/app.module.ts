import { DynamicModule, Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { HealthController } from './health/health.controller.js';
import { API_PREFIX } from './app.setup.js';
import { AppVersionModule } from './app-version/app-version.module.js';
import { AuthModule } from './auth/auth.module.js';
import { WebhooksModule } from './discord/webhooks.module.js';
import { DraftsModule } from './drafts/drafts.module.js';
import { FeedbackModule } from './feedback/feedback.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TournamentsModule } from './tournaments/tournaments.module.js';

export interface AppOptions {
  /** Directory holding the built Angular app. */
  webRoot: string;
}

@Module({})
export class AppModule {
  static register({ webRoot }: AppOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        PrismaModule,
        AuthModule,
        AppVersionModule,
        DraftsModule,
        TournamentsModule,
        FeedbackModule,
        WebhooksModule,
        ServeStaticModule.forRoot({
          rootPath: webRoot,
          exclude: [`/${API_PREFIX}/{*path}`],
        }),
      ],
      controllers: [HealthController],
    };
  }
}
