import { DynamicModule, Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { HealthController } from './health/health.controller.js';
import { API_PREFIX } from './app.setup.js';
import { AuthModule } from './auth/auth.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

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
        ServeStaticModule.forRoot({
          rootPath: webRoot,
          exclude: [`/${API_PREFIX}/{*path}`],
        }),
      ],
      controllers: [HealthController],
    };
  }
}
